import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { withRateLimit } from "@/lib/middleware/rate-limit.middleware";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit: 60/min per authenticated user ───────────────────────────
    const rateLimited = await withRateLimit(
      req,
      "general",
      session.user.id,
      "/api/exports"
    );
    if (rateLimited) return rateLimited;

    const orgId = (session.user as { orgId?: string }).orgId;
    if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

    const body = await req.json();
    const { runId, format = "csv", type = "contacts" } = body as {
      runId?: string;
      format?: "csv" | "json";
      type?: "contacts" | "companies";
    };

    if (type === "contacts") {
      const contacts = await prisma.contact.findMany({
        where: { run: { orgId }, ...(runId ? { runId } : {}) },
        include: { company: true, verifiedEmails: true },
        take: 10000,
      });

      const rows = contacts.map((c) => ({
        Name: c.fullName ?? `${c.firstName} ${c.lastName}`,
        Title: c.title ?? "",
        Company: c.company.name,
        Domain: c.company.domain,
        Email: c.verifiedEmails[0]?.email ?? "",
        "Email Status": c.verifiedEmails[0]?.status ?? "",
        LinkedIn: c.linkedinUrl ?? "",
        "Added At": c.createdAt.toISOString(),
      }));

      if (rows.length === 0) {
        return NextResponse.json({ error: "No contacts found to export" }, { status: 404 });
      }

      if (format === "json") {
        return new NextResponse(JSON.stringify(rows, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="scoutflow-contacts-${Date.now()}.json"`,
          },
        });
      }

      // CSV
      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="scoutflow-contacts-${Date.now()}.csv"`,
        },
      });
    }

    // Companies export
    const companies = await prisma.company.findMany({
      where: { run: { orgId }, ...(runId ? { runId } : {}) },
      take: 10000,
    });

    const rows = companies.map((c) => ({
      Name: c.name,
      Domain: c.domain,
      Industry: c.industry ?? "",
      Headcount: c.headcount ?? "",
      Country: c.country ?? "",
      Website: c.website ?? "",
      "Added At": c.createdAt.toISOString(),
    }));

    if (rows.length === 0) {
      return NextResponse.json({ error: "No companies found to export" }, { status: 404 });
    }

    if (format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="scoutflow-companies-${Date.now()}.json"`,
        },
      });
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="scoutflow-companies-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("[API] Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
