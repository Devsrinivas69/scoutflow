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
  sourceApi?: string;
  apiResponseId?: string;
  discoveryMethod?: string;
  selectedReason?: string;
}

const PRIORITIES = [
  "founder", "ceo", "chief executive", "co-founder",
  "cto", "chief technology", "coo", "chief operating", "cro", "chief revenue",
  "vp sales", "vice president of sales", "vp marketing", "vice president of marketing",
  "head of growth", "growth lead", "head of sales", "sales lead", "head of marketing",
  "director of sales", "director of marketing", "director of growth",
  "business development", "bizdev", "director"
];

function getTitlePriority(title: string): { priority: number; reason: string } | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  for (let i = 0; i < PRIORITIES.length; i++) {
    if (lower.includes(PRIORITIES[i])) {
      return {
        priority: i,
        reason: `Priority Title: ${PRIORITIES[i].toUpperCase()}`,
      };
    }
  }
  return null;
}

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
    console.warn("PROSPEO_API_KEY is not set. Returning empty list.");
    return [];
  }

  // Run up to 5 company lookups in parallel instead of sequential
  const tasks = companies.map(
    (company) => () =>
      withRetry(() => searchCompanyContacts(company, apiKey)).catch((err) => {
        console.error(`[Prospeo] Failed to get contacts for ${company.domain}:`, err);
        return [];
      })
  );

  const results = await pLimit(tasks, 5);
  const allContacts = results.flat();

  // Filter out irrelevant contacts & sort by priority
  const processedContacts = allContacts
    .map((c) => {
      const pMatch = getTitlePriority(c.title);
      if (!pMatch) return null;
      return {
        ...c,
        selectedReason: pMatch.reason,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => {
      const prioA = getTitlePriority(a.title)?.priority ?? 99;
      const prioB = getTitlePriority(b.title)?.priority ?? 99;
      return prioA - prioB;
    });

  console.log(`[Prospeo] Found & filtered ${processedContacts.length} total relevant contacts`);
  return processedContacts;
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
        }
      },
      limit: 15,
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

  return results.map((item: any) => {
    const p = item.person ?? item ?? {};
    const firstName = (p.first_name ?? p.firstName ?? "") as string;
    const lastName = (p.last_name ?? p.lastName ?? "") as string;
    const personId = (p.person_id ?? p.id ?? undefined) as string | undefined;

    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || (p.full_name as string) || "",
      title: (p.current_job_title ?? p.job_title ?? p.title ?? p.position ?? "Decision Maker") as string,
      linkedinUrl: (p.linkedin_url ?? p.linkedin ?? undefined) as string | undefined,
      companyDomain: company.domain,
      companyName: company.name,
      sourceApi: "Prospeo",
      apiResponseId: personId,
      discoveryMethod: "search-person",
    };
  });
}
