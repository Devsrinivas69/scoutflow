import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { fetchWithTimeout } from "@/lib/utils/retry";
import { validateBrevoPayload } from "@/lib/services/brevo.service";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const testRecipient = (body.email as string) || "test@example.com";

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME;
    const replyToEmail = process.env.BREVO_REPLY_TO_EMAIL;

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

    if (!apiKey || !senderEmail || !senderName) {
      return NextResponse.json({
        success: false,
        error: "Missing one or more Brevo environment variables on the server.",
        envValidation,
      }, { status: 400 });
    }

    // Pre-flight recipient check
    if (!testRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient)) {
      return NextResponse.json({
        success: false,
        error: `Invalid recipient email format: ${testRecipient}`,
        envValidation,
      }, { status: 400 });
    }

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [{ email: testRecipient, name: "Test Recipient" }],
      ...(replyToEmail ? { replyTo: { email: replyToEmail, name: senderName } } : {}),
      subject: "Test Send from ScoutFlow Integration Audit",
      textContent: "This is a diagnostic email sent by the ScoutFlow system to verify SMTP and API key permissions.",
    };

    // Pre-flight payload validation
    const payloadError = validateBrevoPayload(payload);
    if (payloadError) {
      return NextResponse.json({
        success: false,
        error: `Payload validation failed: ${payloadError}`,
        envValidation,
        payload,
      }, { status: 400 });
    }

    console.log(`[Test Delivery API] Triggering API call to Brevo for recipient: ${testRecipient}`);

    const response = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });

    const statusCode = response.status;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const responseText = await response.text();

    let responseJson = null;
    let brevoErrorCode = null;
    let brevoErrorMessage = null;
    let messageId = null;

    try {
      responseJson = JSON.parse(responseText);
      if (responseJson && typeof responseJson === "object") {
        if (responseJson.code) brevoErrorCode = responseJson.code;
        if (responseJson.message) brevoErrorMessage = responseJson.message;
        if (responseJson.messageId) messageId = responseJson.messageId;
      }
    } catch {
      responseJson = { rawResponse: responseText || "Empty or non-JSON response" };
      brevoErrorMessage = responseText;
    }

    const success = response.ok && !!messageId;

    const fullResponseTrace = {
      requestBody: payload,
      responseBody: responseJson,
      httpStatus: statusCode,
      brevoErrorCode: brevoErrorCode || (success ? null : "API_ERROR"),
      brevoErrorMessage: brevoErrorMessage || (success ? null : `Brevo responded with status ${statusCode}`),
      messageId: messageId || null,
      timestamp: new Date().toISOString(),
      recipientCount: payload.to.length,
    };

    if (!success) {
      return NextResponse.json({
        success: false,
        error: `Brevo API returned error status ${statusCode}: ${brevoErrorCode ? `[${brevoErrorCode}] ` : ""}${brevoErrorMessage || responseText}`,
        statusCode,
        responseJson: fullResponseTrace,
        responseHeaders,
        envValidation,
      }, { status: 200 }); // Return 200 with success: false to let UI parse it safely
    }

    return NextResponse.json({
      success: true,
      message: "Test email successfully accepted by Brevo API",
      statusCode,
      responseJson: fullResponseTrace,
      responseHeaders,
      envValidation,
    });
  } catch (error: any) {
    console.error("[Test Delivery API] Error testing Brevo credentials:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
