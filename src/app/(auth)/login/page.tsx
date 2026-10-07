import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {error} = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="font-bold">GrantOS</Link>
      <h1 className="mt-12 text-3xl font-semibold">Welcome back</h1>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Unable to log in. Check your credentials, beta invitation and email verification, or try again later.</p>}
      <form action={loginAction} className="mt-8 space-y-4">
        <input name="email" aria-label="Email" autoComplete="email" required className="w-full rounded-xl border p-3" type="email" placeholder="Email" />
        <input name="password" aria-label="Password" autoComplete="current-password" required minLength={8} maxLength={72} className="w-full rounded-xl border p-3" type="password" placeholder="Password" />
        <button className="w-full rounded-xl bg-[var(--brand)] p-3 font-semibold text-white">Log in</button>
      </form><p className="mt-4 text-sm"><Link href="/recover" className="underline">Forgot password or need email verification?</Link></p>
      <p className="mt-5 text-sm">Invite-only beta. <Link className="underline" href="/register">Invitation access</Link></p>
    </main>
  );
}
