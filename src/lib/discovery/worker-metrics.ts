import type {Client} from 'pg';
export async function dueChecks(db:Client){return Number((await db.query('SELECT count(*) AS n FROM crawl_frontier f JOIN crawl_sources s ON s.id=f.source_id WHERE s.enabled AND f.next_check_at<=now()')).rows[0].n);}
export async function beginWorkerSample(db:Client){
 return (await db.query('INSERT INTO catalog_worker_samples(due_before) VALUES($1) RETURNING id',[await dueChecks(db)])).rows[0].id as string;
}
export async function finishWorkerSample(db:Client,id:string,pages:number,outcome:string){
 await db.query(`UPDATE catalog_worker_samples SET finished_at=now(),due_after=$2,pages=$3,outcome=$4,
 successful_checks=(SELECT count(*) FROM crawl_frontier WHERE last_success_at>=catalog_worker_samples.started_at) WHERE id=$1`,[id,await dueChecks(db),pages,outcome]);
 await db.query("DELETE FROM catalog_worker_samples WHERE id IN (SELECT id FROM catalog_worker_samples WHERE started_at<now()-interval '90 days' ORDER BY started_at LIMIT 500)");
}
