'use client';
import { useActionState } from 'react';
import { moderateAction } from '@/app/actions/moderation';
export function CatalogModeration({id,grants}:{id:string;grants:{id:string;name:string}[]}){
 const [state,action,pending]=useActionState(moderateAction,{message:''});
 return <form action={action} className="mt-5 rounded border p-4"><h2 className="font-semibold">Manage publication</h2><input type="hidden" name="id" value={id}/>
 <label className="mt-3 block">Duplicate of<select name="targetId" className="ml-2 max-w-full border p-2"><option value="">Choose the grant to keep</option>{grants.filter(g=>g.id!==id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <button name="action" value="merge" disabled={pending} className="mt-3 mr-3 rounded border px-3 py-2">Merge into selected grant</button><button name="action" value="hide" disabled={pending} className="mt-3 rounded border px-3 py-2">Hide listing</button>
 <p className="mt-2 text-sm">Merging preserves saves and checklists on the retained grant. Hiding removes this listing from discovery.</p><p role="status">{state.message}</p></form>;
}
