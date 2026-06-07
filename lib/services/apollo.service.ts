import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import { getCached, setCached } from "@/lib/redis/cache";
import type { LookalikeCompany } from "./ocean.service";

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
 * Run tasks with a concurrency limit
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

export async function findDecisionMakersApollo(
  companies: LookalikeCompany[]
): Promise<DecisionMaker[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("APOLLO_API_KEY is not set. Returning empty array.");
    return [];
  }

  const tasks = companies.map(
    (company) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return withRetry(() => searchApolloCompanyContacts(company, apiKey)).catch((err) => {
        console.error(`[Apollo] Failed to get contacts for ${company.domain}:`, err);
        return [];
      });
    }
  );

  const results = await pLimit(tasks, 1);
  return results.flat();
}

async function searchApolloCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
  const cacheKey = `apollo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Apollo contacts of domain: ${company.domain}`);
    return cached;
  }

  // 1. Search for people IDs using mixed_people/api_search
  const searchResponse = await fetchWithTimeout("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      q_organization_domains: company.domain,
      person_titles: [
        "CEO", "CTO", "CMO", "COO", "CFO",
        "VP Sales", "VP Marketing", "Head of Sales",
        "Director of Sales", "Founder", "Co-Founder",
        "VP of Sales", "Head of Growth", "Director of Marketing"
      ],
      page: 1,
      per_page: 10,
    }),
  });

  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`Apollo API Search error ${searchResponse.status} for ${company.domain}: ${text}`);
  }

  const searchData = await searchResponse.json();
  const searchPeople = searchData.people ?? [];
  if (searchPeople.length === 0) {
    return [];
  }

  const personIds = searchPeople.map((p: any) => p.id).filter(Boolean);
  if (personIds.length === 0) {
    return [];
  }

  // 2. Enrich people using people/bulk_match in batches (up to 10)
  const batchSize = 10;
  const enrichedPeople: any[] = [];

  for (let i = 0; i < personIds.length; i += batchSize) {
    const batchIds = personIds.slice(i, i + batchSize);

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const matchResponse = await fetchWithTimeout("https://api.apollo.io/api/v1/people/bulk_match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        ids: batchIds,
      }),
    });

    if (!matchResponse.ok) {
      const text = await matchResponse.text();
      console.error(`[Apollo] bulk_match batch error ${matchResponse.status}: ${text}`);
      continue;
    }

    const matchData = await matchResponse.json();
    const matches = matchData.people ?? matchData.matches ?? [];
    enrichedPeople.push(...matches);
  }

  const contacts: DecisionMaker[] = enrichedPeople
    .filter((p: any) => p && (p.first_name || p.name))
    .map((p: any) => {
      const firstName = (p.first_name ?? "").trim();
      const lastName = (p.last_name ?? "").trim();
      return {
        firstName,
        lastName,
        fullName: p.name || `${firstName} ${lastName}`.trim(),
        title: p.title || "Decision Maker",
        linkedinUrl: p.linkedin_url || undefined,
        companyDomain: company.domain,
        companyName: company.name,
        email: p.email || undefined,
      };
    });

  await setCached(cacheKey, contacts, 86400); // 24-hour cache TTL
  return contacts;
}
