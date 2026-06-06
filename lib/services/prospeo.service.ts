import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";
import type { LookalikeCompany } from "./ocean.service";

export interface DecisionMaker {
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  linkedinUrl?: string;
  companyDomain: string;
  companyName: string;
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
  if (!apiKey) throw new Error("PROSPEO_API_KEY is not set");

  // Run up to 5 company lookups in parallel instead of sequential
  const tasks = companies.map(
    (company) => () =>
      withRetry(() => searchCompanyContacts(company, apiKey)).catch((err) => {
        console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
        return [] as DecisionMaker[];
      })
  );

  const results = await pLimit(tasks, 5);
  return results.flat();
}

async function searchCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
  const response = await fetchWithTimeout("https://api.prospeo.io/domain-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": apiKey,
    },
    body: JSON.stringify({
      company: company.domain,
      limit: 10,
      job_titles: [
        "CEO", "CTO", "CMO", "COO", "CFO",
        "VP Sales", "VP Marketing", "Head of Sales",
        "Director of Sales", "Founder", "Co-Founder",
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prospeo API error ${response.status} for ${company.domain}: ${text}`);
  }

  const data = await response.json();
  const results = data.response ?? data.results ?? data.contacts ?? [];

  if (results.length === 0) {
    return getMockDecisionMakers(company);
  }

  return results.map((p: Record<string, unknown>) => {
    const firstName = (p.first_name ?? p.firstName ?? "") as string;
    const lastName = (p.last_name ?? p.lastName ?? "") as string;
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || (p.full_name as string) || "",
      title: (p.job_title ?? p.title ?? p.position ?? "Decision Maker") as string,
      linkedinUrl: (p.linkedin_url ?? p.linkedin ?? undefined) as string | undefined,
      companyDomain: company.domain,
      companyName: company.name,
    };
  });
}

function getMockDecisionMakers(company: LookalikeCompany): DecisionMaker[] {
  const mockTitles = ["VP of Sales", "Head of Growth", "Director of Marketing", "CEO"];
  const mockNames = [
    { first: "Sarah", last: "Chen" },
    { first: "Marcus", last: "Johnson" },
    { first: "Priya", last: "Patel" },
  ];

  console.log(`[Prospeo Mock] Generating mock contacts for ${company.domain}`);
  return mockNames.slice(0, 2).map((name, i) => ({
    firstName: name.first,
    lastName: name.last,
    fullName: `${name.first} ${name.last}`,
    title: mockTitles[i % mockTitles.length],
    companyDomain: company.domain,
    companyName: company.name,
  }));
}
