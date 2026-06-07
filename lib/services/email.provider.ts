import { sendSingleResendEmail, EmailRecipient, ResendSendResult } from "./resend.service";

export interface EmailSendResult {
  email: string;
  messageId?: string;
  success: boolean;
  error?: string;
  statusCode?: number;
  requestJson?: any;
  responseJson?: any;
}

export async function sendOutreachEmails(
  recipients: EmailRecipient[]
): Promise<EmailSendResult[]> {
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME;
  const replyTo = process.env.RESEND_REPLY_TO;

  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (!fromEmail) throw new Error("RESEND_FROM_EMAIL is not set");
  if (!fromName) throw new Error("RESEND_FROM_NAME is not set");

  console.log(`[EmailProvider] Outbound send triggered for ${recipients.length} recipients.`);

  const results: EmailSendResult[] = [];
  const processedEmails = new Set<string>();

  for (const recipient of recipients) {
    const email = recipient.email;
    let auditError: string | null = null;

    if (!email) {
      auditError = "Email address does not exist.";
    } else if (email.trim() === "") {
      auditError = "Email address is empty.";
    } else if (processedEmails.has(email.toLowerCase())) {
      auditError = `Duplicate email address in this batch: ${email}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      auditError = `Email format is invalid: ${email}`;
    }

    if (auditError) {
      console.warn(`[EmailProvider] Recipient audit failure: ${auditError}`);
      results.push({
        email: email || "unknown@example.com",
        success: false,
        error: `Invalid recipient: ${auditError}`,
        statusCode: 400,
        requestJson: null,
        responseJson: {
          requestBody: null,
          responseBody: { error: auditError },
          httpStatus: 400,
          resendErrorCode: "INVALID_RECIPIENT",
          resendErrorMessage: auditError,
          messageId: null,
          requestId: null,
          timestamp: new Date().toISOString(),
          recipient: email || "unknown@example.com",
        },
      });
      continue;
    }

    processedEmails.add(email.toLowerCase());

    const res = await sendSingleResendEmail(recipient, { 
      apiKey, 
      fromEmail, 
      fromName, 
      replyTo: replyTo || undefined 
    });
    
    results.push(res);
    await new Promise((r) => setTimeout(r, 200)); // Respect rate limiting
  }

  return results;
}
