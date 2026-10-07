import Link from 'next/link';
import {pool} from '@/lib/db/pool';
import {CatalogHealth} from './catalog-health';
export async function CatalogMonitorAdmin(){
 const rows=(await pool.query("SELECT o.id,o.name,o.slug,m.state,m.last_success_at,m.consecutive_failures,m.evidence,m.last_error FROM opportunities o LEFT JOIN catalog_monitoring m ON m.opportunity_id=o.id WHERE NOT o.is_demo AND o.publication_state='published' AND o.verification_status<>'archived' AND o.merged_into IS NULL ORDER BY m.consecutive_failures DESC NULLS LAST,m.last_success_at NULLS FIRST,o.name")).rows;
 const events=(await pool.query('SELECT e.*,o.name FROM catalog_monitor_events e JOIN opportunities o ON o.id=e.opportunity_id ORDER BY e.created_at DESC LIMIT 30')).rows;
 return <section className="mt-8"><h2 className="text-xl font-semibold">Catalog monitoring</h2>
 <p className="mt-2">{rows.length} programs · {rows.filter(m=>m.state==='discontinued').length} automatically archived · {rows.filter(m=>m.consecutive_failures>=3).length} sources need attention · {rows.filter(m=>!m.last_success_at).length} not checked yet</p>
 <p className="mt-2 text-sm">Checks share the daily crawl limits. Closed cycles remain in the catalog. Explicitly discontinued programs leave discovery; saved work remains accessible. Missing pages are retried, never automatically deleted.</p>
 <details className="mt-3"><summary>Program checks and cleanup history</summary>{rows.map(m=><div key={m.id} className="mt-3 border-t pt-2"><Link href={'/app/opportunities/'+m.slug} className="underline">{m.name}</Link><CatalogHealth state={m.state} success={m.last_success_at} failures={m.consecutive_failures} evidence={m.evidence}/>{m.last_error&&<p>{m.last_error}</p>}</div>)}
 <h3 className="mt-4 font-semibold">Recent monitoring events</h3>{events.map(e=><p key={e.id} className="mt-2">{e.name} · {e.outcome} · {new Date(e.created_at).toLocaleString('en-US',{timeZone:'America/New_York'})} · {e.evidence}</p>)}</details></section>;
}
