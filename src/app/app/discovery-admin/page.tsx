import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {catalogAdminData} from '@/lib/discovery/admin-data';
import {CatalogAdmin} from '@/components/catalog-admin';
export default async function DiscoveryAdmin({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {session}=await requireWorkspace();
 return <CatalogAdmin data={await catalogAdminData(pool,session.user.id,await searchParams)}/>;
}
