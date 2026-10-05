import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-12">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="text-xl font-bold">GrantOS</div>
        <div className="flex gap-5 text-sm">
          <Link href="/login">Log in</Link>
          <Link className="rounded-full bg-[var(--brand)] px-4 py-2 text-white" href="/register">
            Start free
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-12 py-24 md:grid-cols-2 md:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-[var(--muted)]">
            Funding operating system
          </p>
          <h1 className="text-5xl font-semibold leading-tight md:text-7xl">
            Find funding. Build stronger applications.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
            Discover relevant grants, organize every application, reuse your best materials,
            and never lose track of a deadline.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/register" className="rounded-xl bg-[var(--brand)] px-6 py-3 font-semibold text-white">
              Create free account
            </Link>
            <Link href="/app/dashboard" className="rounded-xl border border-black/15 px-6 py-3 font-semibold">
              View dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-7 shadow-sm">
          <p className="text-sm text-[var(--muted)]">Your funding pipeline</p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            {[["Matched", "18"], ["Saved", "7"], ["Preparing", "3"], ["Upcoming", "4"]].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-[#f1f4ef] p-5">
                <div className="text-3xl font-semibold">{value}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
