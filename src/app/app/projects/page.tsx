import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {listProjects} from '@/lib/projects/store';
import {Projects} from '@/components/ui/projects';
export default async function Page({searchParams}:{searchParams:Promise<{error?:string;saved?:string}>}){const {session,workspace}=await requireWorkspace();const params=await searchParams;const rows=await listProjects(pool,session.user!.id!);return <Projects projects={JSON.parse(JSON.stringify(rows))} defaults={workspace} canEdit={['owner','admin','member'].includes(workspace.role)} error={!!params.error} saved={!!params.saved}/>;}
