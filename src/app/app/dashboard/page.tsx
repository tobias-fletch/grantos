import { requireWorkspace } from "@/lib/auth/workspace";
import { pool } from "@/lib/db/pool";
import { listApplications } from "@/lib/applications/store";
import { dashboardTasks } from "@/lib/checklists/store";
import { unifiedSearch } from "@/lib/opportunities/results";
import { Home } from "@/components/ui/home";
export default async function Dashboard() {
  const { session, workspace } = await requireWorkspace();
  const [apps, tasks, search] = await Promise.all([
    listApplications(pool, session.user.id, { active: true }),
    dashboardTasks(pool, session.user.id),
    unifiedSearch(pool, session.user.id, {}),
  ]);
  return (
    <Home
      name={session.user.name ?? "there"}
      categories={workspace.categories ?? []}
      apps={JSON.parse(JSON.stringify(apps))}
      tasks={JSON.parse(JSON.stringify(tasks))}
      grants={search.rows.slice(0, 6)}
      canEdit={["owner", "admin", "member"].includes(workspace.role)}
    />
  );
}
