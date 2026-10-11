import { transaction, type DB } from "../checklists/store";
import { workspaceAccess } from "../applications/store";
import { onboardingSchema, quickSetupDraftSchema, quickSetupSchema } from "../validation/onboarding";

export type OnboardingState = { error?: string; saved?: boolean };
type SetupMode = "profile" | "draft" | "complete";

export function onboardingDestination(projectId: string | null | undefined) {
  return projectId ? `/app/matches?project=${encodeURIComponent(projectId)}` : "/app/dashboard";
}

export async function completedSetupDestination(db: DB, workspaceId: string, projectId: string | null | undefined) {
  if (!projectId) return onboardingDestination(null);
  const active = (await db.query("SELECT id FROM funding_projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL", [projectId, workspaceId])).rowCount;
  return onboardingDestination(active ? projectId : null);
}

/** Profile and initial project are one transaction. The workspace lock makes retries safe. */
export async function saveOnboarding(db: DB, userId: string, mode: SetupMode, input: unknown) {
  const schema = mode === "profile" ? onboardingSchema : mode === "draft" ? quickSetupDraftSchema : quickSetupSchema;
  return transaction(db, async client => {
    const workspace = await workspaceAccess(client, userId, true);
    await client.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [workspace.id]);
    const previous = (await client.query("SELECT * FROM profiles WHERE workspace_id=$1 FOR UPDATE", [workspace.id])).rows[0];

    // Old forms, duplicate POSTs, and returning users cannot reset completed setup.
    if (mode !== "profile" && previous?.onboarding_completed_at) {
      return { destination: await completedSetupDestination(client, workspace.id, previous.quick_setup_project_id), completed: true };
    }

    const values = schema.parse(input);
    const setup = mode === "profile" ? null : quickSetupDraftSchema.parse(input);
    const draft = setup ? { projectName: setup.projectName, fundingPurpose: setup.fundingPurpose, projectLocation: setup.projectLocation } : null;
    await client.query(
      `INSERT INTO profiles(workspace_id,display_name,applicant_type,country,state,city,county,borough,postal_code,quick_setup_draft)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::jsonb,'{}'::jsonb))
       ON CONFLICT(workspace_id) DO UPDATE SET display_name=EXCLUDED.display_name,applicant_type=EXCLUDED.applicant_type,
       country=EXCLUDED.country,state=EXCLUDED.state,city=EXCLUDED.city,county=EXCLUDED.county,borough=EXCLUDED.borough,
       postal_code=EXCLUDED.postal_code,quick_setup_draft=coalesce($10::jsonb,profiles.quick_setup_draft),updated_at=now()`,
      [workspace.id, values.displayName, values.applicantType, values.country, values.state ?? null, values.city ?? null,
        values.county ?? null, values.borough ?? null, values.postalCode ?? null, draft ? JSON.stringify(draft) : null],
    );
    await client.query("DELETE FROM profile_categories WHERE workspace_id=$1", [workspace.id]);
    for (const category of values.categories) {
      await client.query("INSERT INTO profile_categories(workspace_id,category) VALUES($1,$2)", [workspace.id, category]);
    }

    let projectId: string | null = previous?.quick_setup_project_id ?? null;
    if (mode === "complete" && setup) {
      // Reuse only the explicitly associated project, never another draft by name.
      if (!projectId) {
        projectId = (await client.query(
          `INSERT INTO funding_projects(workspace_id,name,description,applicant_type,country,state,city,postal_code,categories,context)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id`,
          [workspace.id, setup.projectName, setup.fundingPurpose, values.applicantType, values.country,
            values.state ?? "", values.city ?? "", values.postalCode ?? "", values.categories,
            JSON.stringify({ service_area: setup.projectLocation })],
        )).rows[0].id;
      }
      await client.query(
        `UPDATE profiles SET quick_setup_project_id=$2,onboarding_completed_at=coalesce(onboarding_completed_at,now()),
         quick_setup_draft='{}'::jsonb,updated_at=now() WHERE workspace_id=$1`,
        [workspace.id, projectId],
      );
    }
    await client.query(
      "INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id) VALUES($1::uuid,$2,$3,'profile',($1::uuid)::text)",
      [workspace.id, userId, mode === "profile" ? "profile.updated" : mode === "draft" ? "profile.setup_saved" : "profile.onboarding_completed"],
    );
    return { destination: mode === "profile" ? "/app/profile?saved=1" : await completedSetupDestination(client, workspace.id, projectId), completed: mode !== "draft" };
  });
}
