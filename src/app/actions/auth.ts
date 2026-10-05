"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { pool } from "@/lib/db/pool";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/register?error=invalid");

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT 1 FROM users WHERE lower(email)=lower($1)", [email]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      redirect("/register?error=exists");
    }

    const user = await client.query(
      "INSERT INTO users(email,name,password_hash) VALUES(lower($1),$2,$3) RETURNING id",
      [email, name, passwordHash],
    );
    const userId = user.rows[0].id;
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
    const slug = `${slugBase}-${userId.slice(0, 8)}`;
    const workspace = await client.query(
      "INSERT INTO workspaces(name,slug,kind,created_by) VALUES($1::uuid,$2,'individual',$3) RETURNING id",
      [name, slug, userId],
    );
    const workspaceId = workspace.rows[0].id;

    await client.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",
      [workspaceId, userId],
    );
    await client.query(
      "INSERT INTO profiles(workspace_id,display_name,applicant_type) VALUES($1,$2,'individual')",
      [workspaceId, name],
    );
    await client.query(
      "INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'workspace.created','workspace',($1::uuid)::text)",
      [workspaceId, userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await signIn("credentials", { email, password, redirectTo: "/onboarding" });
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  await signIn("credentials", { email, password, redirectTo: "/app/dashboard" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
