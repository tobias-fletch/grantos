import {z} from "zod";
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {externalAccess,externalDetailCard} from '@/lib/search/results';
import {liveSearchEnabled} from '@/lib/search/providers';
import {currentWorkspace} from '@/lib/opportunities/store';
import {SaveGrant} from '@/components/ui/search';
import {AwardExamples} from '@/components/ui/award-examples';
import {ProviderAttribution} from '@/components/provider-attribution';
export default async function ExternalGrant({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{project?:string}>}){
 if(!liveSearchEnabled())notFound();const {session}=await requireWorkspace(),{id}=await params;
 const w=await currentWorkspace(pool,session.user.id);let row;try{row=await externalAccess(pool,session.user.id,id);}catch{notFound();}
 const r=externalDetailCard(row);if(!r)notFound();
 const query=await searchParams;let project:{id:string;name:string}|null=null;
 if(query.project){if(!z.string().uuid().safeParse(query.project).success)notFound();project=(await pool.query('SELECT id,name FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL',[query.project,w.id])).rows[0]??null;if(!project)notFound();}
 if(r.applicationId)r.applicationProjectId=(await pool.query('SELECT project_id FROM applications WHERE id=$1 AND workspace_id=$2',[r.applicationId,w.id])).rows[0]?.project_id??null;
 const eligibility=row.data.facts.find((f:any)=>f.field==='eligibility')?.value;
 return <><Link href={project?"/app/opportunities?project="+project.id:"/app/opportunities"}>Find grants</Link>{project&&<p>Funding for project: {project.name}</p>}<h1 className="my-6 text-3xl font-semibold">{r.title}</h1><p>{r.source}</p><p className="my-4">{r.summary}</p><p>Availability: {r.status==='open'?(r.rolling?'Open—rolling':'Open'):r.status==='round_ended'?'Closed round':r.status}</p><p>Amount: {r.amount} · Deadline: {r.deadline??(r.rolling?'Rolling':'Unknown')}</p><h2 className="mt-6 text-xl">Eligibility</h2><p>{eligibility??'Needs checking'}</p><p className="my-4">The legal applicant may need to be a school, university, nonprofit, business, or fiscal sponsor. Being a student or educator does not itself establish eligibility.</p><p>Source checked: {r.fetched?.slice(0,10)}. Unverified—check the funder’s requirements.</p><div className="my-5"><SaveGrant key={r.id+project?.id} result={r} projectId={project?.id} canEdit={w.role!=='viewer'}/></div><a href={r.url} target="_blank" rel="noopener noreferrer">Official requirements and submission ↗</a><AwardExamples id={id} kind="external"/><h2 className="mt-6 text-xl">Public sample applications</h2>{/National Institutes of Health|\bNIH\b/i.test(r.source)?<a href="https://grants.nih.gov/grants-process/write-application/samples-applications-and-documents" target="_blank" rel="noopener noreferrer">NIH sample application library (related guidance; not confirmed examples for this program)</a>:<p>No program-specific public sample applications have been checked for this result.</p>}<h2 className="mt-6 text-xl">Blank forms and guidelines</h2><p>Use the official source above for current forms. Blank forms are not winning applications.</p><ProviderAttribution/></>;
}
