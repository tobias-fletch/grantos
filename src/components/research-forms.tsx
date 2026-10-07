'use client';
import { useActionState } from 'react';
import { readLeadAction } from '@/app/actions/research';
export function ResearchForms({configured,canEdit,topic}:{configured:boolean;canEdit:boolean;topic:string}) {
 const [sourceState,sourceAction,reading]=useActionState(readLeadAction,{error:''});
 return <div className="mt-6 space-y-6">
 <p className="rounded-xl border bg-white p-5">Premium web research — coming later. Daily discovery reads registered funder sources directly.</p>
 <form action={sourceAction} className="rounded-xl border border-black/10 bg-white p-5">
 <h2 className="text-lg font-semibold">Import or reread a funder’s source</h2>
 <label className="mt-3 block">Program name<input name="title" required maxLength={250} className="mt-1 w-full rounded border p-2"/></label>
 <label className="mt-3 block">Official page URL<input name="url" type="url" required maxLength={2000} placeholder="https://" className="mt-1 w-full rounded border p-2"/></label>
 <button disabled={!canEdit||reading} className="mt-4 rounded border px-4 py-2 disabled:opacity-50">{reading?'Reading requirements…':'Read source'}</button>
 {sourceState.error && <p role="alert" className="mt-3 text-red-700">{sourceState.error}</p>}
 </form></div>;
}
