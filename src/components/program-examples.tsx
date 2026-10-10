import {pool} from '@/lib/db/pool';
import {ExampleCards} from './ui/example-cards';
import type {ProgramExample} from '@/lib/discovery/program-examples';
export async function ProgramExamples({id}:{id:string}){
 // Merged grants retain their original evidence and private applications.
 const pages=(await pool.query(`WITH RECURSIVE family AS (
  SELECT id,ARRAY[id] AS path FROM opportunities WHERE id=$1
  UNION ALL SELECT o.id,f.path||o.id FROM opportunities o JOIN family f ON o.merged_into=f.id WHERE NOT o.id=ANY(f.path) AND cardinality(f.path)<20
 ) SELECT p.examples,p.fetched_at FROM program_evidence_pages p JOIN family f ON f.id=p.opportunity_id
 WHERE jsonb_array_length(p.examples)>0 ORDER BY p.fetched_at DESC LIMIT 50`,[id])).rows;
 const unique=new Map<string,ProgramExample&{fetched_at:string}>();
 for(const p of pages)for(const e of p.examples as ProgramExample[])if(!unique.has(e.url))unique.set(e.url,{...e,fetched_at:new Date(p.fetched_at).toISOString()});
 return <ExampleCards examples={[...unique.values()].slice(0,12)}/>;
}
