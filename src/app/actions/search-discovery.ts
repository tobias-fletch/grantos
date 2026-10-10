"use server";
import {automationPaused} from '@/lib/discovery/maintenance';
import {researchRequest} from "@/lib/opportunities/search-navigation";
import {locationParams} from "@/lib/opportunities/geography";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { rateLimit } from "@/lib/beta/security";
import { enqueueSearch } from "@/lib/discovery/search-jobs";
import type { SearchParams } from "@/lib/opportunities/store";
export async function beginSearchDiscovery(params: SearchParams) {
  const { session, workspace } = await requireWorkspace();
  if (!["owner", "admin", "member"].includes(workspace.role))
    return { error: "Read-only members can browse the shared catalog." };
  params=locationParams(params,workspace);
  const requestId=researchRequest(new URLSearchParams({researchRequest:typeof params.researchRequest==='string'?params.researchRequest:''}));
  if(!requestId)return {error:'Submit a search to check approved sources.'};
  const receipt=(await pool.query('SELECT job_id FROM search_discovery_submissions WHERE id=$1 AND user_id=$2',[requestId,session.user.id])).rows[0];
  if(receipt)return {id:receipt.job_id};
  if (!(await rateLimit(pool, "search-discovery:" + session.user.id, 12, 3600)))
    return {
      error:
        "Deeper search limit reached. Existing catalog search is still available.",
    };
  if(await automationPaused(pool))return {error:"Catalog discovery is paused; existing results remain available."};
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const id = await enqueueSearch(db, params,{id:requestId,userId:session.user.id});
    await db.query("COMMIT");

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
      "SELECT id,status,pages,failures,published,updated,note,coverage_gap FROM search_discovery_jobs WHERE id=$1",
      [id],
    )
  ).rows[0];
  // Public source activity only. Polling never crawls or extends worker budgets.
  return row ?? null;
}
