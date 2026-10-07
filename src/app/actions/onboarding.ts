"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { onboardingSchema } from "@/lib/validation/onboarding";

export async function saveOnboardingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const editing = formData.get("returnTo") === "/app/profile";
  const categories = formData.getAll("categories").map(String);
  const parsed = onboardingSchema.safeParse({
    displayName: formData.get("displayName"),
    applicantType: formData.get("applicantType"),
    categories,
    country: formData.get("country"),
    state: formData.get("state") || undefined,
    city: formData.get("city") || undefined,
    county: formData.get("county") || undefined,
    borough: formData.get("borough") || undefined,
    postalCode: formData.get("postalCode") || undefined,
  });
  if (!parsed.success)
    redirect(
      editing ? "/app/profile?error=invalid" : "/onboarding?error=invalid",
    );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const membership = await client.query(
      "SELECT workspace_id, role FROM workspace_members WHERE user_id=$1 ORDER BY created_at ASC, workspace_id LIMIT 1",
      [session.user.id],
    );
    const workspaceId = membership.rows[0]?.workspace_id;
    if (!workspaceId) throw new Error("Workspace not found");
    if (membership.rows[0].role === "viewer")
      throw new Error("Editing is not permitted");

    const v = parsed.data;
    await client.query(
      `UPDATE profiles SET display_name=$1, applicant_type=$2, country=$3, state=$4, city=$5,
       county=$6, borough=$7, postal_code=$8, onboarding_completed_at=coalesce(onboarding_completed_at,now()), updated_at=now()
       WHERE workspace_id=$9`,
      [
        v.displayName,
        v.applicantType,
        v.country,
        v.state ?? null,
        v.city ?? null,
        v.county ?? null,
        v.borough ?? null,
        v.postalCode ?? null,
        workspaceId,
      ],
    );
    await client.query("DELETE FROM profile_categories WHERE workspace_id=$1", [
      workspaceId,
    ]);
    for (const category of v.categories) {
      await client.query(
        "INSERT INTO profile_categories(workspace_id,category) VALUES($1,$2)",
        [workspaceId, category],
      );
    }
    await client.query(
      "INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id) VALUES($1::uuid,$2,$3,'profile',($1::uuid)::text)",
      [
        workspaceId,
        session.user.id,
        editing ? "profile.updated" : "profile.onboarding_completed",
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/app", "layout");
  redirect(editing ? "/app/profile?saved=1" : "/app/dashboard");
}
