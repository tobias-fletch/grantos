"use server";
import {automationPaused} from '@/lib/discovery/maintenance';
import { after } from "next/server";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { rateLimit } from "@/lib/beta/security";
import { enqueueSearch, runSearchDiscovery } from "@/lib/discovery/search-jobs";
import type { SearchParams } from "@/lib/opportunities/store";
function resume(id: string) {
  after(async () => {
    const db = await pool.connect();
    const end = Date.now() + 20000;
    try {
      await runSearchDiscovery(db, () => Date.now() >= end, undefined, id);
    } catch {
      await db.query("ROLLBACK").catch(() => {});
      console.error("Search discovery paused; the worker will retry.");
    } finally {
      db.release();
    }
  });
}
export async function beginSearchDiscovery(params: SearchParams) {
  const { session, workspace } = await requireWorkspace();
  if (!["owner", "admin", "member"].includes(workspace.role))
    return { error: "Read-only members can browse the shared catalog." };
  if (!(await rateLimit(pool, "search-discovery:" + session.user.id, 12, 3600)))
    return {
      error:
        "Deeper search limit reached. Existing catalog search is still available.",
    };
  if(await automationPaused(pool))return {error:"Catalog discovery is paused; existing results remain available."};
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const id = await enqueueSearch(db, params);
    await db.query("COMMIT");
    resume(id);
    return { id };
  } catch {
    await db.query("ROLLBACK");
    return {
      error:
        "Deeper discovery is unavailable right now. Existing results are still available.",
    };
  } finally {
    db.release();
  }
}
export async function searchDiscoveryStatus(id: string) {
  const { workspace } = await requireWorkspace();
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = (
    await pool.query(
      "SELECT id,status,pages,failures,published,updated,note FROM search_discovery_jobs WHERE id=$1",
      [id],
    )
  ).rows[0];
  // Public source activity only; neither search text nor private workspace data is returned.
  if (
    row &&
    ["owner", "admin", "member"].includes(workspace.role) &&
    ["queued", "running"].includes(row.status)
  )
    resume(id);
  return row ?? null;
}
