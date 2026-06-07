import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import type { LookalikeCompany } from "./ocean.service";
import { getCached, setCached } from "@/lib/redis/cache";
import type { ProviderResult, DecisionMaker } from "./provider.interface";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Run tasks with a concurrency limit (avoids thundering herd on external API)
 */
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function findDecisionMakers(
  company: LookalikeCompany
): Promise<ProviderResult> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) {
    console.warn("PROSPEO_API_KEY is not set. Returning empty result.");
    return {
      contacts: [],
      metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
      rawRequest: null,
      rawResponse: null,
      status: "api_error",
      errorMessage: "PROSPEO_API_KEY is not set",
    };
  }

  try {
    return await searchCompanyContacts(company, apiKey);
  } catch (err: any) {
    if (err instanceof RateLimitError || (err instanceof Error && (err.message.includes("429") || err.message.toLowerCase().includes("rate limit")))) {
      return {
        contacts: [],
        metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
        rawRequest: { filters: { company: { websites: { include: [company.domain] } } } },
        rawResponse: null,
        status: "rate_limited",
        errorMessage: err.message ?? "Rate limit exceeded (429)",
      };
    }
    console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
    return {
      contacts: [],
      metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
      rawRequest: { filters: { company: { websites: { include: [company.domain] } } } },
      rawResponse: null,
      status: "api_error",
      errorMessage: err.message ?? "Unknown error",
    };
  }
}

async function searchCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<ProviderResult> {
  if (process.env.MOCK_PROSPEO_429 === "true") {
    console.log(`[Simulation] Force Simulating Prospeo 429 Rate Limit for ${company.domain}`);
    throw new RateLimitError(`[Simulation] Prospeo API rate limit exceeded (429) for ${company.domain}`);
  }

  const cacheKey = `prospeo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Prospeo contacts of domain: ${company.domain}`);
    const emails = cached.filter((c: DecisionMaker) => c.email);
    return {
      contacts: cached,
      metrics: {
        rawReturned: cached.length,
        parsed: cached.length,
        emailsReturned: emails.length,
        emailsParsed: emails.length,
      },
      rawRequest: { cache: "redis", domain: company.domain },
      rawResponse: { cached: true },
      status: cached.length > 0 ? "success" : "zero_results",
    };
  }

  // Check Postgres DB cache for historical contacts of this domain
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const existingDbContacts = await prisma.contact.findMany({
      where: {
        company: {
          domain: company.domain
        }
      },
      include: {
        verifiedEmails: true
      }
    });

    if (existingDbContacts.length > 0) {
      console.log(`[Postgres DB Cache] Hit for Prospeo contacts of domain: ${company.domain}. Found ${existingDbContacts.length} contacts.`);
      const contacts = existingDbContacts.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName ?? "",
        fullName: c.fullName ?? `${c.firstName} ${c.lastName}`.trim(),
        title: c.title ?? "Decision Maker",
        linkedinUrl: c.linkedinUrl ?? undefined,
        companyDomain: company.domain,
        companyName: company.name,
        email: c.verifiedEmails[0]?.email ?? undefined,
      }));
      await setCached(cacheKey, contacts, 86400); // 24-hour cache TTL
      const emails = contacts.filter(c => c.email);
      return {
        contacts,
        metrics: {
          rawReturned: contacts.length,
          parsed: contacts.length,
          emailsReturned: emails.length,
          emailsParsed: emails.length,
        },
        rawRequest: { cache: "postgres", domain: company.domain },
        rawResponse: { cached: true },
        status: contacts.length > 0 ? "success" : "zero_results",
      };
    }
  } catch (dbErr) {
    console.warn(`[Postgres DB Cache] Failed to check database for existing contacts:`, dbErr);
  }

  let currentPage = 1;
  let totalPages = 1;
  const maxPages = 20;
  const allContacts: DecisionMaker[] = [];
  let rawRequestPayload: any = null;
  let rawResponsePayload: any = null;
  
  let totalRawReturned = 0;
  let totalEmailsReturned = 0;

  while (currentPage <= totalPages) {
    if (currentPage > maxPages) {
      console.warn(`[Prospeo] Exceeded maxPages limit of ${maxPages} for ${company.domain}. Stopping pagination.`);
      break;
    }

    console.log(`[Prospeo] Fetching page ${currentPage} of ${totalPages} for ${company.domain}...`);
    rawRequestPayload = {
      filters: {
        company: {
          websites: {
            include: [company.domain]
          }
        },
        person_title: {
          include: [
            "CEO", "CTO", "CMO", "COO", "CFO",
            "VP Sales", "VP Marketing", "Head of Sales",
            "Director of Sales", "Founder", "Co-Founder",
            "VP of Sales", "Head of Growth", "Director of Marketing"
          ]
        }
      },
      limit: 10,
      page: currentPage,
    };

    const response = await fetchWithTimeout("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": apiKey,
      },
      body: JSON.stringify(rawRequestPayload),
      timeoutMs: 20000,
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429) {
        throw new RateLimitError(`Prospeo API rate limit exceeded (429) for ${company.domain}`);
      }
      throw new Error(`Prospeo API error ${response.status} for ${company.domain}: ${text}`);
    }

    const data = await response.json();
    rawResponsePayload = data;

    const results = Array.isArray(data.response)
      ? data.response
      : (data.response?.results ?? data.results ?? data.contacts ?? []);

    const pageObj = data.pagination ?? data.response?.pagination;
    if (pageObj) {
      totalPages = pageObj.total_pages ?? pageObj.totalPages ?? 1;
    }

    totalRawReturned += results.length;

    if (results.length === 0) {
      break;
    }

    const contacts = results.map((item: any) => {
      const p = item.person ?? item ?? {};
      const firstName = (p.first_name ?? p.firstName ?? "") as string;
      const lastName = (p.last_name ?? p.lastName ?? "") as string;
      const email = (p.email ?? item.email ?? p.email_address ?? item.email_address ?? undefined) as string | undefined;
      
      if (email) totalEmailsReturned++;

      return {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim() || (p.full_name as string) || "",
        title: (p.current_job_title ?? p.job_title ?? p.title ?? p.position ?? "Decision Maker") as string,
        linkedinUrl: (p.linkedin_url ?? p.linkedin ?? undefined) as string | undefined,
        companyDomain: company.domain,
        companyName: company.name,
        email,
      };
    });

    allContacts.push(...contacts);
    currentPage++;
  }

  await setCached(cacheKey, allContacts, 86400); // 24-hour cache TTL
  const emailsParsed = allContacts.filter((c: DecisionMaker) => c.email).length;
  
  return {
    contacts: allContacts,
    metrics: {
      rawReturned: totalRawReturned,
      parsed: allContacts.length,
      emailsReturned: totalEmailsReturned,
      emailsParsed,
    },
    rawRequest: rawRequestPayload,
    rawResponse: rawResponsePayload,
    status: allContacts.length > 0 ? "success" : "zero_results",
  };
}
