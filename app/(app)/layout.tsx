import { auth } from "@/lib/auth/auth.config";
import { redirect } from "next/navigation";
import Sidebar from "@/components/shared/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <div className="flex min-h-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-on-surface)]">
      <Sidebar />
      <main className="flex-1 ml-0 md:ml-64 h-screen overflow-y-auto px-[20px] md:px-[64px] pt-24 pb-8 md:py-12 relative z-10">
        <div className="max-w-[1280px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
