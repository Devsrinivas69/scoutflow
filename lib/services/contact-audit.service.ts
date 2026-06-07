import { DecisionMaker } from "./prospeo.service";

export interface AuditedContact {
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  linkedinUrl?: string;
  companyDomain: string;
  companyName: string;
  qualityScore: number;
  status: "SELECTED" | "REJECTED";
  reason: string;
  duplicateStatus: "ORIGINAL" | "DUPLICATE";
}

const rejectKeywords = [
  "intern", "student", "trainee", "former", "retired", "freelance", 
  "advisor", "consultant", "contractor", "assistant", "volunteer", 
  "ex-employee", "ex-", "previous", "retired"
];

const priorityKeywords = [
  "ceo", "cto", "coo", "cfo", "founder", "co-founder", "president", 
  "vp", "vice president", "head of", "director", "manager", "lead", 
  "development", "growth", "sales", "marketing", "partner"
];

/**
 * Audit, validate, and score Prospeo contact results
 */
export function auditAndScoreContacts(
  contacts: DecisionMaker[],
  searchDomain: string
): AuditedContact[] {
  const cleanDomain = searchDomain.toLowerCase().replace(/^www\./, "").trim();
  const baseDomainName = cleanDomain.split(".")[0]; // e.g. "stripe" from "stripe.com"

  const seenNormalizedNames = new Set<string>();
  const seenLinkedInUrls = new Set<string>();

  return contacts.map((contact, index) => {
    let score = 100;
    let status: "SELECTED" | "REJECTED" = "SELECTED";
    let duplicateStatus: "ORIGINAL" | "DUPLICATE" = "ORIGINAL";
    const auditNotes: string[] = [];
    const rejectNotes: string[] = [];

    // 1. Company Match Validation
    const companyName = (contact.companyName ?? "").toLowerCase().trim();
    const companyDomain = (contact.companyDomain ?? "").toLowerCase().trim();
    
    const isDomainMatch = companyDomain.includes(baseDomainName) || cleanDomain.includes(companyDomain);
    const isNameMatch = companyName.includes(baseDomainName) || baseDomainName.includes(companyName);

    if (!isDomainMatch && !isNameMatch) {
      score = Math.max(0, score - 50);
      status = "REJECTED";
      rejectNotes.push(`Company mismatch ('${contact.companyName}' does not align with target '${cleanDomain}')`);
    } else {
      auditNotes.push("Company match verified");
    }

    // 2. Job Title Quality Filter
    const title = (contact.title ?? "").toLowerCase().trim();
    
    // Check reject keywords (Intern, former employee, etc)
    const matchedReject = rejectKeywords.find((kw) => title.includes(kw));
    if (matchedReject) {
      score = Math.max(0, score - 40);
      status = "REJECTED";
      rejectNotes.push(`Low-priority title keyword matched ('${matchedReject}')`);
    } else {
      // Check priority keywords (Founders, C-levels, heads)
      const isPriority = priorityKeywords.some((kw) => title.includes(kw));
      if (isPriority) {
        score = Math.min(100, score + 10);
        auditNotes.push(`Priority title matched ('${contact.title}')`);
      } else {
        auditNotes.push(`Standard title matched ('${contact.title}')`);
      }
    }

    // 3. LinkedIn Validation
    const hasLinkedIn = contact.linkedinUrl && !contact.linkedinUrl.startsWith("mock-");
    if (hasLinkedIn) {
      score = Math.min(100, score + 5);
      auditNotes.push("LinkedIn profile verified");
    } else {
      score = Math.max(0, score - 20);
      rejectNotes.push("Missing or invalid LinkedIn profile");
    }

    // 4. Data Completeness
    if (!contact.firstName || !contact.lastName) {
      score = Math.max(0, score - 15);
      rejectNotes.push("Incomplete contact name data");
    }

    // 5. Duplicate Detection (within current batch run)
    const normalizedName = `${contact.firstName.trim().toLowerCase()}_${(contact.lastName ?? "").trim().toLowerCase()}`;
    const cleanLinkedinUrl = contact.linkedinUrl ? contact.linkedinUrl.toLowerCase().trim() : null;

    const isDuplicateName = seenNormalizedNames.has(normalizedName);
    const isDuplicateLinkedin = cleanLinkedinUrl && !cleanLinkedinUrl.startsWith("mock-") && seenLinkedInUrls.has(cleanLinkedinUrl);

    if (isDuplicateName || isDuplicateLinkedin) {
      score = Math.max(0, score - 80);
      status = "REJECTED";
      duplicateStatus = "DUPLICATE";
      rejectNotes.push("Duplicate contact profile detected");
    } else {
      seenNormalizedNames.add(normalizedName);
      if (cleanLinkedinUrl && !cleanLinkedinUrl.startsWith("mock-")) {
        seenLinkedInUrls.add(cleanLinkedinUrl);
      }
    }

    // 6. Final Status check
    if (score < 60 && status !== "REJECTED") {
      status = "REJECTED";
      rejectNotes.push(`Quality score below acceptance threshold (${score}/100)`);
    }

    // Construct reasoning summary
    let reasonText = "";
    if (status === "SELECTED") {
      reasonText = `Selected: Approved decision maker. Score: ${score}/100. Notes: ${auditNotes.join("; ")}`;
    } else {
      reasonText = `Rejected: ${rejectNotes.join("; ")}. Score: ${score}/100.`;
    }

    return {
      firstName: contact.firstName,
      lastName: contact.lastName ?? "",
      fullName: contact.fullName,
      title: contact.title,
      linkedinUrl: contact.linkedinUrl,
      companyDomain: contact.companyDomain,
      companyName: contact.companyName,
      qualityScore: score,
      status,
      reason: reasonText,
      duplicateStatus,
    };
  });
}
