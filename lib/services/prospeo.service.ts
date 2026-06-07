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
      return withRetry(() => searchCompanyContacts(company, apiKey)).catch((err) => {
        console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
        return [];
      });
    }
  );

  const results = await pLimit(tasks, 1);
  return results.flat();
}

async function searchCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
  const cacheKey = `prospeo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Prospeo contacts of domain: ${company.domain}`);
    return cached;
  }

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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prospeo API error ${response.status} for ${company.domain}: ${text}`);
  }

  const data = await response.json();
  const results = data.response ?? data.results ?? data.contacts ?? [];

  if (results.length === 0) {
    return [];
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

  await setCached(cacheKey, contacts, 86400); // 24-hour cache TTL
  return contacts;
}
