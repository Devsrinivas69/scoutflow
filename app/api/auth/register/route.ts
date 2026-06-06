import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create org + user in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
      const org = await tx.organization.create({
        data: { name: `${name}'s Organization`, slug },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "OWNER",
          orgId: org.id,
        },
      });

      return { user, org };
    });

    return NextResponse.json(
      { message: "Account created successfully", userId: result.user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
