import { z } from 'zod';
import { transaction, type DB } from '../checklists/store';
import { saveResultForProject, ProjectSaveConflict } from './save-result';
import { prepareApplication } from './preparation';
import { applicationAccess, workspaceAccess } from './store';
import { applicationGuidance } from './guidance-store';

/** A private preparation start, never an external submission, paid service, or eligibility decision. */
export async function startApplication(db: DB, user: string, kind: 'catalog'|'lead'|'external', resultId: string, projectId?: string|null) {
  z.enum(['catalog','lead','external']).parse(kind);z.string().uuid().parse(resultId);
  if(projectId)z.string().uuid().parse(projectId);
  return transaction(db,async c=>{
    const w=await workspaceAccess(c,user,true);
    // Same ordering as saves/catalog merges. Existing apps are never re-created or reassigned.
    await c.query('SELECT pg_advisory_xact_lock(7823091)');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9010))',[w.id]);
    const id=await saveResultForProject(c,user,kind,resultId,projectId);
    await initializePreparation(c,user,w.id,id);
    return id;
  });
}

async function initializePreparation(c: DB, user: string, workspaceId: string, id: string) {
    const app=(await c.query('SELECT * FROM applications WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,workspaceId])).rows[0];
    if(!app)throw Error('Application unavailable');
    // A repeated start is navigation only, including archived and terminal-stage applications.
    if(app.archived_at||!['saved','preparing'].includes(app.stage)||(await c.query('SELECT 1 FROM application_guidance_imports WHERE application_id=$1',[id])).rowCount)return;
    if(!app.project_id)throw new ProjectSaveConflict('Choose a project before starting application preparation.');
    if(!(await c.query('SELECT id FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR SHARE',[app.project_id,workspaceId])).rowCount)throw new ProjectSaveConflict('The connected project is archived. Open the application to review its project connection.');
    const guidance=await applicationGuidance(c,user,id);
    await c.query('INSERT INTO application_guidance_imports(application_id,guidance,created_by) VALUES($1,$2,$3)',[id,JSON.stringify(guidance),user]);
    for(const item of guidance.items){
      const provenance=JSON.stringify({...item.provenance,field:item.field,originalValue:item.value});
      if(item.field==='eligibility'||item.field==='question'){
        const data=item.field==='eligibility'?{kind:'eligibility',requirement:item.value,status:'unchecked',notes:item.provenance.applicantScope?`Applicant route: ${item.provenance.applicantScope}`:''}:{kind:'question',question:item.value,answer:'',word_limit:null};
        const itemId=await prepareApplication(c,user,id,'save',{...data,source_url:item.provenance.sourceUrl});
        await c.query('UPDATE application_preparation SET source_provenance=$2 WHERE id=$1 AND application_id=$3',[itemId,provenance,id]);
      }else if(item.field==='document'||item.field==='step'){
        // The complete quote survives in provenance and notes; the short editable title is only a label.
        await c.query(`INSERT INTO grant_tasks(workspace_id,application_id,opportunity_id,title,notes,source_url,source_excerpt,uncertainty,created_by,source_provenance)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[workspaceId,id,app.opportunity_id,item.value.slice(0,200),[item.provenance.applicantScope?`Applicant route: ${item.provenance.applicantScope}`:'Confirm whether this requirement applies to your applicant route.',item.value].join('\n').slice(0,2000),item.provenance.sourceUrl,item.provenance.excerpt,'Copied source requirement; confirm current applicability before acting.',user,provenance]);
      }
    }
    if(app.stage==='saved')await c.query("UPDATE applications SET stage='preparing',updated_at=now() WHERE id=$1 AND workspace_id=$2",[id,workspaceId]);
    await c.query("INSERT INTO application_history(application_id,actor_id,event,previous_stage,stage) VALUES($1,$2,'Application preparation started', $3,'preparing')",[id,user,app.stage]);
}

/** Initialize a saved application even when its original search session no longer exists. */
export async function startSavedApplication(db: DB, user: string, applicationId: string, projectId?: string|null) {
  z.string().uuid().parse(applicationId);if(projectId)z.string().uuid().parse(projectId);
  return transaction(db,async c=>{
    const w=await workspaceAccess(c,user,true);
    await c.query('SELECT pg_advisory_xact_lock(7823091)');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9010))',[w.id]);
    await applicationAccess(c,user,applicationId,true);
    const app=(await c.query('SELECT * FROM applications WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[applicationId,w.id])).rows[0];
    if(app.archived_at||!['saved','preparing'].includes(app.stage))return applicationId;
    if(projectId){
      if(app.project_id&&app.project_id!==projectId)throw new ProjectSaveConflict('This application is linked to a different project. Review its existing connection.');
      if(!app.project_id)await prepareApplication(c,user,applicationId,'project',{project_id:projectId});
    }
    await initializePreparation(c,user,w.id,applicationId);
    return applicationId;
  });
}
