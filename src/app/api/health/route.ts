import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ready=await pool.query("SELECT count(*)::int AS total FROM schema_migrations WHERE filename IN ('011_beta_access.sql','012_catalog_monitoring.sql','013_email_delivery.sql','014_search_discovery.sql','015_crawl_worker_lease.sql','016_catalog_maintenance.sql','017_official_source_expansion.sql','018_program_reconciliation.sql','019_reconciliation_alias_normalization.sql','020_autonomous_cataloger.sql')"); if(ready.rows[0].total!==10)throw Error("Migration required");
    return NextResponse.json({ status: "ok", service: "grantos", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "grantos", database: "unavailable" }, { status: 503 });
  }
}
