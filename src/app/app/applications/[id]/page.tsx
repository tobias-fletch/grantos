import { ApplicationDetail } from "@/components/ui/application-detail";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { applicationAccess } from "@/lib/applications/store";
export default async function Application({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { session, workspace } = await requireWorkspace();
  const { id } = await params;
  let a;
  try {
    a = await applicationAccess(pool, session.user.id, id);
  } catch {
    notFound();
  }
  const p = await searchParams;
  const canEdit = ["owner", "admin", "member"].includes(workspace.role);
  const monitoring = a.opportunity_id
    ? (
        await pool.query(
          "SELECT * FROM catalog_monitoring WHERE opportunity_id=$1",
          [a.opportunity_id],
        )
      ).rows[0]
    : null;
  const tasks = (
    await pool.query(
      "SELECT t.*,t.due_date::text FROM grant_tasks t WHERE application_id=$1 AND workspace_id=$2 AND deleted_at IS NULL ORDER BY t.completed_at NULLS FIRST,t.due_date NULLS LAST,t.created_at",
      [id, a.workspace_id],
    )
  ).rows;
  const history = (
    await pool.query(
      "SELECT * FROM application_history WHERE application_id=$1 ORDER BY created_at DESC,id DESC",
      [id],
    )
  ).rows;
  const grant = a.opportunity_id
    ? (
        await pool.query(
          "SELECT slug,deadline_at,verification_status FROM opportunities WHERE id=$1",
          [a.opportunity_id],
        )
      ).rows[0]
    : null;
  return (
    <ApplicationDetail
      a={JSON.parse(JSON.stringify(a))}
      tasks={JSON.parse(JSON.stringify(tasks))}
      history={JSON.parse(JSON.stringify(history))}
      grant={JSON.parse(JSON.stringify(grant ?? null))}
      monitoring={JSON.parse(JSON.stringify(monitoring ?? null))}
      canEdit={canEdit}
      error={!!p.error}
      updated={!!p.updated}
    />
  );
}
