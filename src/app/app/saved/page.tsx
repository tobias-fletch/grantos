import { Discovery } from "@/components/discovery";
import type { SearchParams } from "@/lib/opportunities/store";
export default async function Saved({searchParams}:{searchParams:Promise<SearchParams>}) {
  return <Discovery params={await searchParams} mode="saved"/>;
}
