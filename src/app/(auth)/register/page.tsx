import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

export default async function Register({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {error} = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="font-bold">GrantOS</Link>
      <h1 className="mt-12 text-3xl font-semibold">Start finding funding</h1>
      <p className="mt-2 text-[var(--muted)]">Create your workspace. No credit card required.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error === "exists" ? "An account with that email already exists. Log in instead." : "Check your name, email, and password. Passwords must contain at least 8 characters and at most 72 UTF-8 bytes."}</p>}
      <form action={registerAction} className="mt-8 space-y-4">
        <input name="name" required minLength={2} className="w-full rounded-xl border p-3" placeholder="Name" />
        <input name="email" required className="w-full rounded-xl border p-3" type="email" placeholder="Email" />
        <input name="password" aria-label="Password (8+ characters)" autoComplete="new-password" required minLength={8} maxLength={72} className="w-full rounded-xl border p-3" type="password" placeholder="Password (8+ characters)" />
        <button className="w-full rounded-xl bg-[var(--brand)] p-3 font-semibold text-white">Create account</button>
      </form>
    </main>
  );
}
