import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { currentWorkspace } from "@/lib/opportunities/store";
import { FundingProfileForm } from "@/components/ui/profile";
import { completedSetupDestination } from "@/lib/onboarding/store";
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const w = await currentWorkspace(pool, session.user.id);
  if (!w) redirect("/login");
  const profile = (
    await pool.query("SELECT * FROM profiles WHERE workspace_id=$1", [w.id])
  ).rows[0];
  const p = await searchParams;
  if (profile?.onboarding_completed_at) redirect(await completedSetupDestination(pool, w.id, profile.quick_setup_project_id));
  return (
    <main style={{ padding: "40px 20px" }}>
      <FundingProfileForm
        onboarding
        profile={{
          ...profile,
          display_name: profile?.display_name ?? session.user.name ?? "",
          categories: w.categories,
        }}
        setup={profile?.quick_setup_draft ?? {}}
        canEdit={["owner", "admin", "member"].includes(w.role)}
        error={!!p.error}
      />
    </main>
  );
}
