import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import type { DecisionMaker } from "./prospeo.service";
import { getCached, setCached } from "@/lib/redis/cache";

export interface VerifiedEmailResult {
  contactFirstName: string;
  contactLastName: string;
  contactFullName: string;
  contactTitle: string;
  contactLinkedinUrl?: string;
  email: string;
  status: "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN";
  companyDomain: string;
  companyName: string;
}

/**
 * Run tasks with a concurrency limit
 */
async function pLimit<T>(
  tasks: (() => Promise<T | null>)[],
  concurrency: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        console.error(`[Enrichment] Worker error at index ${idx}:`, err);
        results[idx] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function resolveWorkEmails(
  contacts: DecisionMaker[]
): Promise<VerifiedEmailResult[]> {
  const apolloKey = process.env.APOLLO_API_KEY;
  const prospeoKey = process.env.PROSPEO_API_KEY;

  if (!apolloKey && !prospeoKey) {
    console.warn("Neither APOLLO_API_KEY nor PROSPEO_API_KEY is configured. Returning no emails.");
    return [];
  }

  // Use a concurrency limit of 1 (sequential) when falling back to Prospeo to avoid 429 rate limit triggers
  const concurrency = prospeoKey ? 1 : 5;

  const tasks = contacts.map(
    (contact) => async () => {
      const cacheKey = `enrich:email:${contact.companyDomain}:${contact.firstName.toLowerCase()}:${contact.lastName.toLowerCase()}`;
      const cached = await getCached<VerifiedEmailResult>(cacheKey);
      if (cached) {
        console.log(`[Redis Cache] Hit for email of: ${contact.fullName}`);
        return cached.email ? cached : null;
      }

      // 1. Try Apollo.io match
      if (apolloKey) {
        try {
          console.log(`[Apollo] Attempting lookup for ${contact.fullName} (${contact.companyDomain})...`);
          const result = await withRetry(() => findEmailWithApollo(contact, apolloKey));
          if (result && result.email) {
            await setCached(cacheKey, result, 86400);
            return result;
          }
        } catch (err: any) {
          const is403 = err instanceof Error && err.message.includes("403");
          if (is403) {
            console.warn(`[Apollo] Key restricted (403). Falling back to Prospeo for ${contact.fullName}.`);
          } else {
            console.error(`[Apollo] Failed resolving for ${contact.fullName}:`, err.message);
          }
        }
      }

      // 2. Fallback to Prospeo /enrich-person
      if (prospeoKey) {
        try {
          // Add a 1.2s delay to prevent Prospeo 429 rate limit issues
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const result = await withRetry(() => findEmailWithProspeo(contact, prospeoKey));
          if (result && result.email) {
            await setCached(cacheKey, result, 86400);
            return result;
          }
        } catch (err: any) {
          console.error(`[Prospeo Fallback] Failed resolving for ${contact.fullName}:`, err.message);
        }
      }

      console.log(`[Enrichment] No email resolved for ${contact.fullName}.`);
      const negativeResult: VerifiedEmailResult = {
        contactFirstName: contact.firstName,
        contactLastName: contact.lastName,
        contactFullName: contact.fullName,
        contactTitle: contact.title,
        email: "",
        status: "INVALID",
        companyDomain: contact.companyDomain,
        companyName: contact.companyName,
      };
      await setCached(cacheKey, negativeResult, 86400);
      return null;
    }
  );

  const results = await pLimit(tasks, concurrency);
  return results.filter((r): r is VerifiedEmailResult => r !== null);
}

async function findEmailWithApollo(
  contact: DecisionMaker,
  apiKey: string
): Promise<VerifiedEmailResult | null> {
  const response = await fetchWithTimeout("https://api.apollo.io/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      first_name: contact.firstName,
      last_name: contact.lastName,
      domain: contact.companyDomain,
      organization_domain: contact.companyDomain,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const email = data.person?.email;

  if (!email) {
    return null;
  }

  const rawStatus = (data.person?.email_status ?? "valid") as string;
  const status = mapStatus(rawStatus);

  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl || data.person?.linkedin_url,
    email,
    status,
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
  };
}

async function findEmailWithProspeo(
  contact: DecisionMaker,
  apiKey: string
): Promise<VerifiedEmailResult | null> {
  console.log(`[Prospeo Fallback] Resolving email for ${contact.fullName} via Prospeo /enrich-person...`);
  
  const response = await fetchWithTimeout("https://api.prospeo.io/enrich-person", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": apiKey,
    },
    body: JSON.stringify({
      only_verified_email: true,
      enrich_mobile: false,
      data: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        company_website: contact.companyDomain,
        ...(contact.linkedinUrl ? { linkedin_url: contact.linkedinUrl } : {}),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prospeo API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const email = data.person?.email ?? data.email;

  if (!email) {
    return null;
  }

  const rawStatus = (data.person?.email_status ?? "valid") as string;
  const status = mapStatus(rawStatus);

  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl || data.person?.linkedin_url,
    email,
    status,
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
  };
}

function mapStatus(raw: string): "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN" {
  const map: Record<string, "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN"> = {
    valid: "VALID",
    verified: "VALID",
    deliverable: "VALID",
    invalid: "INVALID",
    undeliverable: "INVALID",
    catch_all: "CATCH_ALL",
    accept_all: "CATCH_ALL",
    unknown: "UNKNOWN",
    risky: "UNKNOWN",
  };
  return map[raw.toLowerCase()] ?? "VALID";
}
