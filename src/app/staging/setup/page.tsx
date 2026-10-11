import Link from 'next/link';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {pool} from '@/lib/db/pool';
import {stagingOwnerSetupAvailable, stagingOwnerSetupPageAllowed} from '@/lib/auth/staging-owner';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Staging owner setup | GrantOS', robots: {index: false, follow: false}};

export default async function StagingOwnerSetup({searchParams}: {
  searchParams: Promise<{error?: string; complete?: string}>;
}) {
  if (!stagingOwnerSetupPageAllowed(await headers())) notFound();
  const available = await stagingOwnerSetupAvailable(pool);
  const {error} = await searchParams;
  return <main className="mx-auto max-w-md px-6 py-16">
    <Link href="/" className="font-bold">GrantOS</Link>
    <p className="mt-8 rounded border border-amber-400 bg-amber-50 p-3 font-semibold">Isolated staging only</p>
    <h1 className="mt-6 text-3xl font-semibold">First-owner setup</h1>
    {!available ? <>
      <p className="mt-4">Owner setup is closed. If you just completed setup, log in with the email and password you chose.</p>
      <Link href="/login" className="mt-6 inline-block underline">Log in to staging</Link>
    </> : <>
      <p className="mt-4">The approved operator must enter the provider-generated setup token personally and choose a private password. This creates one staging owner and catalog editor, with an individual workspace.</p>
      <p className="mt-3 text-sm">Verification uses the provider setup token. No verification email is sent. This account gives no access to the live site. Use synthetic test content only.</p>
      {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3">We couldn’t complete setup. Check the details or try again later. An operator may need to check the staging configuration.</p>}
      <form method="post" action="/api/staging/owner-setup" className="mt-6 space-y-4">
        <label className="block">Name<input name="name" required minLength={2} maxLength={120} autoComplete="name" className="mt-1 w-full rounded border p-3" /></label>
        <label className="block">Approved owner email<input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded border p-3" /></label>
        <label className="block">Provider setup token<input name="token" type="password" required minLength={32} maxLength={256} autoComplete="off" spellCheck={false} className="mt-1 w-full rounded border p-3" /></label>
        <label className="block">Your new password (12+ characters)<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className="mt-1 w-full rounded border p-3" /></label>
        <label className="block">Confirm your password<input name="confirmPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className="mt-1 w-full rounded border p-3" /></label>
        <button className="rounded bg-[var(--brand)] px-5 py-3 text-white">Create staging owner</button>
      </form>
      <p className="mt-5 text-sm">Never put the setup token or your password in a link, chat, screenshot, or log. After setup, the operator should disable setup and remove the token from the staging service.</p>
    </>}
  </main>;
}
