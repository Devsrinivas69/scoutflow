import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { fetchWithTimeout } from "@/lib/utils/retry";

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

    const envValidation = {
      BREVO_API_KEY_configured: !!apiKey,
      BREVO_SENDER_EMAIL_configured: !!senderEmail,
      BREVO_SENDER_NAME_configured: !!senderName,
      BREVO_API_KEY_preview: apiKey ? `${apiKey.substring(0, 15)}...` : null,
      BREVO_SENDER_EMAIL_val: senderEmail || null,
      BREVO_SENDER_NAME_val: senderName || null,
    };

    if (!apiKey || !senderEmail || !senderName) {
      return NextResponse.json({
        success: false,
        error: "Missing one or more Brevo environment variables on the server.",
        envValidation,
      }, { status: 400 });
    }

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [{ email: testRecipient, name: "Test Recipient" }],
      subject: "Test Send from ScoutFlow Integration Audit",
      textContent: "This is a diagnostic email sent by the ScoutFlow system to verify SMTP and API key permissions.",
    };

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
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { text: responseText };
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `Brevo API returned error status ${statusCode}`,
        statusCode,
        responseJson,
        responseHeaders,
        envValidation,
      }, { status: 200 }); // Return 200 with success: false to let UI parse it safely
    }

    return NextResponse.json({
      success: true,
      message: "Test email successfully accepted by Brevo API",
      statusCode,
      responseJson,
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
