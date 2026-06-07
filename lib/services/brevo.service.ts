import { fetchWithTimeout } from "@/lib/utils/retry";

export interface EmailRecipient {
  name: string;
  email: string;
  subject: string;
  body: string;
}

export interface BrevoSendResult {
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
): Promise<BrevoSendResult[]> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;

  if (!apiKey) throw new Error("BREVO_API_KEY is not set");
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not set");
  if (!senderName) throw new Error("BREVO_SENDER_NAME is not set");

  const results: BrevoSendResult[] = [];

  for (const recipient of recipients) {
    const result = await sendSingleEmail(recipient, { apiKey, senderEmail, senderName });
    results.push(result);

    // Respect rate limits: small delay between sends
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

async function sendSingleEmail(
  recipient: EmailRecipient,
  config: { apiKey: string; senderEmail: string; senderName: string }
): Promise<BrevoSendResult> {
  const payload = {
    sender: {
      name: config.senderName,
      email: config.senderEmail,
    },
    to: [{ email: recipient.email, name: recipient.name }],
    subject: recipient.subject,
    textContent: recipient.body,
    htmlContent: bodyToHtml(recipient.body),
  };

  try {
    const response = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });

    const statusCode = response.status;

    if (!response.ok) {
      const text = await response.text();
      let responseJson = null;
      try {
        responseJson = JSON.parse(text);
      } catch {
        responseJson = { errorText: text };
      }
      return {
        email: recipient.email,
        success: false,
        error: `Brevo API error ${statusCode}: ${text}`,
        statusCode,
        requestJson: payload,
        responseJson,
      };
    }

    const data = await response.json();
    
    if (!data.messageId) {
      return {
        email: recipient.email,
        success: false,
        error: "Brevo response did not return a valid messageId",
        statusCode,
        requestJson: payload,
        responseJson: data,
      };
    }

    console.log(`[Brevo API Send Success Log]
      Recipient: ${recipient.email}
      Subject: ${recipient.subject}
      Sender: ${config.senderName} <${config.senderEmail}>
      Message ID: ${data.messageId}
      Timestamp: ${new Date().toISOString()}`);

    return {
      email: recipient.email,
      messageId: data.messageId,
      success: true,
      statusCode,
      requestJson: payload,
      responseJson: data,
    };
  } catch (err: any) {
    return {
      email: recipient.email,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      requestJson: payload,
    };
  }
}

function bodyToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Inter,sans-serif;line-height:1.6;color:#1a1a2e;max-width:600px">${paragraphs}</div>`;
}
