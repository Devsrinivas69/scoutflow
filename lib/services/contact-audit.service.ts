import { DecisionMaker } from "./provider.interface";

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
  email?: string;
  rejectionReasonCategory?: "company_mismatch" | "title_keywords" | "missing_linkedin" | "incomplete_name" | "duplicate" | "low_score";
}

const rejectKeywords = [
  "intern", "student", "trainee", "former", "retired", "freelance", 
  "advisor", "consultant", "contractor", "assistant to", "executive assistant", "volunteer", 
  "ex-employee", "ex-", "previous"
];

const priorityKeywords = [
  "ceo", "cto", "coo", "cfo", "founder", "co-founder", "president", 
  "vp", "vice president", "head of", "director", "manager", "lead", 
  "development", "growth", "sales", "marketing", "partner"
];

/**
 * Extract root domain part to compare domains more robustly (e.g. sutherlandglobal.com vs sutherland.com)
 */
function extractDomainRoot(domain: string): string {
  const clean = domain.toLowerCase().replace(/^www\./, "").trim();
  const parts = clean.split(".");
  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2).join(".");
    const commonDoubleExtensions = ["co.uk", "org.uk", "com.br", "net.in", "co.in", "org.in", "gov.in", "ac.in"];
    if (commonDoubleExtensions.includes(lastTwo) && parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return parts[parts.length - 2];
  }
  return parts[0] || "";
}

/**
 * Score contact priority based on job titles
 */
function getContactPriorityScore(title: string): number {
  const t = title.toLowerCase();
  if (t.includes("founder") || t.includes("co-founder")) return 100;
  if (t.includes("ceo")) return 90;
  if (t.includes("cto")) return 80;
  if (t.includes("coo")) return 70;
  if (t.includes("vp sales") || t.includes("vp of sales") || t.includes("vice president of sales") || t.includes("vice president sales")) return 65;
  if (t.includes("head of growth") || t.includes("head of sales")) return 60;
  if (t.includes("director")) return 50;
  if (t.includes("cfo") || t.includes("c-level") || t.includes("president") || t.includes("cmo")) return 45;
  if (t.includes("vp") || t.includes("vice president")) return 40;
  if (t.includes("manager") || t.includes("head") || t.includes("lead")) return 30;
  return 10;
}

/**
 * Audit, validate, and score Prospeo contact results
 */
export function auditAndScoreContacts(
  contacts: DecisionMaker[],
  searchDomain: string
): AuditedContact[] {
  const cleanDomain = searchDomain.toLowerCase().replace(/^www\./, "").trim();
  const baseDomainName = cleanDomain.split(".")[0]; // e.g. "stripe" from "stripe.com"

  const seenEmails = new Set<string>();
  const seenLinkedInUrls = new Set<string>();
  const seenNameCompany = new Set<string>();

  // Sort contacts to prefer higher priority titles first:
  const sortedContacts = [...contacts].sort((a, b) => {
    return getContactPriorityScore(b.title) - getContactPriorityScore(a.title);
  });

  return sortedContacts.map((contact, index) => {
    let score = 100;
    let status: "SELECTED" | "REJECTED" = "SELECTED";
    let duplicateStatus: "ORIGINAL" | "DUPLICATE" = "ORIGINAL";
    let rejectionReasonCategory: AuditedContact["rejectionReasonCategory"] = undefined;
    const auditNotes: string[] = [];
    const rejectNotes: string[] = [];

    // 1. Company Match Validation (Relaxed to allow root domain intersections)
    const companyName = (contact.companyName ?? "").toLowerCase().trim();
    const companyDomain = (contact.companyDomain ?? "").toLowerCase().trim();
    
    const cleanDomainRoot = extractDomainRoot(cleanDomain);
    const companyDomainRoot = extractDomainRoot(companyDomain);
    
    const isDomainMatch = 
      companyDomainRoot === cleanDomainRoot || 
      companyDomainRoot.includes(cleanDomainRoot) || 
      cleanDomainRoot.includes(companyDomainRoot) ||
      companyDomain.includes(baseDomainName) || 
      cleanDomain.includes(companyDomain);

    const isNameMatch = 
      companyName.includes(baseDomainName) || 
      baseDomainName.includes(companyName) ||
      companyName.includes(cleanDomainRoot) ||
      cleanDomainRoot.includes(companyName);

    if (!isDomainMatch && !isNameMatch) {
      score = Math.max(0, score - 50);
      status = "REJECTED";
      rejectionReasonCategory = "company_mismatch";
      rejectNotes.push(`Company mismatch ('${contact.companyName}' / '${companyDomain}' does not align with target '${cleanDomain}')`);
    } else {
      auditNotes.push("Company match verified");
    }

    // 2. Job Title Quality Filter
    const title = (contact.title ?? "").toLowerCase().trim();
    
    // Check reject keywords (Intern, former employee, etc)
    const matchedReject = rejectKeywords.find((kw) => title.includes(kw));
    if (matchedReject && status !== "REJECTED") {
      score = Math.max(0, score - 40);
      status = "REJECTED";
      rejectionReasonCategory = "title_keywords";
      rejectNotes.push(`Low-priority title keyword matched ('${matchedReject}')`);
    } else if (!matchedReject) {
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
    const hasLinkedIn = !!contact.linkedinUrl;
    if (hasLinkedIn) {
      score = Math.min(100, score + 5);
      auditNotes.push("LinkedIn profile verified");
    } else {
      score = Math.max(0, score - 20);
      rejectNotes.push("Missing or invalid LinkedIn profile");
    }

    // 4. Data Completeness
    if ((!contact.firstName || !contact.lastName) && status !== "REJECTED") {
      score = Math.max(0, score - 15);
      rejectNotes.push("Incomplete contact name data");
    }

    // 5. Duplicate Detection (within current batch run)
    const email = contact.email ? contact.email.toLowerCase().trim() : null;
    const cleanLinkedinUrl = contact.linkedinUrl ? contact.linkedinUrl.toLowerCase().trim() : null;
    const normalizedName = `${contact.firstName.trim().toLowerCase()}_${(contact.lastName ?? "").trim().toLowerCase()}`;
    const nameCompanyKey = `${normalizedName}_${companyName}`;

    const isDuplicateEmail = email && seenEmails.has(email);
    const isDuplicateLinkedin = cleanLinkedinUrl && seenLinkedInUrls.has(cleanLinkedinUrl);
    const isDuplicateNameCompany = seenNameCompany.has(nameCompanyKey);

    if ((isDuplicateEmail || isDuplicateLinkedin || isDuplicateNameCompany) && status !== "REJECTED") {
      score = Math.max(0, score - 80);
      status = "REJECTED";
      duplicateStatus = "DUPLICATE";
      rejectionReasonCategory = "duplicate";
      rejectNotes.push("Duplicate contact profile detected");
    } else {
      if (email) seenEmails.add(email);
      if (cleanLinkedinUrl) {
        seenLinkedInUrls.add(cleanLinkedinUrl);
      }
      seenNameCompany.add(nameCompanyKey);
    }

    // 6. Final Status check
    if (score < 60 && status !== "REJECTED") {
      status = "REJECTED";
      rejectionReasonCategory = "low_score";
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
      email: contact.email,
      rejectionReasonCategory,
    };
  });
}
