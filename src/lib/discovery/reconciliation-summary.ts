import type {Client,Pool,PoolClient} from 'pg';

/** Inventory completion means every item has an outcome, not that every URL succeeded. */
export async function reconciliationSummary(db:Client|Pool|PoolClient,runId:string){
 const summary=(await db.query(`SELECT
 count(*)::int AS inventory,
 count(*) FILTER(WHERE status='complete' AND reason<>'Continued in newer inventory')::int AS checked,
 count(*) FILTER(WHERE reason='Continued in newer inventory')::int AS continued_elsewhere,
 count(*) FILTER(WHERE status IN ('queued','running'))::int AS unchecked,
 count(*) FILTER(WHERE status='blocked')::int AS retry_scheduled,
 count(*) FILTER(WHERE status='ambiguous')::int AS research_needed,
 count(*) FILTER(WHERE status='blocked' AND next_attempt_at<=now())::int AS overdue_retries
 FROM catalog_reconciliation_items WHERE run_id=$1`,[runId])).rows[0];
 const outcomes=(await db.query(`SELECT
 count(*) FILTER(WHERE action='merged')::int AS merged,
 count(*) FILTER(WHERE action='hidden')::int AS hidden,
 coalesce(sum(CASE WHEN action='facts-resolved' AND detail ~ '^[0-9]+$' THEN detail::int ELSE 0 END),0)::int AS facts_resolved
 FROM catalog_reconciliation_events WHERE run_id=$1`,[runId])).rows[0];
 return {...summary,...outcomes};
}

export async function settleReconciliation(db:Client,runId:string){
 const summary=await reconciliationSummary(db,runId);
 const status=summary.unchecked?'partial':'complete';
 await db.query(`UPDATE catalog_reconciliation_runs SET status=$2,
 finished_at=CASE WHEN $2='complete' THEN coalesce(finished_at,now()) ELSE NULL END,note=$3 WHERE id=$1`,[runId,status,JSON.stringify({...summary,meaning:'Inventory outcomes assigned; retries and unresolved research remain separate'})]);
 await db.query(`UPDATE crawl_runs SET status=$2,finished_at=now(),note=$3 WHERE id=(SELECT crawl_run_id FROM catalog_reconciliation_runs WHERE id=$1)`,[runId,summary.unchecked||summary.retry_scheduled?'partial':'complete',JSON.stringify({kind:'catalog-reconciliation',...summary})]);
 return summary;
}

export async function settleLegacyInventories(db:Client){
 const runs=(await db.query(`SELECT id FROM catalog_reconciliation_runs r WHERE status<>'complete'
 AND NOT EXISTS(SELECT 1 FROM catalog_reconciliation_items i WHERE i.run_id=r.id AND i.status IN ('queued','running'))`)).rows;
 for(const r of runs)await settleReconciliation(db,r.id);
}
