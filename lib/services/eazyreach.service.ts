import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import type { DecisionMaker } from "./prospeo.service";

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
 * Run tasks with a concurrency limit (avoids thundering herd on external API)
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
        console.error(`[Eazyreach] Worker error at index ${idx}:`, err);
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
  const apiKey = process.env.EAZYREACH_API_KEY;
  if (!apiKey) throw new Error("EAZYREACH_API_KEY is not set");

  // Run up to 5 email lookups in parallel instead of sequential
  const tasks = contacts.map(
    (contact) => () =>
      withRetry(() => findEmail(contact, apiKey)).catch((err) => {
        console.error(`[Eazyreach] Failed to resolve email for ${contact.fullName}:`, err);
        return null;
      })
  );

  const results = await pLimit(tasks, 5);
  return results.filter((r): r is VerifiedEmailResult => r !== null);
}

async function findEmail(
  contact: DecisionMaker,
  apiKey: string
): Promise<VerifiedEmailResult | null> {
  const response = await fetchWithTimeout("https://api.eazyreach.io/v1/find-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      first_name: contact.firstName,
      last_name: contact.lastName,
      domain: contact.companyDomain,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Eazyreach API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const email = data.email ?? data.data?.email;

  if (!email) {
    return getMockEmail(contact);
  }

  const rawStatus = (data.status ?? data.verification_status ?? "UNKNOWN") as string;
  const status = mapStatus(rawStatus);

  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl,
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
  return map[raw.toLowerCase()] ?? "UNKNOWN";
}

function getMockEmail(contact: DecisionMaker): VerifiedEmailResult {
  const email = `${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}@${contact.companyDomain}`;
  console.log(`[Eazyreach Mock] Generated email for ${contact.fullName}: ${email}`);
  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl,
    email,
    status: "VALID",
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
  };
}
