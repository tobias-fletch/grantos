"use server";
import { auth } from "@/auth";
import { pool } from "@/lib/db/pool";
import { addTask, mutateTask, queueChecklist, confirmChecklist } from "@/lib/checklists/store";
import { generationConfigured } from "@/lib/checklists/generate";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function checklistAction(form:FormData) {
 const session=await auth();if(!session?.user?.id)redirect("/login");
 const parsed=z.object({opportunityId:z.string().uuid(),slug:z.string().regex(/^[a-z0-9-]+$/),operation:z.enum(["add","edit","complete","reopen","delete","generate","confirm"])}).safeParse(Object.fromEntries(form));
 if(!parsed.success)redirect("/app/saved?error=invalid");
 const {opportunityId,slug,operation}=parsed.data;
 // Derive the destination from the authorized grant, never trust the supplied slug.
 const grant=(await pool.query("SELECT slug FROM opportunities WHERE id=$1",[opportunityId])).rows[0];
 if(!grant || grant.slug!==slug)redirect("/app/saved?error=invalid");
 const path=`/app/opportunities/${grant.slug}`;let error="";
 try {
 const values={title:String(form.get("title")??""),notes:String(form.get("notes")??""),due_date:form.get("due_date") || null};
 if(operation==="add")await addTask(pool,session.user.id,opportunityId,values);
 else if(operation==="generate")await queueChecklist(pool,session.user.id,opportunityId,generationConfigured());
 else if(operation==="confirm"){
 const jobId=z.string().uuid().parse(form.get("jobId"));const indices=form.getAll("include").map(i=>Number(i));
 const tasks=indices.map(index=>({index,title:String(form.get(`title_${index}`)??""),notes:String(form.get(`notes_${index}`)??""),due_date:form.get(`due_${index}`) || null}));
 await confirmChecklist(pool,session.user.id,opportunityId,jobId,tasks);
 }else await mutateTask(pool,session.user.id,opportunityId,z.string().uuid().parse(form.get("taskId")),operation,values);
 }catch(e){error=e instanceof z.ZodError?"Check task titles, notes, and dates. Select at least one draft task to confirm.":e instanceof Error && !("code" in e)?e.message:"We could not update the checklist. Please try again.";}
 revalidatePath("/app","layout");redirect(path+(error?`?checklistError=${encodeURIComponent(error.slice(0,300))}`:"?checklistUpdated=1")+"#checklist");
}
