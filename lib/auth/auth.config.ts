import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.orgId = (user as { orgId?: string }).orgId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { orgId?: string }).orgId = token.orgId as string;
        (session.user as { role?: string }).role = token.role as string;

        // Auto-create/sync user and organization records if missing in DB (due to database wipes/resets)
        try {
          const userId = token.id as string;
          const email = session.user.email || (token.email as string);
          if (userId && email) {
            const dbUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!dbUser) {
              console.warn(`[AUTH SYNC] User ${userId} (${email}) missing in database. Re-syncing...`);
              const orgId = token.orgId as string;
              if (orgId) {
                const dbOrg = await prisma.organization.findUnique({ where: { id: orgId } });
                if (!dbOrg) {
                  const slug = (session.user.name || email.split("@")[0] || "org").toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
                  await prisma.organization.create({
                    data: {
                      id: orgId,
                      name: session.user.name ? `${session.user.name}'s Organization` : "My Organization",
                      slug,
                    },
                  });
                }
              }
              await prisma.user.create({
                data: {
                  id: userId,
                  email,
                  name: session.user.name || null,
                  role: (token.role as any) || "MEMBER",
                  orgId: orgId || null,
                },
              });
              console.log(`[AUTH SYNC] Automatically recreated missing user: ${userId}`);
            }
          }
        } catch (err) {
          console.error("[AUTH SYNC] Failed to auto-create user in session callback:", err);
        }
      }
      return session;
    },
  },
});
