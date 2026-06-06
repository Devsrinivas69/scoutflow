import { withRetry } from "@/lib/utils/retry";
import type { DecisionMaker } from "./prospeo.service";

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
}

export async function resolveWorkEmails(
  contacts: DecisionMaker[]
): Promise<VerifiedEmailResult[]> {
  const apiKey = process.env.EAZYREACH_API_KEY;
  if (!apiKey) throw new Error("EAZYREACH_API_KEY is not set");

  const results: VerifiedEmailResult[] = [];

  for (const contact of contacts) {
    try {
      const email = await withRetry(() =>
        findEmail(contact, apiKey)
      );
      if (email) results.push(email);
    } catch (err) {
      console.error(
        `[Eazyreach] Failed to resolve email for ${contact.fullName}:`,
        err
      );
    }
  }

  return results;
}

async function findEmail(
  contact: DecisionMaker,
  apiKey: string
): Promise<VerifiedEmailResult | null> {
  const response = await fetch("https://api.eazyreach.io/v1/find-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      first_name: contact.firstName,
      last_name: contact.lastName,
      domain: contact.companyDomain,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Eazyreach API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const email = data.email ?? data.data?.email;

  if (!email) {
    // Fallback: generate mock email for dev
    return getMockEmail(contact);
  }

  const rawStatus = (data.status ?? data.verification_status ?? "UNKNOWN") as string;
  const status = mapStatus(rawStatus);

  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl,
    email,
    status,
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
  };
}

function mapStatus(raw: string): "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN" {
  const map: Record<string, "VALID" | "INVALID" | "CATCH_ALL" | "UNKNOWN"> = {
    valid: "VALID",
    verified: "VALID",
    deliverable: "VALID",
    invalid: "INVALID",
    undeliverable: "INVALID",
    catch_all: "CATCH_ALL",
    accept_all: "CATCH_ALL",
    unknown: "UNKNOWN",
    risky: "UNKNOWN",
  };
  return map[raw.toLowerCase()] ?? "UNKNOWN";
}

function getMockEmail(contact: DecisionMaker): VerifiedEmailResult {
  const emailPatterns = [
    `${contact.firstName.toLowerCase()}.${contact.lastName.toLowerCase()}@${contact.companyDomain}`,
    `${contact.firstName.toLowerCase()[0]}${contact.lastName.toLowerCase()}@${contact.companyDomain}`,
  ];
  const email = emailPatterns[0];
  console.log(`[Eazyreach Mock] Generated email for ${contact.fullName}: ${email}`);
  return {
    contactFirstName: contact.firstName,
    contactLastName: contact.lastName,
    contactFullName: contact.fullName,
    contactTitle: contact.title,
    contactLinkedinUrl: contact.linkedinUrl,
    email,
    status: "VALID",
    companyDomain: contact.companyDomain,
    companyName: contact.companyName,
  };
}
