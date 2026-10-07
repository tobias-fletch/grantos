import type { DB } from "./store";
import { requireEditor } from "./store";
import { requireBetaOwner } from "../beta/security";
import {factFields} from './program-evidence';
import {fieldValue,writeField,sameFactValue} from './program-store';
export async function fieldCommand(db:any,userId:string,command:string,id:string,field:string){
 await requireEditor(db,userId);
 if(!factFields.includes(field as any))throw Error('Invalid field');
 const grant=(await db.query('SELECT * FROM opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!grant)throw Error('Grant unavailable');
 if(command==='rollback-field'){
  const history=(await db.query('SELECT * FROM catalog_field_history WHERE opportunity_id=$1 AND field=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[id,field])).rows[0];
  if(!history)throw Error('No history');
  const current=await fieldValue(db,grant,field);
  if(!sameFactValue(current,history.new_value))throw Error('Field changed since recorded update');
  await writeField(db,id,field,history.old_value);
  await db.query("INSERT INTO catalog_field_history(opportunity_id,field,old_value,new_value,evidence,parser_version,action) VALUES($1,$2,$3,$4,$5,'editor','rollback')",[id,field,JSON.stringify(current),JSON.stringify(history.old_value),JSON.stringify(history.evidence)]);
  await db.query("UPDATE opportunities SET verification_status='needs_verification',last_verified_at=NULL,auto_verified_at=NULL,updated_at=now(),catalog_updated_at=now() WHERE id=$1",[id]);
 }
 if(!['lock-field','unlock-field','rollback-field'].includes(command))throw Error('Unknown field action');
 await db.query(`INSERT INTO catalog_field_state(opportunity_id,field,locked,locked_by) VALUES($1,$2,$3,$4) ON CONFLICT(opportunity_id,field) DO UPDATE SET locked=excluded.locked,locked_by=excluded.locked_by,updated_at=now()`,[id,field,command!=='unlock-field',userId]);
 await db.query("UPDATE catalog_enrichment_jobs SET state='queued',next_attempt_at=now() WHERE opportunity_id=$1",[id]);
 await db.query('INSERT INTO catalog_admin_events(actor_id,action,subject) VALUES($1,$2,$3)',[userId,command,id+':'+field]);
}
export async function maintenanceCommand(
  db: DB,
  userId: string,
  command: string,
  id: string,
) {
  await requireEditor(db, userId);
  if (["pause", "resume", "hourly", "daily"].includes(command)) {
    await requireBetaOwner(db, userId);
    if (command === "hourly" || command === "daily")
      await db.query(
        "UPDATE catalog_automation SET hourly_enabled=$1 WHERE id=1",
        [command === "hourly"],
      );
    else
      await db.query("UPDATE catalog_automation SET paused=$1 WHERE id=1", [
        command === "pause",
      ]);
  } else if (command === "refresh-grant" || command === "restore-grant") {
    const grant = (
      await db.query(
        "SELECT * FROM opportunities WHERE id=$1 AND merged_into IS NULL",
        [id],
      )
    ).rows[0];
    if (!grant) throw Error("Grant unavailable");
    if (command === "restore-grant") {
      await db.query(
        "UPDATE opportunities SET publication_state='published',verification_status=CASE WHEN verification_status='archived' THEN 'needs_verification' ELSE verification_status END WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE catalog_monitoring SET state='active',next_check_at=now(),changed_at=now() WHERE opportunity_id=$1",
        [id],
      );
    }
    await db.query(
      "UPDATE crawl_frontier SET next_check_at=now() WHERE url=$1",
      [grant.source_url],
    );
    await db.query(
      "UPDATE catalog_monitoring SET next_check_at=now() WHERE opportunity_id=$1",
      [id],
    );
    await db.query(
      "INSERT INTO crawl_runs(trigger) VALUES('targeted') ON CONFLICT DO NOTHING",
    );
  } else if (command === "refresh-source") {
    await db.query(
      "UPDATE crawl_frontier SET next_check_at=now() WHERE source_id=$1",
      [id],
    );
    await db.query(
      "INSERT INTO crawl_runs(trigger,source_id) SELECT 'targeted',id FROM crawl_sources WHERE id=$1 AND enabled ON CONFLICT DO NOTHING",
      [id],
    );
  } else throw Error("Unknown command");
  await db.query(
    "INSERT INTO catalog_admin_events(actor_id,action,subject) VALUES($1,$2,$3)",
    [userId, command, id],
  );
}
