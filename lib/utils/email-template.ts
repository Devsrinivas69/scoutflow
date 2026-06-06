export interface EmailTemplateData {
  contactName: string;
  firstName: string;
  title: string;
  companyName: string;
  companyDomain: string;
}

export function generateSubject(template: string, data: EmailTemplateData): string {
  return interpolate(template, data);
}

export function generateBody(template: string, data: EmailTemplateData): string {
  return interpolate(template, data);
}

function interpolate(template: string, data: EmailTemplateData): string {
  const record = data as unknown as Record<string, string>;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => record[key] ?? `{{${key}}}`);
}

export const DEFAULT_SUBJECT_TEMPLATE = "Quick idea for {{companyName}}";

export const DEFAULT_BODY_TEMPLATE = `Hi {{firstName}},

I noticed your role as {{title}} at {{companyName}}.

We help companies automate outbound prospecting and generate qualified meetings — without the manual work.

I came across {{companyDomain}} and thought ScoutFlow could be a great fit for your team.

Would you be open to a quick 15-minute call to explore?

Best regards,
ScoutFlow Team`;
