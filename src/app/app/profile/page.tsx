import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { FundingProfileForm } from "@/components/ui/profile";
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { workspace } = await requireWorkspace();
  const p = await searchParams;
  const row = (
    await pool.query("SELECT * FROM profiles WHERE workspace_id=$1", [
      workspace.id,
    ])
  ).rows[0];
  return (
    <FundingProfileForm
      profile={{ ...row, categories: workspace.categories }}
      canEdit={["owner", "admin", "member"].includes(workspace.role)}
      error={!!p.error}
      saved={!!p.saved}
    />
  );
}
