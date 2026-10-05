import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { currentWorkspace } from "@/lib/opportunities/store";

export async function requireWorkspace() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspace = await currentWorkspace(pool, session.user.id);
  if (!workspace) redirect("/onboarding");

  return { session, workspace };
}
