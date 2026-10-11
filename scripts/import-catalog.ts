import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
import {Client} from 'pg';
import {runProviderSync} from '../src/lib/discovery/provider-sync';
import {boundedReader} from '../src/lib/discovery/catalog-scheduler';
const url=process.env.DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('This acceptance command requires a local database');
const db=new Client({connectionString:url});
async function main(){await db.connect();try{const deadline=Date.now()+120000;const budget=boundedReader();await runProviderSync(db,()=>Date.now()>=deadline,budget);console.log(JSON.stringify((await db.query('SELECT provider,imported,skipped,failures,last_error,jsonb_array_length(pending) AS pending FROM catalog_provider_sync')).rows));console.log('API requests:',budget.pages);}finally{await db.end();}}
main().catch(()=>{console.error('Import failed. Check local database/migrations.');process.exitCode=1;});
