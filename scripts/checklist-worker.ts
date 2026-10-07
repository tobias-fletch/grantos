import dotenv from "dotenv";
dotenv.config({path:".env.local",quiet:true});dotenv.config({quiet:true});
import { Pool } from "pg";
import { collectSources } from "../src/lib/checklists/sources";
import { generateDraft, generationConfigured } from "../src/lib/checklists/generate";
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,statement_timeout:10000});
let stopping=false;process.on("SIGTERM",()=>{stopping=true;});process.on("SIGINT",()=>{stopping=true;});
console.log(`Checklist worker started. AI ${generationConfigured()?"configured":"disabled until configured"}.`);
async function runOne(){
 await db.query("UPDATE checklist_jobs SET status='failed',error='Generation was interrupted. Please request a new draft.' WHERE status='running' AND started_at < now()-interval '10 minutes'");
 const result=await db.query(`UPDATE checklist_jobs SET status='running',started_at=now() WHERE id=(SELECT j.id FROM checklist_jobs j JOIN workspaces w ON w.id=j.workspace_id JOIN saved_opportunities s ON s.workspace_id=j.workspace_id AND s.opportunity_id=j.opportunity_id WHERE j.status='queued' AND w.plan='paid' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`);
 const job=result.rows[0];if(!job)return false;
 try {
 const grant=(await db.query("SELECT source_url FROM opportunities WHERE id=$1",[job.opportunity_id])).rows[0];
 const {sources,warnings}=await collectSources(grant.source_url);const generated=await generateDraft(sources);
 await db.query("UPDATE checklist_jobs SET status='draft',draft=$2,sources=$3,warnings=$4 WHERE id=$1 AND status='running'",[job.id,JSON.stringify(generated.tasks),JSON.stringify(sources.map(s=>({url:s.url}))),JSON.stringify([...warnings,...generated.warnings])]);
 console.log(`Checklist job ${job.id} ready for review.`);
 }catch(e){const known=e instanceof Error && /source|requirements|configured|supported|finish|explicit/i.test(e.message);const message=known?(e as Error).message:"Checklist generation failed. Try again or add tasks manually.";await db.query("UPDATE checklist_jobs SET status='failed',error=$2 WHERE id=$1 AND status='running'",[job.id,message.slice(0,500)]);console.log(`Checklist job ${job.id} failed.`);}return true;
}
async function main(){ while(!stopping){try{if(!generationConfigured()){await new Promise(r=>setTimeout(r,5000));continue;}await db.query("UPDATE checklist_jobs j SET status='failed',error='Paid access or the saved grant is no longer available.' WHERE status='queued' AND (NOT EXISTS(SELECT 1 FROM workspaces w WHERE w.id=j.workspace_id AND w.plan='paid') OR NOT EXISTS(SELECT 1 FROM saved_opportunities s WHERE s.workspace_id=j.workspace_id AND s.opportunity_id=j.opportunity_id))");const busy=await runOne();if(!busy)await new Promise(r=>setTimeout(r,5000));}catch{console.error("Worker cannot reach its queue; retrying.");await new Promise(r=>setTimeout(r,5000));}}
await db.end(); }
main().catch(()=>{console.error("Worker stopped unexpectedly.");process.exitCode=1;});
