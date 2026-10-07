import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/opportunities/store";
export default async function Matches({searchParams}:{searchParams:Promise<SearchParams>}) {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(await searchParams)) if(key !== "suggested") for(const item of Array.isArray(value)?value:typeof value==='string'?[value]:[]) query.append(key,item);
  query.set("suggested","1");
  redirect(`/app/opportunities?${query}`);
}
