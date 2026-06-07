import { prisma } from "@/lib/db/prisma";
import { getCached, setCached } from "@/lib/redis/cache";
import { fetchWithTimeout } from "@/lib/utils/retry";
import dns from "dns";

export interface DetectedPattern {
  pattern: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "HISTORICAL_DB" | "WEBSITE_SCRAPE" | "MX_FALLBACK" | "POPULARITY";
}

const generics = new Set([
  "info", "contact", "support", "sales", "hello", "jobs", "careers", 
  "press", "marketing", "billing", "admin", "help", "service", "team", 
  "hr", "office", "media", "privacy", "security", "webmaster", "legal", 
  "abuse", "status", "no-reply", "noreply", "hostmaster", "postmaster",
  "feedback", "connect", "join", "inbound", "outbound", "partners"
]);

/**
 * Clean domain for standard lookups
 */
function cleanDomainName(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").trim();
}

/**
 * Deduce pattern by matching a single email with a contact's first/last name
 */
export function deducePatternFromContact(
  email: string,
  firstName: string,
  lastName: string | null
): string | null {
  const localPart = email.split("@")[0].toLowerCase().trim();
  const first = firstName.toLowerCase().trim();
  const last = (lastName ?? "").toLowerCase().trim();
  const f = first.charAt(0);
  const l = last.charAt(0);

  if (!first) return null;

  if (last) {
    if (localPart === `${first}.${last}`) return "{first}.{last}";
    if (localPart === `${f}${last}`) return "{f}{last}";
    if (localPart === `${first}_${last}`) return "{first}_{last}";
    if (localPart === `${f}.${last}`) return "{f}.{last}";
    if (localPart === `${first}${last}`) return "{first}{last}";
    if (localPart === `${first}${l}`) return "{first}{l}";
    if (localPart === `${last}.${first}`) return "{last}.{first}";
    if (localPart === `${f}_${last}`) return "{f}_{last}";
  }
  if (localPart === first) return "{first}";

  return null;
}

/**
 * Heuristically classify an email address format without contact context
 */
export function classifyEmailLocalPart(localPart: string): string | null {
  const clean = localPart.toLowerCase().trim();
  if (generics.has(clean) || clean.length < 2) return null;

  if (/^[a-z]{2,}\.[a-z]{2,}$/.test(clean)) {
    return "{first}.{last}";
  }
  if (/^[a-z]{2,}_[a-z]{2,}$/.test(clean)) {
    return "{first}_{last}";
  }
  if (/^[a-z]\.[a-z]{2,}$/.test(clean)) {
    return "{f}.{last}";
  }
  if (/^[a-z]\_[a-z]{2,}$/.test(clean)) {
    return "{f}_{last}";
  }
  // Check if starts with a single char followed by a word (common signature for flast)
  if (/^[a-z][a-z]{4,}$/.test(clean)) {
    // We favor {first}.{last} or {first} normally, but in corporate settings this is often {f}{last}.
    // Heuristically label as {f}{last} if length > 5
    return clean.length >= 6 ? "{f}{last}" : "{first}";
  }
  if (/^[a-z]{3,5}$/.test(clean)) {
    return "{first}";
  }
  
  return null;
}

/**
 * Checks if the domain has valid mail servers configured (MX records)
 */
export async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const clean = cleanDomainName(domain);
    const records = await dns.promises.resolveMx(clean);
    return records && records.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * High-performance domain pattern detector service
 */
