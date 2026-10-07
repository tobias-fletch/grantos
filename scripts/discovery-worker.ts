import {runSearchDiscovery} from '../src/lib/discovery/search-jobs';
import {enqueueHourly,runMaintenance,automationPaused} from '../src/lib/discovery/maintenance';
import dotenv from 'dotenv';
dotenv.config({path:process.env.DISCOVERY_ENV_FILE??'.env.local',quiet:true});dotenv.config({quiet:true});
import { Client } from 'pg';
import { enqueueDaily } from '../src/lib/discovery/store';
const maxSeconds=Number(process.env.DISCOVERY_MAX_SECONDS)||840;
const deadline=Date.now()+Math.max(60,Math.min(1800,maxSeconds))*1000;
const once=process.argv.includes('--once');
let stopping=false;
const shouldStop=()=>stopping||(once&&Date.now()>=deadline);process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main(){
 console.log('Bounded catalog maintenance worker; no search-provider or AI calls.');
 while(!shouldStop()){
  const db=new Client({connectionString:process.env.DISCOVERY_DATABASE_URL??process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:15000});
  try{await db.connect();
   const bytes=Number((await db.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
   if(bytes>850*1024*1024)await db.query("UPDATE catalog_automation SET paused=true,last_error='Storage guard: database exceeds 850 MB; review capacity before resuming.' WHERE id=1");
   if(!await automationPaused(db)){
    const settings=(await db.query('SELECT * FROM catalog_automation WHERE id=1')).rows[0];
    await db.query('UPDATE catalog_automation SET heartbeat_at=now() WHERE id=1');
    if(settings.hourly_enabled)await enqueueHourly(db);else await enqueueDaily(db);
    await runMaintenance(db,undefined,()=>shouldStop()||(once&&Date.now()>=deadline-15000),976,true,shouldStop);
    // Search jobs are capped at 24 pages, keeping an hourly invocation at <=1,000.
    if(!shouldStop())await runSearchDiscovery(db,shouldStop);
   }
  }
  catch{await db.query("UPDATE catalog_automation SET last_error='Worker interrupted; unfinished work will resume.' WHERE id=1").catch(()=>{});console.error('Discovery worker interrupted; durable job will resume after reconnection.');if(once)process.exitCode=1;}
  finally{await db.end().catch(()=>{});}
  if(once){console.log('Bounded invocation finished; unfinished jobs resume next time.');break;}
  const pollSeconds=Math.max(30,Math.min(3600,Number(process.env.DISCOVERY_POLL_SECONDS)||600));
  for(let i=0;i<pollSeconds&&!stopping;i++)await new Promise(r=>setTimeout(r,1000));
 }
}
main().catch(()=>{console.error('Discovery worker stopped.');process.exitCode=1;});
