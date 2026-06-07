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
  const replyToEmail = process.env.BREVO_REPLY_TO_EMAIL;

  if (!apiKey) throw new Error("BREVO_API_KEY is not set");
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL is not set");
  if (!senderName) throw new Error("BREVO_SENDER_NAME is not set");

  // Log environment runtime (excluding secrets)
  const envValidation = {
    BREVO_API_KEY_configured: !!apiKey,
    BREVO_SENDER_EMAIL_configured: !!senderEmail,
    BREVO_SENDER_NAME_configured: !!senderName,
    BREVO_REPLY_TO_EMAIL_configured: !!replyToEmail,
    BREVO_API_KEY_preview: apiKey ? `${apiKey.substring(0, 15)}...` : null,
    BREVO_SENDER_EMAIL_val: senderEmail || null,
    BREVO_SENDER_NAME_val: senderName || null,
    BREVO_REPLY_TO_EMAIL_val: replyToEmail || null,
    environment: process.env.NODE_ENV || "unknown",
    platform: process.env.RAILWAY_STATIC_URL ? "Railway" : process.env.DOCKER_CONTAINER ? "Docker" : "Other/Local",
  };
  console.log(`[Brevo Trace] Environment values verified:`, envValidation);

  console.log(`[Brevo Trace Step 2/8] Recipient selection: auditing ${recipients.length} recipients...`);

  const results: BrevoSendResult[] = [];
  const processedEmails = new Set<string>();

  for (const recipient of recipients) {
    const email = recipient.email;
    let auditError: string | null = null;

    if (!email) {
      auditError = "Email address does not exist (null or undefined).";
    } else if (email.trim() === "") {
      auditError = "Email address is empty.";
    } else if (processedEmails.has(email.toLowerCase())) {
      auditError = `Duplicate recipient email: ${email}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      auditError = `Email format is invalid or malformed: ${email}`;
    }

    if (auditError) {
      console.warn(`[Brevo Trace] Recipient audit failure: ${auditError}`);
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
          brevoErrorCode: "INVALID_RECIPIENT",
          brevoErrorMessage: auditError,
          messageId: null,
          timestamp: new Date().toISOString(),
          recipientCount: 0,
        },
      });
      continue;
    }

    processedEmails.add(email.toLowerCase());

    console.log(`[Brevo Trace Step 3/8] Email generation: Preparing content for ${email}...`);
    const result = await sendSingleEmail(recipient, { apiKey, senderEmail, senderName, replyToEmail });
    results.push(result);

    // Respect rate limits: small delay between sends
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

async function sendSingleEmail(
  recipient: EmailRecipient,
  config: { apiKey: string; senderEmail: string; senderName: string; replyToEmail?: string }
): Promise<BrevoSendResult> {
  const payload = {
    sender: {
      name: config.senderName,
      email: config.senderEmail,
    },
    to: [{ email: recipient.email, name: recipient.name }],
    ...(config.replyToEmail ? { replyTo: { email: config.replyToEmail, name: config.senderName } } : {}),
    subject: recipient.subject,
    textContent: recipient.body,
    htmlContent: bodyToHtml(recipient.body),
  };

  console.log(`[Brevo Trace Step 4/8] Brevo Payload construction for ${recipient.email}:`, JSON.stringify({
    ...payload,
    textContent: payload.textContent ? payload.textContent.substring(0, 60) + "..." : null,
    htmlContent: payload.htmlContent ? payload.htmlContent.substring(0, 60) + "..." : null,
  }, null, 2));

  // Pre-flight payload validation
  const payloadError = validateBrevoPayload(payload);
  if (payloadError) {
    console.error(`[Brevo Trace] Payload validation failed for ${recipient.email}: ${payloadError}`);
    return {
      email: recipient.email,
      success: false,
      statusCode: 400,
      requestJson: payload,
      responseJson: {
        requestBody: payload,
        responseBody: { error: payloadError },
        httpStatus: 400,
        brevoErrorCode: "INVALID_PAYLOAD",
        brevoErrorMessage: payloadError,
        messageId: null,
        timestamp: new Date().toISOString(),
        recipientCount: payload.to.length,
      },
      error: payloadError,
    };
  }

  console.log(`[Brevo Trace Step 5/8] Brevo API request: POST to https://api.brevo.com/v3/smtp/email for ${recipient.email}`);

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
    let responseText = "";
    let responseJson: any = null;
    let brevoErrorCode = null;
    let brevoErrorMessage = null;
    let messageId = null;

    try {
      responseText = await response.text();
      responseJson = JSON.parse(responseText);
      if (responseJson && typeof responseJson === "object") {
        if (responseJson.code) brevoErrorCode = responseJson.code;
        if (responseJson.message) brevoErrorMessage = responseJson.message;
        if (responseJson.messageId) messageId = responseJson.messageId;
      }
    } catch (e) {
      responseJson = { rawResponse: responseText || "Empty or non-JSON response" };
      brevoErrorMessage = responseText || String(e);
    }

    console.log(`[Brevo Trace Step 6/8] Brevo API response received for ${recipient.email}: Status ${statusCode}`);
    console.log(`[Brevo Trace] Response Body:`, JSON.stringify(responseJson, null, 2));

    const success = response.ok && !!messageId;

    return {
      email: recipient.email,
      messageId: messageId || undefined,
      success,
      statusCode,
      requestJson: payload,
      responseJson: {
        requestBody: payload,
        responseBody: responseJson,
        httpStatus: statusCode,
        brevoErrorCode: brevoErrorCode || (success ? null : "API_ERROR"),
        brevoErrorMessage: brevoErrorMessage || (success ? null : `Brevo responded with status ${statusCode}`),
        messageId: messageId || null,
        timestamp: new Date().toISOString(),
        recipientCount: payload.to.length,
      },
      error: success
        ? undefined
        : `Brevo API error ${statusCode}: ${brevoErrorCode ? `[${brevoErrorCode}] ` : ""}${brevoErrorMessage || responseText}`,
    };
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Brevo Trace] API request exception for recipient ${recipient.email}:`, err);
    return {
      email: recipient.email,
      success: false,
      statusCode: 0,
      requestJson: payload,
      responseJson: {
        requestBody: payload,
        responseBody: null,
        httpStatus: 0,
        brevoErrorCode: "EXCEPTION",
        brevoErrorMessage: errorMsg,
        messageId: null,
        timestamp: new Date().toISOString(),
        recipientCount: payload.to.length,
      },
      error: `Connection/API error: ${errorMsg}`,
    };
  }
}

export function validateBrevoPayload(payload: any): string | null {
  if (!payload.sender || !payload.sender.email || !payload.sender.name) {
    return "Invalid payload: sender information (email/name) is missing.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.sender.email)) {
    return `Invalid payload: sender email format is invalid: ${payload.sender.email}`;
  }
  if (!payload.to || !Array.isArray(payload.to) || payload.to.length === 0) {
    return "Invalid payload: 'to' field must be a non-empty array.";
  }
  for (const recipient of payload.to) {
    if (!recipient.email) {
      return "Invalid payload: recipient email is missing.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
      return `Invalid payload: recipient email format is invalid: ${recipient.email}`;
    }
  }
  if (payload.replyTo) {
    if (!payload.replyTo.email) {
      return "Invalid payload: replyTo email is missing.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.replyTo.email)) {
      return `Invalid payload: replyTo email format is invalid: ${payload.replyTo.email}`;
    }
  }
  if (!payload.subject || typeof payload.subject !== "string" || payload.subject.trim() === "") {
    return "Invalid payload: subject must be a non-empty string.";
  }
  if (!payload.textContent && !payload.htmlContent) {
    return "Invalid payload: either textContent or htmlContent must be provided.";
  }
  return null;
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
