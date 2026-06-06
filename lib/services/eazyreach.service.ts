export interface EmailCandidate {
  email: string;
  pattern: string;
  score: number; // 0 to 100
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

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
  patternUsed?: string;
  confidenceScore?: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Generate common corporate email patterns, score, and rank by likelihood.
 */
export function generateAndScorePatterns(
  firstName: string,
  lastName: string,
  domain: string
): EmailCandidate[] {
  const first = firstName.toLowerCase().trim();
  const last = (lastName ?? "").toLowerCase().trim();
  const f = first.charAt(0);
  const l = last.charAt(0);
  const cleanDomain = domain.toLowerCase().trim();

  const candidates: EmailCandidate[] = [];

  // 1. first.last@domain.com
  if (first && last) {
    candidates.push({
      email: `${first}.${last}@${cleanDomain}`,
      pattern: "{first}.{last}",
      score: 85,
      confidence: "HIGH",
    });
  }

  // 2. first@domain.com
  if (first) {
    candidates.push({
      email: `${first}@${cleanDomain}`,
      pattern: "{first}",
      score: 70,
      confidence: "HIGH",
    });
  }

  // 3. flast@domain.com
  if (first && last) {
    candidates.push({
      email: `${f}${last}@${cleanDomain}`,
      pattern: "{f}{last}",
      score: 55,
      confidence: "MEDIUM",
    });
  }

  // 4. first_last@domain.com
  if (first && last) {
    candidates.push({
      email: `${first}_${last}@${cleanDomain}`,
      pattern: "{first}_{last}",
      score: 50,
      confidence: "MEDIUM",
    });
  }

  // 5. f.last@domain.com
  if (first && last) {
    candidates.push({
      email: `${f}.${last}@${cleanDomain}`,
      pattern: "{f}.{last}",
      score: 45,
      confidence: "MEDIUM",
    });
  }

  // 6. firstlast@domain.com
  if (first && last) {
    candidates.push({
      email: `${first}${last}@${cleanDomain}`,
      pattern: "{first}{last}",
      score: 30,
      confidence: "LOW",
    });
  }

  // 7. firstl@domain.com
  if (first && last) {
    candidates.push({
      email: `${first}${l}@${cleanDomain}`,
      pattern: "{first}{l}",
      score: 25,
      confidence: "LOW",
    });
  }

  // 8. last.first@domain.com
  if (first && last) {
    candidates.push({
      email: `${last}.${first}@${cleanDomain}`,
      pattern: "{last}.{first}",
      score: 20,
      confidence: "LOW",
    });
  }

  // 9. f_last@domain.com
  if (first && last) {
    candidates.push({
      email: `${f}_${last}@${cleanDomain}`,
      pattern: "{f}_{last}",
      score: 15,
      confidence: "LOW",
    });
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score);
}

/**
 * Predicts and resolves work emails for a list of contacts.
 * Bypasses all external APIs and works completely locally.
 */
export async function resolveWorkEmails(
  contacts: Array<{
    firstName: string;
    lastName: string | null;
    fullName: string;
    title: string;
    linkedinUrl?: string;
    companyDomain: string;
    companyName: string;
  }>
): Promise<VerifiedEmailResult[]> {
  const results: VerifiedEmailResult[] = [];

  for (const contact of contacts) {
    if (!contact.firstName || !contact.companyDomain) {
      continue;
    }

    const candidates = generateAndScorePatterns(
      contact.firstName,
      contact.lastName ?? "",
      contact.companyDomain
    );

    if (candidates.length > 0) {
      const best = candidates[0]; // Highest score candidate
      results.push({
        contactFirstName: contact.firstName,
        contactLastName: contact.lastName ?? "",
        contactFullName: contact.fullName,
        contactTitle: contact.title,
        contactLinkedinUrl: contact.linkedinUrl,
        email: best.email,
        status: "UNKNOWN", // Since it is predicted, we set verification status to UNKNOWN
        companyDomain: contact.companyDomain,
        companyName: contact.companyName,
        patternUsed: best.pattern,
        confidenceScore: best.confidence,
      });
    }
  }

  return results;
}
