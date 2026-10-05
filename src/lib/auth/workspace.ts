import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";

export async function requireWorkspace() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const result = await pool.query(
    `SELECT w.id, w.name, w.slug, w.kind, p.onboarding_completed_at
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     LEFT JOIN profiles p ON p.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY wm.created_at ASC
     LIMIT 1`,
    [session.user.id],
  );

  const workspace = result.rows[0];
  if (!workspace) redirect("/onboarding");

  return { session, workspace };
}
