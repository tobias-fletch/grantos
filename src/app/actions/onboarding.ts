"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { saveOnboarding, type OnboardingState } from "@/lib/onboarding/store";

export async function saveOnboardingAction(_previous: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const editing = formData.get("returnTo") === "/app/profile";
  const mode = editing ? "profile" : formData.get("intent") === "draft" ? "draft" : "complete";
  const input = {
    displayName: formData.get("displayName"),
    applicantType: formData.get("applicantType"),
    categories: formData.getAll("categories").map(String),
    country: formData.get("country"),
    state: formData.get("state") || undefined,
    city: formData.get("city") || undefined,
    county: formData.get("county") || undefined,
    borough: formData.get("borough") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    projectName: formData.get("projectName"),
    fundingPurpose: formData.get("fundingPurpose"),
    projectLocation: formData.get("projectLocation"),
  };
  let result;
  try {
    result = await saveOnboarding(pool, session.user.id, mode, input);
  } catch {
    return { error: editing
      ? "Could not save. Check your name, country, interests, and workspace editing access. Your entries are still here."
      : "Could not save. Check your name, country, funding interests, project name, purpose (at least 10 characters), project location, and workspace editing access. Your entries are still here." };
  }
  revalidatePath("/app", "layout");
  revalidatePath("/onboarding");
  if (result.completed) redirect(result.destination);
  return { saved: true };
}
