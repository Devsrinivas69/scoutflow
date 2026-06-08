import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const recipient = body.email || "test@example.com";

    const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.RESEND_FROM_NAME;
    const replyTo = process.env.RESEND_REPLY_TO;

    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY is missing from environment" }, { status: 400 });
    }
    if (!fromEmail) {
      return NextResponse.json({ error: "RESEND_FROM_EMAIL is missing from environment" }, { status: 400 });
    }
    if (!fromName) {
      return NextResponse.json({ error: "RESEND_FROM_NAME is missing from environment" }, { status: 400 });
    }

    const resend = new Resend(apiKey);
    const payload = {
      from: `${fromName} <${fromEmail}>`,
      to: [recipient],
      subject: "Test Send from ScoutFlow Resend Recovery Diagnostic",
      html: `<div style="font-family:sans-serif;padding:20px;color:#333;border:1px solid #ddd;border-radius:8px;">
        <h2 style="color:#6d5df6;margin-top:0;">ScoutFlow Resend Diagnostic Check</h2>
        <p>This email verifies that your Resend integration is working correctly with verified DKIM records.</p>
        <p><strong>Recipient:</strong> ${recipient}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      </div>`,
      text: "This email verifies that your Resend integration is working correctly.",
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    console.log(`[Test Resend API] Sending payload directly via Resend SDK for recipient: ${recipient}`);
    
    const result = await resend.emails.send(payload);

    return NextResponse.json({
      success: !result.error,
      payload,
      response: result,
    });
  } catch (error: any) {
    console.error("[Test Resend API] Exception:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
      stack: error.stack,
    }, { status: 500 });
  }
}
