import type { DB } from "./store";
import { requireEditor } from "./store";
import { requireBetaOwner } from "../beta/security";
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
