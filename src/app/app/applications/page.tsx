import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { listApplications, stages } from "@/lib/applications/store";
import { MyGrants } from "@/components/ui/my-grants";
export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    archived?: string;
    error?: string;
  }>;
}) {
  const { session } = await requireWorkspace();
  const raw = await searchParams;
  const p = {
    q: typeof raw.q === "string" ? raw.q : "",
    stage:
      typeof raw.stage === "string" &&
      stages.includes(raw.stage as (typeof stages)[number])
        ? raw.stage
        : "",
    archived: raw.archived === "1" ? "1" : "0",
    error: typeof raw.error === "string" ? raw.error : "",
  };
  const [rows, all] = await Promise.all([
    listApplications(pool, session.user.id, p),
    listApplications(pool, session.user.id, { ...p, stage: "" }),
  ]);
  const counts: Record<string, number> = { all: all.length };
  for (const a of all) counts[a.stage] = (counts[a.stage] ?? 0) + 1;
  return (
    <MyGrants
      rows={JSON.parse(JSON.stringify(rows))}
      q={p.q}
      stage={p.stage}
      archived={p.archived === "1"}
      error={!!p.error}
      counts={counts}
    />
  );
}
