"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { setSavedOpportunity } from "@/lib/opportunities/store";

export async function saveOpportunityAction(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const parsed = z.object({ id: z.string().uuid(), saved: z.enum(["true","false"]) }).safeParse(Object.fromEntries(form));
  const target = new URL(String(form.get("returnTo") ?? "/app/opportunities"), "http://grantos.local");
  const allowed = ["/app/opportunities","/app/saved","/app/matches","/app/dashboard"].includes(target.pathname) || /^\/app\/opportunities\/[a-z0-9-]+$/.test(target.pathname);
  const returnTo = target.origin === "http://grantos.local" && allowed ? target.pathname + target.search : "/app/opportunities";
  if (!parsed.success) redirect("/app/opportunities?error=invalid");
  try { await setSavedOpportunity(pool,session.user.id,parsed.data.id,parsed.data.saved === "true"); }
  catch { redirect("/app/opportunities?error=save"); }
  revalidatePath("/app", "layout");
  redirect(returnTo);
}
