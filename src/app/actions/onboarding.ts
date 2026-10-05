"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { onboardingSchema } from "@/lib/validation/onboarding";

export async function saveOnboardingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
  if (!parsed.success) redirect("/onboarding?error=invalid");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const membership = await client.query(
      "SELECT workspace_id FROM workspace_members WHERE user_id=$1 ORDER BY created_at ASC LIMIT 1",
      [session.user.id],
    );
    const workspaceId = membership.rows[0]?.workspace_id;
    if (!workspaceId) throw new Error("Workspace not found");

    const v = parsed.data;
    await client.query(
      `UPDATE profiles SET display_name=$1, applicant_type=$2, country=$3, state=$4, city=$5,
       county=$6, borough=$7, postal_code=$8, onboarding_completed_at=now(), updated_at=now()
       WHERE workspace_id=$9`,
      [v.displayName,v.applicantType,v.country,v.state??null,v.city??null,v.county??null,v.borough??null,v.postalCode??null,workspaceId],
    );
    await client.query("DELETE FROM profile_categories WHERE workspace_id=$1", [workspaceId]);
    for (const category of v.categories) {
      await client.query("INSERT INTO profile_categories(workspace_id,category) VALUES($1,$2)", [workspaceId,category]);
    }
    await client.query(
      "INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'profile.onboarding_completed','profile',$1::text)",
      [workspaceId, session.user.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  redirect("/app/dashboard");
}
