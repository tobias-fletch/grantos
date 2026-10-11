import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {validateReviewedStarter} from '../src/lib/discovery/reviewed-starter';
import {enrichReviewedGuidance} from '../src/lib/discovery/reviewed-guidance-enrichment';
import {requireStagingDatabaseUrl} from './staging-database.mjs';
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--apply','--dry-run'].includes(a)&&!a.endsWith('.json'))||args.includes('--apply')&&args.includes('--dry-run'))throw Error('Usage: node --import tsx scripts/enrich-reviewed-guidance.ts [manifest.json] [--dry-run|--apply]');
 const input=JSON.parse(await readFile(args.find(a=>a.endsWith('.json'))??'data/reviewed-starter-guidance.json','utf8'));
 if(!args.includes('--apply')){const m=validateReviewedStarter(input);console.log(JSON.stringify({mode:'offline-guidance-dry-run',writes:0,records:m.records.map(r=>({key:r.key,sources:r.sources.length,facts:r.guidance.length}))},null,2));return;}
 const db=new Client({connectionString:requireStagingDatabaseUrl()});await db.connect();try{await db.query('BEGIN');const records=await enrichReviewedGuidance(db,input);await db.query('COMMIT');console.log(JSON.stringify({mode:'isolated-staging-guidance-enrichment',records},null,2));}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reviewed guidance enrichment failed');process.exitCode=1;});
