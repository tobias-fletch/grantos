import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ready=await pool.query("SELECT count(*)::int AS total FROM schema_migrations WHERE filename IN ('011_beta_access.sql','012_catalog_monitoring.sql','013_email_delivery.sql','014_search_discovery.sql')"); if(ready.rows[0].total!==4)throw Error("Migration required");
    return NextResponse.json({ status: "ok", service: "grantos", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "grantos", database: "unavailable" }, { status: 503 });
  }
}
