import { withRetry, fetchWithTimeout } from "@/lib/utils/retry";

export interface LookalikeCompany {
  name: string;
  domain: string;
  industry?: string;
  headcount?: string;
  country?: string;
  website?: string;
  linkedinUrl?: string;
}

import { getCached, setCached } from "@/lib/redis/cache";

export async function findLookalikeCompanies(
  seedDomain: string
): Promise<LookalikeCompany[]> {
  const cacheKey = `ocean:lookalikes:${seedDomain}`;
  const cached = await getCached<LookalikeCompany[]>(cacheKey);
  if (cached) {
    console.log(`[Redis Cache] Hit for Ocean.io lookalikes of domain: ${seedDomain}`);
    return cached;
  }

  try {
    const apiKey = process.env.OCEAN_API_KEY;
    if (!apiKey) {
      console.warn("OCEAN_API_KEY is not set. Returning empty array.");
      return [];
    }

    const companies = await withRetry(async () => {
      const response = await fetchWithTimeout("https://api.ocean.io/v1/lookalikes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          domain: seedDomain,
          limit: 25,
          filters: {
            has_email: true,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Ocean.io API error ${response.status}: ${text}`
        );
      }

      const data = await response.json();

      // Map Ocean.io response to our normalized shape
      const mapped: LookalikeCompany[] = (data.companies ?? data.results ?? []).map(
        (c: Record<string, unknown>) => ({
          name: (c.name ?? c.company_name ?? "") as string,
          domain: (c.domain ?? c.website_domain ?? "") as string,
          industry: (c.industry ?? c.category ?? undefined) as string | undefined,
          headcount: (c.headcount ?? c.employee_count ?? undefined) as string | undefined,
          country: (c.country ?? (c.location as Record<string, unknown>)?.country ?? undefined) as string | undefined,
          website: (c.website ?? c.website_url ?? undefined) as string | undefined,
          linkedinUrl: (c.linkedin_url ?? c.linkedin ?? undefined) as string | undefined,
        })
      );

      return mapped;
    });

    await setCached(cacheKey, companies, 86400); // 24-hour cache TTL
    return companies;
  } catch (err) {
    console.error(`[Ocean.io] API request failed:`, err);
    return [];
  }
}
