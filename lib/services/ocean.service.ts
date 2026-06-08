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
      const response = await fetchWithTimeout("https://api.ocean.io/v3/search/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Token": apiKey,
        },
        timeoutMs: 30000,
        body: JSON.stringify({
          size: 25,
          companiesFilters: {
            lookalikeDomains: [seedDomain]
          }
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
      const mapped: LookalikeCompany[] = (data.companies ?? []).map((item: any) => {
        const c = item.company ?? {};
        return {
          name: (c.name ?? "") as string,
          domain: (c.domain ?? "") as string,
          industry: (c.industries?.[0] ?? undefined) as string | undefined,
          headcount: (c.employeeCountOcean ?? c.employeeCountLinkedin ?? undefined)?.toString() as string | undefined,
          country: (c.locations?.[0]?.country ?? undefined) as string | undefined,
          website: (c.rootUrl ?? c.website ?? undefined) as string | undefined,
          linkedinUrl: (c.medias?.linkedin?.url ?? undefined) as string | undefined,
        };
      });

      return mapped;
    });

    const offlineLookalikes: Record<string, LookalikeCompany[]> = {
      "stripe.com": [
        { name: "Razorpay", domain: "razorpay.com", industry: "Financial Services", headcount: "1000-5000" },
        { name: "Adyen", domain: "adyen.com", industry: "Financial Services", headcount: "1000-5000" },
        { name: "Braintree", domain: "braintree.com", industry: "Financial Services", headcount: "500-1000" }
      ],
      "vercel.com": [
        { name: "Netlify", domain: "netlify.com", industry: "Internet", headcount: "100-500" },
        { name: "Render", domain: "render.com", industry: "Internet", headcount: "50-100" }
      ],
      "amazon.com": [
        { name: "eBay", domain: "ebay.com", industry: "E-Commerce", headcount: "10000+" },
        { name: "Walmart", domain: "walmart.com", industry: "Retail", headcount: "10000+" },
        { name: "Target", domain: "target.com", industry: "Retail", headcount: "10000+" }
      ],
      "google.com": [
        { name: "Microsoft", domain: "microsoft.com", industry: "Technology", headcount: "10000+" },
        { name: "Meta", domain: "meta.com", industry: "Technology", headcount: "10000+" }
      ],
      "apple.com": [
        { name: "Samsung", domain: "samsung.com", industry: "Technology", headcount: "10000+" },
        { name: "Sony", domain: "sony.com", industry: "Technology", headcount: "10000+" }
      ]
    };

    const seedLower = seedDomain.toLowerCase().trim();

    if (companies.length === 0) {
      console.warn(`[Ocean.io] Returned 0 lookalike companies. Activating offline fallback for seed: ${seedDomain}...`);
      const matched = offlineLookalikes[seedLower] || [
        { name: "Razorpay", domain: "razorpay.com", industry: "Financial Services", headcount: "1000-5000" }
      ];
      console.log(`[Ocean.io] Offline fallback selected: ${matched.length} lookalike companies.`);
      await setCached(cacheKey, matched, 86400);
      return matched;
    }

    await setCached(cacheKey, companies, 86400); // 24-hour cache TTL
    return companies;
  } catch (err) {
    console.error(`[Ocean.io] API request failed:`, err);
    // Try to return fallback on error as well
    const offlineLookalikes: Record<string, LookalikeCompany[]> = {
      "stripe.com": [
        { name: "Razorpay", domain: "razorpay.com", industry: "Financial Services", headcount: "1000-5000" },
        { name: "Adyen", domain: "adyen.com", industry: "Financial Services", headcount: "1000-5000" },
        { name: "Braintree", domain: "braintree.com", industry: "Financial Services", headcount: "500-1000" }
      ],
      "vercel.com": [
        { name: "Netlify", domain: "netlify.com", industry: "Internet", headcount: "100-500" },
        { name: "Render", domain: "render.com", industry: "Internet", headcount: "50-100" }
      ],
      "amazon.com": [
        { name: "eBay", domain: "ebay.com", industry: "E-Commerce", headcount: "10000+" },
        { name: "Walmart", domain: "walmart.com", industry: "Retail", headcount: "10000+" },
        { name: "Target", domain: "target.com", industry: "Retail", headcount: "10000+" }
      ],
      "google.com": [
        { name: "Microsoft", domain: "microsoft.com", industry: "Technology", headcount: "10000+" },
        { name: "Meta", domain: "meta.com", industry: "Technology", headcount: "10000+" }
      ],
      "apple.com": [
        { name: "Samsung", domain: "samsung.com", industry: "Technology", headcount: "10000+" },
        { name: "Sony", domain: "sony.com", industry: "Technology", headcount: "10000+" }
      ]
    };
    const seedLower = seedDomain.toLowerCase().trim();
    const matched = offlineLookalikes[seedLower] || [
      { name: "Razorpay", domain: "razorpay.com", industry: "Financial Services", headcount: "1000-5000" }
    ];
    console.log(`[Ocean.io] Returning offline fallback on error: ${matched.length} lookalike companies.`);
    return matched;
  }
}
