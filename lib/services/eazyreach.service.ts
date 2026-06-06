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
  sourceApi?: string;
  apiResponseId?: string;
  discoveryMethod?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        if (idx > 0) {
          // Introduce a 1.2s delay between sequential calls to stay under rate limits
          await sleep(1200);
        }
        results[idx] = await tasks[idx]();
      } catch (err) {
        console.error(`[Prospeo Enrich] Worker error at index ${idx}:`, err);
        results[idx] = null;
      }
    }
  }

  // Use concurrency of 1 to process sequentially and avoid rate limits
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function resolveWorkEmails(
  contacts: DecisionMaker[]
): Promise<VerifiedEmailResult[]> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) {
    console.warn("PROSPEO_API_KEY is not set. Cannot enrich emails.");
    return [];
  }

  // Run sequentially with concurrency 1
  const tasks = contacts.map(
    (contact) => () =>
      withRetry(() => findEmail(contact, apiKey)).catch((err) => {
        console.error(`[Prospeo Enrich] Failed to resolve email for ${contact.fullName}:`, err);
        return null;
      })
  );

  const results = await pLimit(tasks, 1);
  return results.filter((r): r is VerifiedEmailResult => r !== null);
}

async function findEmail(
  contact: DecisionMaker,
  apiKey: string
): Promise<VerifiedEmailResult | null> {
  const response = await fetchWithTimeout("https://api.prospeo.io/enrich-person", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": apiKey,
    },
    body: JSON.stringify({
      data: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        company_website: contact.companyDomain,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prospeo Enrich API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const person = data.person;
  if (!person) {
    return null;
  }

  const emailInfo = person.email;
  if (!emailInfo || !emailInfo.email) {
    return null;
  }

  const rawStatus = (emailInfo.status ?? "UNKNOWN") as string;
  const status = mapStatus(rawStatus);

  const personId = (person.person_id ?? person.id ?? contact.apiResponseId) as string | undefined;

  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl,
    email: emailInfo.email,
    status,
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
    sourceApi: "Prospeo",
    apiResponseId: personId,
    discoveryMethod: "enrich-person",
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
