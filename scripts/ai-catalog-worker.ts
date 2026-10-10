import dotenv from 'dotenv';
import {Client} from 'pg';
import {aiEnabled,researchOnce} from '../src/lib/discovery/ai-research';
dotenv.config({path:process.env.DISCOVERY_ENV_FILE??'.env.local',quiet:true});
async function main(){
 if(!aiEnabled()){console.log('AI catalog pilot disabled: requires enable flag, API key and current pricing guard.');return;}
 if(!process.env.DISCOVERY_DATABASE_URL)throw Error('Restricted discovery connection required');
 const db=new Client({connectionString:process.env.DISCOVERY_DATABASE_URL,connectionTimeoutMillis:10000,statement_timeout:15000});
 try{
  await db.connect();
  for(let i=0;i<3;i++){
   const outcome=await researchOnce(db,{enabled:aiEnabled()});
   console.log('AI catalog pilot:',outcome);
   if(outcome==='failed'){process.exitCode=1;break;}
   if(outcome!=='queued')break;
  }
 }finally{await db.end();}
}
main().catch(()=>{console.error('AI catalog pilot interrupted; reservations and checkpoints retained.');process.exitCode=1;});
