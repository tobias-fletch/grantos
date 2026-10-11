"use server";
import { liveSearchEnabled } from "@/lib/search/providers";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { saveResultForProject, ProjectSaveConflict } from "@/lib/applications/save-result";
import { revalidatePath } from "next/cache";
export async function saveResult(
  kind: "catalog" | "lead" | "external",
  id: string,
  projectId?: string | null,
): Promise<{ id?: string; error?: string }> {
  const s = await auth();
  if (!s?.user?.id) return { error: "Please log in again." };
  try {
    if (kind === "external" && !liveSearchEnabled()) throw Error("Unavailable");
    const applicationId = await saveResultForProject(pool, s.user.id, kind, id, projectId);
    revalidatePath("/app", "layout");
    return { id: applicationId };
  } catch (error) {
    return {
      error: error instanceof ProjectSaveConflict ? error.message : "Could not save this grant. Check your project and workspace access and try again.",
    };
  }
}
