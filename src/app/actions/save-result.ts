"use server";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import {
  setSavedOpportunity,
  currentWorkspace,
} from "@/lib/opportunities/store";
import { saveCandidate } from "@/lib/applications/store";
import { z } from "zod";
import { revalidatePath } from "next/cache";
export async function saveResult(
  kind: "catalog" | "lead",
  id: string,
): Promise<{ id?: string; error?: string }> {
  const s = await auth();
  if (!s?.user?.id) return { error: "Please log in again." };
  try {
    z.string().uuid().parse(id);
    let applicationId: string;
    if (kind === "lead")
      applicationId = await saveCandidate(pool, s.user.id, id);
    else if (kind === "catalog") {
      await setSavedOpportunity(pool, s.user.id, id, true);
      const w = await currentWorkspace(pool, s.user.id);
      applicationId = (
        await pool.query(
          "SELECT id FROM applications WHERE workspace_id=$1 AND opportunity_id=$2 ORDER BY created_at,id LIMIT 1",
          [w.id, id],
        )
      ).rows[0]?.id;
      if (!applicationId) throw Error("Save incomplete");
    } else throw Error("Invalid kind");
    revalidatePath("/app", "layout");
    return { id: applicationId };
  } catch {
    return {
      error: "Could not save this grant. Check your access and try again.",
    };
  }
}
