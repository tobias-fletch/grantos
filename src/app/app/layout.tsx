import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { logoutAction } from "@/app/actions/auth";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireWorkspace();
  if (!workspace.onboarding_completed_at) redirect("/onboarding");
  const links = [["Dashboard","/app/dashboard"],["Opportunities","/app/opportunities"],["Saved grants","/app/saved"]];
  return <main className="min-h-screen">
    <header className="border-b border-black/10 bg-white px-6 py-5 md:hidden">
      <Link href="/app/dashboard" className="text-xl font-bold">GrantOS</Link>
      <nav aria-label="Workspace navigation" className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm">{links.map(([label,href])=><Link key={href} href={href} className="hover:underline">{label}</Link>)}</nav>
      <form action={logoutAction} className="mt-4"><button className="text-sm underline">Log out</button></form>
    </header>
    <aside className="fixed hidden h-full w-64 border-r border-black/10 bg-white p-6 md:block">
      <Link href="/app/dashboard" className="text-xl font-bold">GrantOS</Link>
      <p className="mt-2 break-words text-sm text-[var(--muted)]">{workspace.name}</p>
      <nav aria-label="Workspace navigation" className="mt-10 space-y-2 text-sm">{links.map(([label,href])=><Link key={href} href={href} className="block rounded-lg px-3 py-3 hover:bg-[#f1f4ef]">{label}</Link>)}</nav>
      <p className="mt-9 px-3 text-xs text-[var(--muted)]">{workspace.plan === "paid" ? "Paid plan · AI checklists included" : "Free plan · manual checklists included"}</p>
      <form action={logoutAction} className="absolute bottom-6 left-6 right-6"><button className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm">Log out</button></form>
    </aside>
    <section className="mx-auto max-w-7xl p-6 md:ml-64 md:p-10">{children}</section>
  </main>;
}
