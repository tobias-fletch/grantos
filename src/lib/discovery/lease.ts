import {randomUUID} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
type DB=Client|PoolClient;
// Row-backed lease works through transaction poolers; session advisory locks do not.
export async function acquireCrawlLease(db:DB){
 const owner=randomUUID();
 const row=await db.query("UPDATE crawl_worker_lease SET owner=$1,expires_at=now()+interval '15 minutes' WHERE id=1 AND expires_at<now() RETURNING owner",[owner]);
 return row.rowCount?owner:null;
}
export async function renewCrawlLease(db:DB,owner:string){
 const row=await db.query("UPDATE crawl_worker_lease SET expires_at=now()+interval '15 minutes' WHERE id=1 AND owner=$1 AND expires_at>now() RETURNING owner",[owner]);
 if(!row.rowCount)throw Error('Crawl lease expired; restart required');
}
export async function releaseCrawlLease(db:DB,owner:string){
 await db.query("UPDATE crawl_worker_lease SET owner=NULL,expires_at='-infinity' WHERE id=1 AND owner=$1",[owner]);
}
