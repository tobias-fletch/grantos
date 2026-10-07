import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
import { Client } from 'pg';
import { publishBacklog } from '../src/lib/discovery/publish';
async function main(){const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{console.log(JSON.stringify(await publishBacklog(db)));}finally{await db.end();}}
main().catch(()=>{console.error('Backlog publication failed. Pending records were preserved.');process.exitCode=1;});
