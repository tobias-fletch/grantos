import dotenv from 'dotenv';
import {Client} from 'pg';
import {freezeReconciliation,runReconciliation} from '../src/lib/discovery/reconcile';
dotenv.config({path:process.env.DISCOVERY_ENV_FILE??'.env.local',quiet:true});
const db=new Client({connectionString:process.env.DISCOVERY_DATABASE_URL??process.env.DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:30000});
let stop=false;process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
const until=Date.now()+Math.min(3300,Math.max(30,Number(process.env.RECONCILIATION_MAX_SECONDS)||3300))*1000;
async function main(){try{
 await db.connect();
 const settings=(await db.query('SELECT paused FROM catalog_automation WHERE id=1')).rows[0];
 if(settings.paused)throw Error('Automation paused');
 if(Number((await db.query('SELECT pg_database_size(current_database()) bytes')).rows[0].bytes)>850*1024*1024)throw Error('Storage guard');
 const run=await freezeReconciliation(db);
 console.log('Frozen catalog reconciliation:',run);
 const report=await runReconciliation(db,undefined,()=>stop||Date.now()>=until,1000);
 console.log(JSON.stringify(report));
 console.log(report.unfinished||report.busy||report.paused?'Partial coverage. Unfinished work remains prioritized for hourly continuation.':'Frozen inventory processed. This is not a guarantee of complete internet coverage.');
}catch{console.error('Reconciliation interrupted; checkpoints retained. No credentials logged.');process.exitCode=1;}
finally{await db.end().catch(()=>{});}}
void main();
