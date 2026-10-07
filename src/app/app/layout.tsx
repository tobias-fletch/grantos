import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { WorkspaceShell } from "@/components/ui/shell";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, session } = await requireWorkspace();
  if (!workspace.onboarding_completed_at) redirect("/onboarding");
  return (
    <WorkspaceShell
      name={workspace.name}
      owner={!!session.user.betaOwner}
      editor={!!session.user.catalogEditor}
    >
      {children}
    </WorkspaceShell>
  );
}
