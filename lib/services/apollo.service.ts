import { fetchWithTimeout } from "@/lib/utils/retry";
import type { LookalikeCompany } from "./ocean.service";
import { getCached, setCached } from "@/lib/redis/cache";

import type { ProviderResult, DecisionMaker } from "./provider.interface";

export async function findDecisionMakersApollo(
  company: LookalikeCompany
): Promise<ProviderResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("APOLLO_API_KEY is not set. Returning empty result.");
    return {
      contacts: [],
      metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
      rawRequest: null,
      rawResponse: null,
      status: "api_error",
      errorMessage: "APOLLO_API_KEY is not set",
    };
  }

  try {
    return await searchCompanyContactsApollo(company, apiKey);
  } catch (err: any) {
    console.error(`[Apollo Fallback] Failed to search contacts for ${company.domain}:`, err);
    return {
      contacts: [],
      metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
      rawRequest: { organization_domains: [company.domain] },
      rawResponse: null,
      status: "api_error",
      errorMessage: err.message ?? "Unknown error",
    };
  }
}

async function searchCompanyContactsApollo(
  company: LookalikeCompany,
  apiKey: string
): Promise<ProviderResult> {
  const cacheKey = `apollo:contacts:${company.domain}`;
  const cached = await getCached<DecisionMaker[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Apollo contacts of domain: ${company.domain}`);
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
    console.warn(`[Postgres DB Cache] Failed to check database for existing contacts in Apollo:`, dbErr);
  }

  console.log(`[Apollo Fallback] Fetching contacts for ${company.domain}...`);
  const rawRequestPayload = {
    organization_domains: [company.domain],
    titles: [
      "CEO", "CTO", "CMO", "COO", "CFO",
      "VP Sales", "VP Marketing", "Head of Sales",
      "Director of Sales", "Founder", "Co-Founder",
      "VP of Sales", "Head of Growth", "Director of Marketing"
    ],
    page: 1,
    per_page: 20
  };

  const response = await fetchWithTimeout("https://api.apollo.io/api/v1/people/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(rawRequestPayload),
    timeoutMs: 20000,
  });

  if (!response.ok) {
    const text = await response.text();
    let status: "forbidden" | "rate_limited" | "api_error" = "api_error";
    if (response.status === 403 || text.includes("API_INACCESSIBLE") || text.includes("forbidden")) {
      status = "forbidden";
    } else if (response.status === 429) {
      status = "rate_limited";
    }
    return {
      contacts: [],
      metrics: { rawReturned: 0, parsed: 0, emailsReturned: 0, emailsParsed: 0 },
      rawRequest: rawRequestPayload,
      rawResponse: text,
      status,
      errorMessage: `Apollo API error ${response.status} for ${company.domain}: ${text}`,
    };
  }

  const data = await response.json();
  const rawPeople = data.people ?? data.contacts ?? [];
  let totalEmailsReturned = 0;

  const contacts = rawPeople.map((item: any) => {
    const firstName = (item.first_name ?? item.firstName ?? "") as string;
    const lastName = (item.last_name ?? item.lastName ?? "") as string;
    const email = (item.email ?? item.primary_email ?? item.email_address ?? undefined) as string | undefined;

    if (email) totalEmailsReturned++;

    return {
      firstName,
      lastName,
      fullName: item.name ?? `${firstName} ${lastName}`.trim() ?? "",
      title: (item.title ?? item.job_title ?? "Decision Maker") as string,
      linkedinUrl: (item.linkedin_url ?? item.linkedinUrl ?? undefined) as string | undefined,
      companyDomain: company.domain,
      companyName: company.name,
      email,
    };
  });

  await setCached(cacheKey, contacts, 86400); // 24-hour cache TTL
  const emailsParsed = contacts.filter((c: DecisionMaker) => c.email).length;

  return {
    contacts,
    metrics: {
      rawReturned: rawPeople.length,
      parsed: contacts.length,
      emailsReturned: totalEmailsReturned,
      emailsParsed,
    },
    rawRequest: rawRequestPayload,
    rawResponse: data,
    status: contacts.length > 0 ? "success" : "zero_results",
  };
}