export async function detectDomainPattern(
  domain: string,
  contacts?: Array<{ firstName: string; lastName: string | null }>
): Promise<DetectedPattern | null> {
  const cleanDomain = cleanDomainName(domain);
  if (!cleanDomain) return null;

  const cacheKey = `pattern:${cleanDomain}`;

  // 1. Check Redis Cache
  const cached = await getCached<DetectedPattern>(cacheKey);
  if (cached) {
    console.log(`[Pattern Detector] Redis Cache Hit for ${cleanDomain}: ${cached.pattern} (${cached.confidence})`);
    return cached;
  }

  // 2. Check Database for Existing Successful Patterns (Historical Learning)
  try {
    const historicalEmails = await prisma.verifiedEmail.findMany({
      where: {
        contact: { company: { domain: cleanDomain } },
        status: { in: ["VALID", "CATCH_ALL"] }
      },
      include: { contact: true }
    });

    if (historicalEmails.length > 0) {
      const patternCounts: Record<string, number> = {};
      for (const ve of historicalEmails) {
        if (ve.patternUsed) {
          patternCounts[ve.patternUsed] = (patternCounts[ve.patternUsed] || 0) + 1;
        } else if (ve.contact) {
          const deduced = deducePatternFromContact(ve.email, ve.contact.firstName, ve.contact.lastName);
          if (deduced) {
            patternCounts[deduced] = (patternCounts[deduced] || 0) + 1;
          }
        }
      }

      const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
      if (sortedPatterns.length > 0) {
        const bestPattern = sortedPatterns[0][0];
        const result: DetectedPattern = {
          pattern: bestPattern,
          confidence: "HIGH",
          source: "HISTORICAL_DB"
        };
        
        await prisma.domainPattern.upsert({
          where: { domain: cleanDomain },
          create: { domain: cleanDomain, pattern: bestPattern, confidenceScore: "HIGH", source: "HISTORICAL_DB" },
          update: { pattern: bestPattern, confidenceScore: "HIGH", source: "HISTORICAL_DB" }
        }).catch(() => {});

        await setCached(cacheKey, result, 2592000); // 30-day cache TTL
        console.log(`[Pattern Detector] Inferred from Historical DB for ${cleanDomain}: ${bestPattern}`);
        return result;
      }
    }
  } catch (err) {
    console.error(`[Pattern Detector] Error reading historical DB for ${cleanDomain}:`, err);
  }

  // 3. Check DomainPattern knowledge base table (for previously scraped/cached patterns)
  try {
    const dbPattern = await prisma.domainPattern.findUnique({
      where: { domain: cleanDomain }
    });
    if (dbPattern) {
      const result: DetectedPattern = {
        pattern: dbPattern.pattern,
        confidence: dbPattern.confidenceScore as any,
        source: dbPattern.source as any
      };
      await setCached(cacheKey, result, 2592000);
      console.log(`[Pattern Detector] Knowledge Base Hit for ${cleanDomain}: ${dbPattern.pattern}`);
      return result;
    }
  } catch (err) {
    console.error(`[Pattern Detector] Error querying DomainPattern table for ${cleanDomain}:`, err);
  }

  // 4. Try Web Scraping (fetch home page / about page to detect public emails)
  try {
    const urls = [`https://${cleanDomain}`, `http://${cleanDomain}`];
    let html = "";
    let fetchSuccess = false;

    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(url, { method: "GET", timeoutMs: 3000 });
        if (response.ok) {
          html = await response.text();
          fetchSuccess = true;
          break;
        }
      } catch (err) {
        // Silent fail, try next protocol/url
      }
    }

    if (fetchSuccess && html) {
      // Find emails matching standard corporate structures
      const emailRegex = new RegExp(`[a-zA-Z0-9._%+-]+@${cleanDomain.replace(/\./g, "\\.")}`, "gi");
      const matchedEmails = html.match(emailRegex) || [];
      const patternCounts: Record<string, number> = {};

      for (const email of matchedEmails) {
        const localPart = email.split("@")[0].toLowerCase();
        
        // Match against provided contacts if available
        let deduced: string | null = null;
        if (contacts && contacts.length > 0) {
          for (const c of contacts) {
            deduced = deducePatternFromContact(email, c.firstName, c.lastName);
            if (deduced) break;
          }
        }
        
        // Fall back to heuristic classification
        if (!deduced) {
          deduced = classifyEmailLocalPart(localPart);
        }

        if (deduced) {
          patternCounts[deduced] = (patternCounts[deduced] || 0) + 1;
        }
      }

      const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
      if (sortedPatterns.length > 0) {
        const bestPattern = sortedPatterns[0][0];
        const result: DetectedPattern = {
          pattern: bestPattern,
          confidence: "MEDIUM",
          source: "WEBSITE_SCRAPE"
        };

        await prisma.domainPattern.upsert({
          where: { domain: cleanDomain },
          create: { domain: cleanDomain, pattern: bestPattern, confidenceScore: "MEDIUM", source: "WEBSITE_SCRAPE" },
          update: { pattern: bestPattern, confidenceScore: "MEDIUM", source: "WEBSITE_SCRAPE" }
        }).catch(() => {});

        await setCached(cacheKey, result, 2592000); // 30-day cache
        console.log(`[Pattern Detector] Scraped from Website for ${cleanDomain}: ${bestPattern}`);
        return result;
      }
    }
  } catch (err) {
    console.warn(`[Pattern Detector] Scraping failed for ${cleanDomain}:`, err);
  }

  // 5. Fallback: Perform MX resolution to verify domain validity, default to popular corporate formats
  const hasMx = await hasMxRecords(cleanDomain);
  if (hasMx) {
    // If the domain is valid, we use the fallback `{first}.{last}` as the most common corporate format
    const fallbackPattern = "{first}.{last}";
    const result: DetectedPattern = {
      pattern: fallbackPattern,
      confidence: "LOW",
      source: "MX_FALLBACK"
    };
    
    // Save to Redis and DB as LOW confidence fallback
    await prisma.domainPattern.upsert({
      where: { domain: cleanDomain },
      create: { domain: cleanDomain, pattern: fallbackPattern, confidenceScore: "LOW", source: "MX_FALLBACK" },
      update: { pattern: fallbackPattern, confidenceScore: "LOW", source: "MX_FALLBACK" }
    }).catch(() => {});

    await setCached(cacheKey, result, 2592000);
    console.log(`[Pattern Detector] Fallback resolved with MX for ${cleanDomain}: ${fallbackPattern}`);
    return result;
  }

  console.log(`[Pattern Detector] No pattern or active mail exchange servers found for ${cleanDomain}`);
  return null;
}
