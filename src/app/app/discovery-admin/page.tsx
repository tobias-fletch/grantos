import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {catalogAdminData} from '@/lib/discovery/admin-data';
import {CatalogAdmin} from '@/components/catalog-admin';
export default async function DiscoveryAdmin({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {session}=await requireWorkspace();
 const data=await catalogAdminData(pool,session.user.id,await searchParams);
 const providers=(await pool.query('SELECT provider,enabled,last_success_at,completed_at,failures,last_error,imported,skipped,jsonb_array_length(pending) AS pending FROM catalog_provider_sync ORDER BY provider')).rows;
 return <><CatalogAdmin data={data}/><section className="mt-6 rounded-2xl border p-5"><h2 className="text-lg font-semibold">Official data imports</h2><p className="text-sm">Imports share the worker budget. A successful batch does not mean the entire source has been checked. Disable its source in Sources to pause an import.</p>{providers.map(p=><div key={p.provider} className="mt-4"><strong>{p.provider}</strong> · {p.imported} added · {p.skipped} skipped · {p.pending} staged<p className="text-sm">Last batch: {p.last_success_at?new Date(p.last_success_at).toISOString():'Not yet run'} · Last full scan: {p.completed_at?new Date(p.completed_at).toISOString():'Not yet complete'}</p>{p.failures>0&&<p role="status">{p.last_error} Retry is scheduled with backoff.</p>}</div>)}</section></>;
}
