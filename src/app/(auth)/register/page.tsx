import Link from "next/link";

export default function Register() {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="font-bold">GrantOS</Link>
      <h1 className="mt-12 text-3xl font-semibold">Start finding funding</h1>
      <p className="mt-2 text-[var(--muted)]">Create your workspace. No credit card required.</p>
      <form className="mt-8 space-y-4">
        <input className="w-full rounded-xl border p-3" placeholder="Name" />
        <input className="w-full rounded-xl border p-3" type="email" placeholder="Email" />
        <input className="w-full rounded-xl border p-3" type="password" placeholder="Password" />
        <button className="w-full rounded-xl bg-[var(--brand)] p-3 font-semibold text-white">
          Create account
        </button>
      </form>
    </main>
  );
}
