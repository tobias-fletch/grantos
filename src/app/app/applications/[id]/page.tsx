import {applicationWritingResources} from '@/lib/applications/writing-resources';
import {ApplicationWritingResources} from '@/components/ui/application-writing';
import {applicationGuidance} from '@/lib/applications/guidance-store';
import {StartApplication} from '@/components/ui/start-application';
import {ApplicationGuidanceCard} from '@/components/ui/application-guidance';
import {applicationNextAction} from '@/lib/applications/next-action';
import {applicationFit} from '@/lib/applications/fit';
import {ProjectFit} from '@/components/ui/project-fit';
import {ApplicationPreparation} from '@/components/ui/application-preparation';
import {liveSearchEnabled} from '@/lib/search/providers';
import {preparationData} from '@/lib/applications/preparation';
import {listProjects} from '@/lib/projects/store';
import { ApplicationDetail } from "@/components/ui/application-detail";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { applicationAccess } from "@/lib/applications/store";
export default async function Application({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { session, workspace } = await requireWorkspace();
  const { id } = await params;
  let a;
  try {
    a = await applicationAccess(pool, session.user.id, id);
  } catch {
    notFound();
  }
  const p = await searchParams;
  const canEdit = ["owner", "admin", "member"].includes(workspace.role);
  const monitoring = a.opportunity_id
    ? (
        await pool.query(
          "SELECT * FROM catalog_monitoring WHERE opportunity_id=$1",
          [a.opportunity_id],
        )
      ).rows[0]
    : null;
  const tasks = (
    await pool.query(
      "SELECT t.*,t.due_date::text FROM grant_tasks t WHERE application_id=$1 AND workspace_id=$2 AND deleted_at IS NULL ORDER BY t.completed_at NULLS FIRST,t.due_date NULLS LAST,t.created_at",
      [id, a.workspace_id],
    )
  ).rows;
  const history = (
    await pool.query(
      "SELECT * FROM application_history WHERE application_id=$1 ORDER BY created_at DESC,id DESC",
      [id],
    )
  ).rows;
  let grant = a.opportunity_id
    ? (
        await pool.query(
          "SELECT slug,deadline_at,verification_status FROM opportunities WHERE id=$1",
          [a.opportunity_id],
        )
      ).rows[0]
    : null;
  if(!grant && liveSearchEnabled()){
    const external=(await pool.query("SELECT id,data FROM grant_external_results WHERE rtrim(source_url,'/')=rtrim($1,'/') LIMIT 1",[a.source_url])).rows[0];
    if(external)grant={slug:'external/'+external.id,deadline_at:external.data.facts.find((f:any)=>f.field==='deadline')?.value??null,verification_status:'unverified'};
  }
  const preparation = await preparationData(pool,session.user.id,id);
  const guidance = await applicationGuidance(pool,session.user.id,id);
  const projects = await listProjects(pool,session.user.id);
  const initialized = !!(await pool.query('SELECT 1 FROM application_guidance_imports WHERE application_id=$1',[id])).rowCount;
  return (
    <><ApplicationDetail key={a.id+':'+a.stage}
      nextAction={applicationNextAction(a,preparation,tasks)}
      a={JSON.parse(JSON.stringify(a))}
      tasks={JSON.parse(JSON.stringify(tasks))}
      history={JSON.parse(JSON.stringify(history))}
      grant={JSON.parse(JSON.stringify(grant ?? null))}
      monitoring={JSON.parse(JSON.stringify(monitoring ?? null))}
      canEdit={canEdit}
      error={!!p.error}
      updated={!!p.updated}
    />{!initialized&&!a.archived_at&&['saved','preparing'].includes(a.stage)&&<section style={{marginTop:32}}><h2>Start guided preparation</h2><p>Copy currently supported requirements once. Existing drafts and tasks stay intact.</p><StartApplication key={a.id} savedApplicationId={a.id} applicationId={a.id} applicationProjectId={a.project_id} projects={projects.filter(p=>!p.archived_at).map(p=>({id:p.id,name:p.name}))} canEdit={canEdit}/></section>}<ApplicationGuidanceCard guidance={guidance}/><ProjectFit fit={await applicationFit(pool,session.user.id,id)}/><ApplicationPreparation criteria={guidance.items.filter(i=>i.field==='criterion')} tasks={JSON.parse(JSON.stringify(tasks))} application={JSON.parse(JSON.stringify(a))} projects={JSON.parse(JSON.stringify(projects))} rows={JSON.parse(JSON.stringify(preparation))} canEdit={canEdit}/><ApplicationWritingResources resources={await applicationWritingResources(pool,session.user.id,id)}/></>
  );
}
