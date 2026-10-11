import { z } from 'zod';
import { transaction, type DB } from '../checklists/store';
import { workspaceAccess, saveCandidate } from './store';
import { setSavedOpportunity } from '../opportunities/store';
import { saveExternal } from '../search/results';

export class ProjectSaveConflict extends Error {}
/** Save and link atomically. A search must never reassign an existing application's project. */
export async function saveResultForProject(db: DB, user: string, kind: 'catalog' | 'lead' | 'external', id: string, projectId?: string | null) {
  z.string().uuid().parse(id);
  if (projectId) z.string().uuid().parse(projectId);
  return transaction(db, async c => {
    const w = await workspaceAccess(c, user, true);
    if (projectId && !(await c.query('SELECT id FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR SHARE', [projectId, w.id])).rowCount)
      throw Error('Project unavailable');
    // Same lock order as candidate/API saves and catalog reconciliation.
    await c.query('SELECT pg_advisory_xact_lock(7823091)');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,9010))', [w.id]);
    let applicationId: string;
    if (kind === 'external') applicationId = await saveExternal(c, user, id);
    else if (kind === 'lead') applicationId = await saveCandidate(c, user, id);
    else if (kind === 'catalog') {
      await setSavedOpportunity(c, user, id, true);
      applicationId = (await c.query('SELECT id FROM applications WHERE workspace_id=$1 AND opportunity_id=$2 ORDER BY created_at,id LIMIT 1', [w.id, id])).rows[0]?.id;
      if (!applicationId) throw Error('Save incomplete');
    } else throw Error('Invalid result');
    if (projectId) {
      const a = (await c.query('SELECT project_id FROM applications WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [applicationId, w.id])).rows[0];
      if (!a) throw Error('Application unavailable');
      if (a.project_id && a.project_id !== projectId) throw new ProjectSaveConflict('This grant is already linked to a different project. Open it to review the connection.');
      if (!a.project_id) {
        await c.query('UPDATE applications SET project_id=$2,updated_at=now() WHERE id=$1', [applicationId, projectId]);
        await c.query("INSERT INTO application_history(application_id,actor_id,event) VALUES($1,$2,'Project linked from search')", [applicationId, user]);
      }
    }
    return applicationId;
  });
}
