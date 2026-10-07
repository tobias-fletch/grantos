'use client';
import { useActionState } from 'react';
import { discoveryAction } from '@/app/actions/discovery';
import { categories } from '@/lib/opportunities/store';
export function CrawlButton({command,id,label}:{command:string;id?:string;label:string}){
 const [state,action,pending]=useActionState(discoveryAction,{message:''});
 return <form action={action} className="inline-block mr-3"><input type="hidden" name="command" value={command}/><input type="hidden" name="id" value={id??''}/><button disabled={pending} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{pending?'Saving…':label}</button><p role="status" className="text-sm">{state.message}</p></form>;
}
export type SourceFields={id:string;name:string;url:string;approved_domains:string[];categories:string[];geography:string;enabled:boolean};
export function SourceForm({source}:{source?:SourceFields}){
 const [state,action,pending]=useActionState(discoveryAction,{message:''});
 return <form action={action} className="my-3 space-y-3 rounded border bg-white p-4">
 <input type="hidden" name="command" value="source"/><input type="hidden" name="id" value={source?.id??''}/>
 <label className="block">Source name<input name="name" defaultValue={source?.name} required className="block w-full border p-2"/></label>
 <label className="block">Starting URL<input name="url" type="url" defaultValue={source?.url} required className="block w-full border p-2"/></label>
 <label className="block">Approved exact hostnames (comma separated)<input name="domains" defaultValue={source?.approved_domains.join(', ')} required placeholder="www.funder.org" className="block w-full border p-2"/></label>
 <label className="block">Geographic focus<input name="geography" defaultValue={source?.geography??'NYC / United States'} required className="block w-full border p-2"/></label>
 <fieldset><legend>Funding categories</legend><div className="flex flex-wrap gap-3">{categories.map(c=><label key={c}><input type="checkbox" name="categories" value={c} defaultChecked={source?.categories.includes(c)}/> {c}</label>)}</div></fieldset>
 <label className="block"><input name="enabled" type="checkbox" value="yes" defaultChecked={source?.enabled??true}/> Enabled for daily discovery</label>
 <button disabled={pending} className="rounded border px-4 py-2">Save source</button><p role="status">{state.message}</p>
 </form>;
}
