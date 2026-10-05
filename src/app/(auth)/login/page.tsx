import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default function Login() {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="font-bold">GrantOS</Link>
      <h1 className="mt-12 text-3xl font-semibold">Welcome back</h1>
      <form action={loginAction} className="mt-8 space-y-4">
        <input name="email" required className="w-full rounded-xl border p-3" type="email" placeholder="Email" />
        <input name="password" required minLength={8} className="w-full rounded-xl border p-3" type="password" placeholder="Password" />
        <button className="w-full rounded-xl bg-[var(--brand)] p-3 font-semibold text-white">Log in</button>
      </form>
      <p className="mt-5 text-sm">New to GrantOS? <Link className="underline" href="/register">Create an account</Link></p>
    </main>
  );
}
