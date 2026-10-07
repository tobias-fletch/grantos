'use client';
import { useActionState } from 'react';
import { publishReviewAction } from '@/app/actions/catalog-review';
import { categories, applicantTypes } from '@/lib/opportunities/store';
export type ReviewDefaults={candidateId?:string;id?:string;name?:string;funder?:string;url?:string;summary?:string;eligibility?:string;notes?:string;status?:string;minimum?:string;maximum?:string;fee?:string;currency?:string;rolling?:boolean;deadline?:string;opens?:string;locations?:string;categories?:string[];applicants?:string[]};
export function CatalogReviewForm({defaults:d={}}:{defaults?:ReviewDefaults}) {
 const [state,action,pending]=useActionState(publishReviewAction,{error:''});
 const field=(name:keyof ReviewDefaults,label:string,required=false)=><label key={name} className="block">{label}<input name={name} defaultValue={typeof d[name]==='string'?d[name] as string:''} required={required} maxLength={2000} className="mt-1 w-full rounded border p-2"/></label>;
 const area=(name:keyof ReviewDefaults,label:string)=><label key={name} className="block">{label}<textarea name={name} defaultValue={typeof d[name]==='string'?d[name] as string:''} required maxLength={5000} rows={3} className="mt-1 w-full rounded border p-2"/></label>;
 return <form action={action} className="mt-6 space-y-4 rounded-xl border bg-white p-5">
 <input type="hidden" name="id" value={d.id??''}/><input type="hidden" name="candidateId" value={d.candidateId??''}/>
 <h2 className="text-xl font-semibold">{d.id?'Review existing grant':'Publish a reviewed grant'}</h2>
 {field('name','Program name',true)}{field('funder','Funder',true)}{field('url','Official requirements page (HTTPS)',true)}
 {area('summary','Summary')}{area('eligibility','Full eligibility notes, including restrictions')}{area('notes','Deadline, fee, matching funds, and cycle notes')}
 <label className="block">Application status<select name="status" defaultValue={d.status??'unannounced'} className="ml-3 rounded border p-2">{['unknown','unannounced','open','upcoming','closed'].map(s=><option key={s}>{s}</option>)}</select></label>
 <p className="text-sm">Leave unknown amounts and timestamps blank. Timestamps must include a timezone, for example 2026-12-01T17:00:00-05:00. Put date-only deadlines and rolling schedules in the notes.</p>
 <div className="grid gap-3 sm:grid-cols-2">{field('minimum','Minimum award')}{field('maximum','Maximum award')}{field('fee','Application fee')}{field('opens','Published opening timestamp')}{field('deadline','Published deadline timestamp')}</div>
 <label className="block">Currency code<input name="currency" defaultValue={d.currency??'USD'} required pattern="[A-Z]{3}" className="ml-3 rounded border p-2"/></label>
 <label className="block"><input type="checkbox" name="rolling" value="yes" defaultChecked={d.rolling}/> Funder explicitly accepts rolling applications</label>
 <fieldset><legend className="font-semibold">Funding interests</legend><div className="mt-2 flex flex-wrap gap-3">{categories.map(c=><label key={c}><input type="checkbox" name="categories" value={c} defaultChecked={d.categories?.includes(c)}/> {c}</label>)}</div></fieldset>
 <fieldset><legend className="font-semibold">Eligible applicant types</legend><div className="mt-2 flex flex-wrap gap-3">{applicantTypes.map(a=><label key={a}><input type="checkbox" name="applicants" value={a} defaultChecked={d.applicants?.includes(a)}/> {a.replaceAll('_',' ')}</label>)}</div></fieldset>
 {area('locations','Eligible locations — one Country | State | City per line; use Worldwide only when explicitly supported')}
 <label className="block">Exact evidence excerpt from the official page<textarea name="evidence" required minLength={30} maxLength={3000} rows={4} className="mt-1 w-full rounded border p-2"/></label>
 <label className="block"><input type="checkbox" name="attested" value="yes" required/> I reviewed the official source and confirm the eligibility, location, amounts, dates, and current cycle above. A matching excerpt alone does not verify these fields.</label>
 {d.id && <label className="block"><input type="checkbox" name="archive" value="yes"/> Archive this program from discovery</label>}
 <button disabled={pending} className="rounded bg-[var(--brand)] px-5 py-3 text-white disabled:opacity-50">{pending?'Checking source and saving…':'Confirm review and publish'}</button>
 {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
 </form>;
}
