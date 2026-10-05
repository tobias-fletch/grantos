import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { requireWorkspace } from "@/lib/auth/workspace";

const cards = [["Strong matches","0"],["Saved grants","0"],["Active applications","0"],["Upcoming deadlines","0"]];

export default async function Dashboard() {
  const { session, workspace } = await requireWorkspace();
  if (!workspace.onboarding_completed_at) redirect("/onboarding");

  return (
    <main className="min-h-screen">
      <aside className="fixed hidden h-full w-64 border-r bg-white p-6 md:block">
        <div className="text-xl font-bold">GrantOS</div>
        <div className="mt-2 text-xs text-[var(--muted)]">{workspace.name}</div>
        <nav className="mt-10 space-y-2 text-sm">
          {["Dashboard","Funding matches","Opportunities","Pipeline","Applications","Calendar","Tasks","Application library","Budgets"].map((item)=><div key={item} className="rounded-lg px-3 py-2 hover:bg-[#f1f4ef]">{item}</div>)}
        </nav>
        <form action={logoutAction} className="absolute bottom-6 left-6 right-6">
          <button className="w-full rounded-lg border px-3 py-2 text-sm">Log out</button>
        </form>
      </aside>
      <section className="p-6 md:ml-64 md:p-10">
        <p className="text-sm text-[var(--muted)]">OVERVIEW</p>
        <h1 className="mt-1 text-4xl font-semibold">Welcome, {session.user.name ?? "there"}</h1>
        <p className="mt-2 text-[var(--muted)]">Your GrantOS workspace is ready.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-6"><div className="text-3xl font-semibold">{value}</div><div className="mt-2 text-sm text-[var(--muted)]">{label}</div></div>)}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">Funding matches</h2><p className="mt-8 text-[var(--muted)]">Your profile is saved. Opportunity matching arrives in Milestone 2.</p></section>
          <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold">Upcoming deadlines</h2><p className="mt-8 text-[var(--muted)]">No deadlines yet. Save an opportunity to start your pipeline.</p></section>
        </div>
      </section>
    </main>
  );
}
