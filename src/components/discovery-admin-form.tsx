'use client';
import { Button, Paper, TextField } from '@mui/material';
import { fundingFocusOptions } from '@/lib/opportunities/funding-focus';
import { useActionState } from 'react';
import { discoveryAction } from '@/app/actions/discovery';
import { categories } from '@/lib/opportunities/store';
export function CrawlButton({command,id,label,field}:{command:string;id?:string;label:string;field?:string}){
 const [state,action,pending]=useActionState(discoveryAction,{message:''});
 return <form action={action} className="inline-block mr-3"><input type="hidden" name="command" value={command}/><input type="hidden" name="field" value={field??''}/><input type="hidden" name="id" value={id??''}/><Button type="submit" variant="outlined" size="small" disabled={pending}>{pending?'Saving…':label}</Button><p role="status" className="text-sm">{state.message}</p></form>;
}
export type SourceFields={id:string;name:string;url:string;approved_domains:string[];categories:string[];geography:string;enabled:boolean;funding_focus?:string[];interval_hours?:number};
export function SourceForm({source}:{source?:SourceFields}){
 const [state,action,pending]=useActionState(discoveryAction,{message:''});
 return <Paper component="form" action={action} sx={{p:2,my:2,display:"grid",gap:2}}>
 <input type="hidden" name="command" value="source"/><input type="hidden" name="id" value={source?.id??''}/>
 <label className="block">Source name<input name="name" defaultValue={source?.name} required className="block w-full border p-2"/></label>
 <label className="block">Starting URL<input name="url" type="url" defaultValue={source?.url} required className="block w-full border p-2"/></label>
 <label className="block">Approved exact hostnames (comma separated)<input name="domains" defaultValue={source?.approved_domains.join(', ')} required placeholder="www.funder.org" className="block w-full border p-2"/></label>
 <label className="block">Geographic focus<input name="geography" defaultValue={source?.geography??'NYC / United States'} required className="block w-full border p-2"/></label>
 <fieldset><legend>Funding categories</legend><div className="flex flex-wrap gap-3">{categories.map(c=><label key={c}><input type="checkbox" name="categories" value={c} defaultChecked={source?.categories.includes(c)}/> {c}</label>)}</div></fieldset>
 <label className="block"><input name="enabled" type="checkbox" value="yes" defaultChecked={source?.enabled??true}/> Enabled for discovery</label>
 <TextField type="number" name="interval_hours" label="Directory check interval (hours, 6–168)" defaultValue={source?.interval_hours??24} slotProps={{htmlInput:{min:6,max:168}}}/><fieldset><legend>Funding focus (source coverage, not grant eligibility)</legend>{fundingFocusOptions.map(f=><label key={f.value} className="inline-block mr-3"><input type="checkbox" name="funding_focus" value={f.value} defaultChecked={source?.funding_focus?.includes(f.value)}/> {f.label}</label>)}</fieldset><Button type="submit" variant="contained" disabled={pending}>Save source</Button><p role="status">{state.message}</p>
 </Paper>;
}
