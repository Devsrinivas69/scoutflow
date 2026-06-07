import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { sendSingleResendEmail, verifyAndLogResendEnvironment } from "@/lib/services/resend.service";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const testRecipient = (body.email as string) || "test@example.com";

    const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.RESEND_FROM_NAME;
    const replyTo = process.env.RESEND_REPLY_TO;

    const envValidation = await verifyAndLogResendEnvironment();

    if (!apiKey || !fromEmail || !fromName) {
      return NextResponse.json({
        success: false,
        error: "Missing one or more Resend environment variables.",
        envValidation,
      }, { status: 400 });
    }

    // Pre-flight recipient validation
    if (!testRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient)) {
      return NextResponse.json({
        success: false,
        error: `Invalid test recipient email: ${testRecipient}`,
        envValidation,
      }, { status: 400 });
    }

    const payload = {
      name: "Test Recipient",
      email: testRecipient,
      subject: "Test Send from ScoutFlow Resend Migration Audit",
      body: "This is a diagnostic email sent by the ScoutFlow system to verify Resend delivery, SMTP keys, and domain DKIM records.",
    };

    const res = await sendSingleResendEmail(payload, {
      apiKey,
      fromEmail,
      fromName,
      replyTo: replyTo || undefined,
    });

    return NextResponse.json({
      success: res.success,
      message: res.success ? "Test email accepted by Resend" : "Resend rejected the test email",
      statusCode: res.statusCode,
      responseJson: res.responseJson,
      envValidation,
    });
  } catch (error: any) {
    console.error("[Test Email API] Exception:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}
