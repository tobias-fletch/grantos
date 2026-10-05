import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { saveOnboardingAction } from "@/app/actions/onboarding";

const categories = ["Nonprofit","Music","Visual Art","Film / Video","Theater","Dance","Writing / Literature","Photography","Research","Education","Community Project","Small Business","Technology","Agriculture / Food"];

export default async function Onboarding() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-bold">GrantOS</p>
      <p className="mt-12 text-sm text-[var(--muted)]">SET UP YOUR FUNDING PROFILE</p>
      <h1 className="mt-2 text-4xl font-semibold">What are you seeking funding for?</h1>
      <p className="mt-3 text-[var(--muted)]">Your answers personalize discovery and eligibility matching.</p>

      <form action={saveOnboardingAction} className="mt-8">
        <div className="grid gap-4 md:grid-cols-2">
          <input name="displayName" required defaultValue={session.user.name ?? ""} className="rounded-xl border bg-white p-3" placeholder="Display name" />
          <select name="applicantType" className="rounded-xl border bg-white p-3" defaultValue="individual">
            <option value="individual">Individual</option>
            <option value="organization">Organization</option>
            <option value="business">Business</option>
            <option value="nonprofit">Nonprofit</option>
            <option value="fiscal_sponsored">Fiscal-sponsored project</option>
            <option value="collective">Collective</option>
            <option value="student">Student</option>
            <option value="researcher">Researcher</option>
            <option value="consultant">Grant consultant</option>
          </select>
          <input name="country" required defaultValue="United States" className="rounded-xl border bg-white p-3" placeholder="Country" />
          <input name="state" className="rounded-xl border bg-white p-3" placeholder="State" />
          <input name="city" className="rounded-xl border bg-white p-3" placeholder="City" />
          <input name="borough" className="rounded-xl border bg-white p-3" placeholder="Borough (optional)" />
          <input name="postalCode" className="rounded-xl border bg-white p-3" placeholder="ZIP / postal code" />
        </div>

        <h2 className="mt-8 text-lg font-semibold">Funding interests</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {categories.map((category) => (
            <label key={category} className="flex cursor-pointer gap-3 rounded-xl border bg-white p-4">
              <input type="checkbox" name="categories" value={category} />
              <span>{category}</span>
            </label>
          ))}
        </div>
        <button className="mt-8 rounded-xl bg-[var(--brand)] px-6 py-3 font-semibold text-white">Finish setup</button>
      </form>
    </main>
  );
}
