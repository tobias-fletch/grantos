import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ready=await pool.query("SELECT 1 FROM schema_migrations WHERE filename='011_beta_access.sql'"); if(!ready.rowCount)throw Error("Migration required");
    return NextResponse.json({ status: "ok", service: "grantos", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "grantos", database: "unavailable" }, { status: 503 });
  }
}
