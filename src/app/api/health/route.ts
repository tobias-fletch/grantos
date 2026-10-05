import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return NextResponse.json({ status: "ok", service: "grantos", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "grantos", database: "unavailable" }, { status: 503 });
  }
}
