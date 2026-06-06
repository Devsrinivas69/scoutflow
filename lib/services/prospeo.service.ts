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
  if (!apiKey) {
    console.warn("PROSPEO_API_KEY is not set. Generating mock contacts for all companies.");
    return companies.flatMap(getMockDecisionMakers);
  }

  // Run up to 5 company lookups in parallel instead of sequential
  const tasks = companies.map(
    (company) => () =>
      withRetry(() => searchCompanyContacts(company, apiKey)).catch((err) => {
        console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
        return getMockDecisionMakers(company);
      })
  );

  const results = await pLimit(tasks, 5);
  return results.flat();
}

async function searchCompanyContacts(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
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
    return getMockDecisionMakers(company);
  }

  return results.map((item: any) => {
    const p = item.person ?? item ?? {};
    const firstName = (p.first_name ?? p.firstName ?? "") as string;
    const lastName = (p.last_name ?? p.lastName ?? "") as string;
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || (p.full_name as string) || "",
      title: (p.current_job_title ?? p.job_title ?? p.title ?? p.position ?? "Decision Maker") as string,
      linkedinUrl: (p.linkedin_url ?? p.linkedin ?? undefined) as string | undefined,
      companyDomain: company.domain,
      companyName: company.name,
    };
  });
}

function getDeterministicIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % max;
}

function getMockDecisionMakers(company: LookalikeCompany): DecisionMaker[] {
  const firstNames = ["John", "Sarah", "David", "Emma", "Michael", "Olivia", "James", "Sophia", "Robert", "Isabella", "William", "Mia", "Joseph", "Charlotte", "Daniel", "Amelia", "Thomas", "Harper", "Charles", "Evelyn"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"];
  const titles = ["CEO", "CTO", "VP of Sales", "Head of Growth", "Director of Marketing", "COO"];

  const hash1 = getDeterministicIndex(company.domain, firstNames.length);
  const hash2 = getDeterministicIndex(company.domain + "alt", lastNames.length);

  const contacts: DecisionMaker[] = [];
  
  // Person 1 (CEO / CTO / Founder)
  const fn1 = firstNames[hash1];
  const ln1 = lastNames[hash2];
  contacts.push({
    firstName: fn1,
    lastName: ln1,
    fullName: `${fn1} ${ln1}`,
    title: titles[getDeterministicIndex(company.domain, titles.length)],
    companyDomain: company.domain,
    companyName: company.name,
  });

  // Person 2 (Sales / Growth Lead / Marketing)
  const fn2 = firstNames[(hash1 + 7) % firstNames.length];
  const ln2 = lastNames[(hash2 + 13) % lastNames.length];
  contacts.push({
    firstName: fn2,
    lastName: ln2,
    fullName: `${fn2} ${ln2}`,
    title: "Head of Growth",
    companyDomain: company.domain,
    companyName: company.name,
  });

  console.log(`[Prospeo Mock] Dynamically generated ${contacts.length} mock contacts for ${company.domain}`);
  return contacts;
}
