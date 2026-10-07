import {runSearchDiscovery} from '../src/lib/discovery/search-jobs';
import { publishBacklog } from '../src/lib/discovery/publish';
import dotenv from 'dotenv';
dotenv.config({path:process.env.DISCOVERY_ENV_FILE??'.env.local',quiet:true});dotenv.config({quiet:true});
import { Client } from 'pg';
import { enqueueDaily } from '../src/lib/discovery/store';
import { runCrawl } from '../src/lib/discovery/worker';
const maxSeconds=Number(process.env.DISCOVERY_MAX_SECONDS)||840;
const deadline=Date.now()+Math.max(60,Math.min(1800,maxSeconds))*1000;
const once=process.argv.includes('--once');
let stopping=false;
const shouldStop=()=>stopping||(once&&Date.now()>=deadline);process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main(){
 console.log('Direct discovery worker: daily 06:00 America/New_York; no search-provider or AI calls.');
 while(!shouldStop()){
  const db=new Client({connectionString:process.env.DISCOVERY_DATABASE_URL??process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:15000});
  try{await db.connect();await publishBacklog(db,null,shouldStop);await runSearchDiscovery(db,shouldStop);await enqueueDaily(db);await runCrawl(db,undefined,shouldStop);}
  catch{console.error('Discovery worker interrupted; durable job will resume after reconnection.');if(once)process.exitCode=1;}
  finally{await db.end().catch(()=>{});}
  if(once){console.log('Bounded invocation finished; unfinished jobs resume next time.');break;}
  const pollSeconds=Math.max(30,Math.min(3600,Number(process.env.DISCOVERY_POLL_SECONDS)||600));
  for(let i=0;i<pollSeconds&&!stopping;i++)await new Promise(r=>setTimeout(r,1000));
 }
}
main().catch(()=>{console.error('Discovery worker stopped.');process.exitCode=1;});
