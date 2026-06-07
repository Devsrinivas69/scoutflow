import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import type { LookalikeCompany } from "./ocean.service";
import { getCached, setCached } from "@/lib/redis/cache";

export interface DecisionMaker {
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  linkedinUrl?: string;
  companyDomain: string;
  companyName: string;
  email?: string;
}

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
  companies: LookalikeCompany[]
): Promise<DecisionMaker[]> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) {
    console.warn("PROSPEO_API_KEY is not set. Returning empty array.");
    return [];
  }

  // Run sequentially (concurrency 1) with a 500ms delay to respect Prospeo API rate limits
  const tasks = companies.map(
    (company) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        return await searchCompanyContacts(company, apiKey);
      } catch (err) {
        if (err instanceof RateLimitError || (err instanceof Error && (err.message.includes("429") || err.message.toLowerCase().includes("rate limit")))) {
          throw err;
        }
        console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
        return [];
      }
    }
  );

  const results = await pLimit(tasks, 1);
  return results.flat();
}

async function searchCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
  if (process.env.MOCK_PROSPEO_429 === "true") {
    console.log(`[Simulation] Force Simulating Prospeo 429 Rate Limit for ${company.domain}`);
    throw new RateLimitError(`[Simulation] Prospeo API rate limit exceeded (429) for ${company.domain}`);
  }

  const cacheKey = `prospeo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Prospeo contacts of domain: ${company.domain}`);
    return cached;
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
      return contacts;
    }
  } catch (dbErr) {
    console.warn(`[Postgres DB Cache] Failed to check database for existing contacts:`, dbErr);
  }

  let currentPage = 1;
  let totalPages = 1;
  const maxPages = 20;
  const allContacts: DecisionMaker[] = [];

  while (currentPage <= totalPages) {
    if (currentPage > maxPages) {
      console.warn(`[Prospeo] Exceeded maxPages limit of ${maxPages} for ${company.domain}. Stopping pagination.`);
      break;
    }

    console.log(`[Prospeo] Fetching page ${currentPage} of ${totalPages} for ${company.domain}...`);
    const response = await fetchWithTimeout("https://api.prospeo.io/search-person", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KEY": apiKey,
      },
      body: JSON.stringify({
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
      }),
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
    const results = Array.isArray(data.response)
      ? data.response
      : (data.response?.results ?? data.results ?? data.contacts ?? []);

    const pageObj = data.pagination ?? data.response?.pagination;
    if (pageObj) {
      totalPages = pageObj.total_pages ?? pageObj.totalPages ?? 1;
    }

    if (results.length === 0) {
      break;
    }

    const contacts = results.map((item: any) => {
      const p = item.person ?? item ?? {};
      const firstName = (p.first_name ?? p.firstName ?? "") as string;
      const lastName = (p.last_name ?? p.lastName ?? "") as string;
      const email = (p.email ?? item.email ?? p.email_address ?? item.email_address ?? undefined) as string | undefined;
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
  return allContacts;
}
