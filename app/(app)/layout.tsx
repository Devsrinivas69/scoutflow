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
    <div className="flex min-h-screen" style={{ background: "#0B1020" }}>
      <Sidebar />
      <main className="app-main flex-1">
        {children}
      </main>
    </div>
  );
}
