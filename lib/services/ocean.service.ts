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

function getCompanyNameFromDomain(domain: string): string {
  const parts = domain.split(".");
  const namePart = parts[0] || "Target Company";
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

export async function findLookalikeCompanies(
  seedDomain: string
): Promise<LookalikeCompany[]> {
  try {
    const apiKey = process.env.OCEAN_API_KEY;
    if (!apiKey) {
      console.warn("OCEAN_API_KEY is not set. Falling back to seed domain.");
      return [
        {
          name: getCompanyNameFromDomain(seedDomain),
          domain: seedDomain,
        },
      ];
    }

    return await withRetry(async () => {
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
      const companies: LookalikeCompany[] = (data.companies ?? data.results ?? []).map(
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

      // Enforce no mock fallbacks: return seed domain if empty
      if (companies.length === 0) {
        console.warn(`[Ocean.io] API returned empty results for ${seedDomain}. Falling back to seed domain.`);
        return [
          {
            name: getCompanyNameFromDomain(seedDomain),
            domain: seedDomain,
          },
        ];
      }

      return companies;
    });
  } catch (err) {
    console.error(`[Ocean.io] API request failed, falling back to seed domain:`, err);
    return [
      {
        name: getCompanyNameFromDomain(seedDomain),
        domain: seedDomain,
      },
    ];
  }
}
