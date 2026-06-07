export interface EmailCandidate {
  email: string;
  pattern: string;
  score: number; // 0 to 100
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Generate common corporate email patterns, score, and rank by likelihood.
 * If a known domain pattern exists, it prioritizes that candidate and scales down others.
 * This is a pure function and safe to run on both client and server.
 */
export function generateAndScorePatterns(
  firstName: string,
  lastName: string,
  domain: string,
  knownPattern?: string,
  knownConfidence?: "HIGH" | "MEDIUM" | "LOW"
): EmailCandidate[] {
  const first = firstName.toLowerCase().trim();
  const last = (lastName ?? "").toLowerCase().trim();
  const f = first.charAt(0);
  const l = last.charAt(0);
  const cleanDomain = domain.toLowerCase().trim();

  const candidates: EmailCandidate[] = [];

  const addCandidate = (
    email: string,
    pattern: string,
    defaultScore: number,
    defaultConfidence: "HIGH" | "MEDIUM" | "LOW"
  ) => {
    const isMatchingPattern = knownPattern && knownPattern === pattern;
    candidates.push({
      email,
      pattern,
      score: isMatchingPattern 
        ? 95 
        : Math.max(10, Math.round(defaultScore * 0.5)), // Heavily penalize non-matching candidates if a pattern is known
      confidence: isMatchingPattern 
        ? (knownConfidence ?? "HIGH") 
        : "LOW",
    });
  };

  // 1. first.last@domain.com
  if (first && last) {
    addCandidate(`${first}.${last}@${cleanDomain}`, "{first}.{last}", 85, "HIGH");
  }

  // 2. first@domain.com
  if (first) {
    addCandidate(`${first}@${cleanDomain}`, "{first}", 70, "HIGH");
  }

  // 3. flast@domain.com
  if (first && last) {
    addCandidate(`${f}${last}@${cleanDomain}`, "{f}{last}", 55, "MEDIUM");
  }

  // 4. first_last@domain.com
  if (first && last) {
    addCandidate(`${first}_${last}@${cleanDomain}`, "{first}_{last}", 50, "MEDIUM");
  }

  // 5. f.last@domain.com
  if (first && last) {
    addCandidate(`${f}.${last}@${cleanDomain}`, "{f}.{last}", 45, "MEDIUM");
  }

  // 6. firstlast@domain.com
  if (first && last) {
    addCandidate(`${first}${last}@${cleanDomain}`, "{first}{last}", 30, "LOW");
  }

  // 7. firstl@domain.com
  if (first && last) {
    addCandidate(`${first}${l}@${cleanDomain}`, "{first}{l}", 25, "LOW");
  }

  // 8. last.first@domain.com
  if (first && last) {
    addCandidate(`${last}.${first}@${cleanDomain}`, "{last}.{first}", 20, "LOW");
  }

  // 9. f_last@domain.com
  if (first && last) {
    addCandidate(`${f}_${last}@${cleanDomain}`, "{f}_{last}", 15, "LOW");
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score);
}
