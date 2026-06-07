import { fetchWithTimeout } from "@/lib/utils/retry";
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

export async function findDecisionMakersApollo(
  companies: LookalikeCompany[]
): Promise<DecisionMaker[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("APOLLO_API_KEY is not set. Returning empty array.");
    return [];
  }

  const results: DecisionMaker[] = [];
  for (const company of companies) {
    try {
      const contacts = await searchCompanyContactsApollo(company, apiKey);
      results.push(...contacts);
    } catch (err) {
      console.error(`[Apollo Fallback] Failed to search contacts for ${company.domain}:`, err);
    }
  }

  return results;
}

async function searchCompanyContactsApollo(
  company: LookalikeCompany,
  apiKey: string
): Promise<DecisionMaker[]> {
  const cacheKey = `apollo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Apollo contacts of domain: ${company.domain}`);
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
      console.log(`[Postgres DB Cache] Hit for Apollo contacts of domain: ${company.domain}. Found ${existingDbContacts.length} contacts.`);
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
    console.warn(`[Postgres DB Cache] Failed to check database for existing contacts in Apollo:`, dbErr);
  }

  console.log(`[Apollo Fallback] Fetching contacts for ${company.domain}...`);
  const response = await fetchWithTimeout("https://api.apollo.io/api/v1/contacts/search", {
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
      per_page: 20
    }),
    timeoutMs: 20000,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apollo API error ${response.status} for ${company.domain}: ${text}`);
  }

  const data = await response.json();
  const rawContacts = data.contacts ?? [];

  const contacts = rawContacts.map((item: any) => {
    const firstName = (item.first_name ?? "") as string;
    const lastName = (item.last_name ?? "") as string;
    return {
      firstName,
      lastName,
      fullName: item.name ?? `${firstName} ${lastName}`.trim() ?? "",
      title: (item.title ?? "Decision Maker") as string,
      linkedinUrl: (item.linkedin_url ?? undefined) as string | undefined,
      companyDomain: company.domain,
      companyName: company.name,
      email: (item.email ?? undefined) as string | undefined,
    };
  });

  await setCached(cacheKey, contacts, 86400); // 24-hour cache TTL
  return contacts;
}
