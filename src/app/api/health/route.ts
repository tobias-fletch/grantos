import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";
import { databaseReady } from "@/lib/db/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!(await databaseReady(pool))) throw Error("Migration required");
    return NextResponse.json({ status: "ok", service: "grantos", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", service: "grantos", database: "unavailable" }, { status: 503 });
  }
}
