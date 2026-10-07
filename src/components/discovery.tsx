import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { unifiedSearch } from "@/lib/opportunities/results";
import type { SearchParams } from "@/lib/opportunities/store";
import { GrantSearch } from "@/components/ui/search";
import { redirect } from "next/navigation";
export async function Discovery({
  params,
  mode = "all",
}: {
  params: SearchParams;
  mode?: "all" | "saved" | "suggested";
}) {
  if (mode === "saved") redirect("/app/applications?stage=saved");
  const { session } = await requireWorkspace();
  const data = await unifiedSearch(pool, session.user.id, params);
  const crawl = (
    await pool.query(
      "SELECT status,finished_at,heartbeat_at FROM crawl_runs ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  const stamp = crawl?.finished_at ?? crawl?.heartbeat_at;
  const age = stamp ? Date.now() - new Date(stamp).getTime() : Infinity;
  const refresh = stamp
    ? "Source activity " +
      new Date(stamp).toLocaleDateString("en-US", {
        timeZone: "America/New_York",
      }) +
      " · " +
      (age > 36 * 3600000
        ? "Refresh overdue"
        : crawl.status === "complete"
          ? "Refresh complete"
          : "Partial coverage; more sources queued")
    : "Daily discovery · first refresh pending";
  return (
    <GrantSearch
      key={JSON.stringify(data.filters)}
      {...data}
      canEdit={["owner", "admin", "member"].includes(data.workspace.role)}
      refresh={refresh}
    />
  );
}
