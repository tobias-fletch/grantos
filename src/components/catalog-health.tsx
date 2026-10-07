export function CatalogHealth({state,success,failures=0,evidence}:{state?:string;success?:Date|null;failures?:number;evidence?:string}){
 return <div className="mt-3 text-sm">
 <p>Last successful source check: {success?new Date(success).toLocaleDateString('en-US',{timeZone:'America/New_York'}):'Not yet monitored'}. This is not editorial verification.</p>
 {state==='discontinued'&&<p className="mt-2 text-amber-800">Archived from discovery — the source says this program is no longer offered. Your saved work is preserved. {evidence}</p>}
 {failures>0&&<p className="mt-2 text-amber-800">{failures>=3?'Source needs attention':'Source check unsuccessful'} · {failures} consecutive failed checks. The grant has not been removed because of these failures.</p>}
 </div>;
}
