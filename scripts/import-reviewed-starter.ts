import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {validateReviewedStarter,starterPlan,importReviewedStarter} from '../src/lib/discovery/reviewed-starter';
import {requireStagingDatabaseUrl} from './staging-database.mjs';
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--apply','--dry-run','--append-existing-evidence'].includes(a)&&!a.endsWith('.json'))||args.includes('--apply')&&args.includes('--dry-run')||args.includes('--append-existing-evidence')&&!args.includes('--apply'))throw Error('Usage: tsx scripts/import-reviewed-starter.ts [catalog.json] [--dry-run|--apply [--append-existing-evidence]]');
 const path=args.find(a=>a.endsWith('.json'))??'data/reviewed-starter-catalog.json';
 const manifest=JSON.parse(await readFile(path,'utf8'));
 if(!args.includes('--apply')){console.log(JSON.stringify({mode:'offline-dry-run',writes:0,records:starterPlan(validateReviewedStarter(manifest))},null,2));return;}
 const db=new Client({connectionString:requireStagingDatabaseUrl()});await db.connect();
 try{await db.query('BEGIN');const records=await importReviewedStarter(db,manifest,Date.now(),{appendExistingEvidence:args.includes('--append-existing-evidence')});await db.query('COMMIT');console.log(JSON.stringify({mode:'isolated-staging-apply',records},null,2));}
 catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reviewed staging import failed');process.exitCode=1;});
