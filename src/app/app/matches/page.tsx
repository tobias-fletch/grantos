import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace";
import { projectSearchDestination } from "@/lib/projects/search";
import type { SearchParams } from "@/lib/opportunities/store";

export default async function Matches({searchParams}:{searchParams:Promise<SearchParams>}) {
  const params = await searchParams;
  if (params.project !== undefined) {
    const query = new URLSearchParams();
    for (const [key,value] of Object.entries(params)) if (key !== 'suggested') for (const item of Array.isArray(value) ? value : typeof value === 'string' ? [value] : []) query.append(key,item);
    redirect(`/app/opportunities?${query}`);
  }
  const { workspace } = await requireWorkspace();
  redirect(projectSearchDestination({ ...workspace, id: undefined }, params));
}
