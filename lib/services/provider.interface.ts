import type { LookalikeCompany } from "./ocean.service";

export interface DecisionMaker {
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  linkedinUrl?: string;
  companyDomain: string;
  companyName: string;
  email?: string;
  personId?: string;
}

export interface DiscoveryMetric {
  rawReturned: number;
  parsed: number;
  emailsReturned: number;
  emailsParsed: number;
}

export interface ProviderResult {
  contacts: DecisionMaker[];
  metrics: DiscoveryMetric;
  rawRequest: any;
  rawResponse: any;
  status: "success" | "rate_limited" | "api_error" | "zero_results" | "forbidden";
  errorMessage?: string;
}
