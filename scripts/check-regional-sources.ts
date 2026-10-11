import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
const url=process.env.DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local database required');
const db=new Client({connectionString:url});
async function main(){await db.connect();try{
 const sql=(await readFile('db/migrations/033_regional_sources.sql','utf8')).replace(/^BEGIN;\s*|^COMMIT;\s*/gm,'');
 await db.query('BEGIN');
 const before=(await db.query('SELECT count(*)::int AS n FROM crawl_sources')).rows[0].n;
 await db.query("UPDATE crawl_sources SET enabled=false,interval_hours=168 WHERE url='https://notcf.com/grants/'");
 await db.query(sql);
 const after=(await db.query('SELECT count(*)::int AS n FROM crawl_sources')).rows[0].n;
 const preserved=(await db.query("SELECT enabled,interval_hours FROM crawl_sources WHERE url='https://notcf.com/grants/'")).rows[0];
 if(before!==after||preserved.enabled||preserved.interval_hours!==168)throw Error('Idempotence/settings preservation failed');
 await db.query('ROLLBACK');
 console.log('Migration rerun preserves source count, disabled status and cadence.');
 console.log(JSON.stringify((await db.query("SELECT geography,count(*)::int AS sources FROM crawl_sources WHERE enabled GROUP BY geography ORDER BY geography")).rows));
}finally{await db.end();}}
main().catch(()=>{console.error('Regional source validation failed');process.exitCode=1;});
