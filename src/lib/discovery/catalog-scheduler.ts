import {processContributions} from './contributions';
import type {Client} from 'pg';
import {createReader} from './reader';
import {runMaintenance} from './maintenance';
import {runEnrichment} from './enrichment';
import {runSearchDiscovery} from './search-jobs';
import {runReconciliation,queueParserReconciliation} from './reconcile';
export function boundedReader(base=createReader(),limit=1000){
 let pages=0;const sources=new Map<string,number>();
 const key=(domains:string[])=>[...domains].sort().join(',');
 return {policy:base.policy,get pages(){return pages;},canRead:(_url:string,domains:string[])=>pages<limit&&(sources.get(key(domains))??0)<50,
  read:async(...args:Parameters<typeof base.read>)=>{if(pages>=limit||(sources.get(key(args[1]))??0)>=50)throw Error('Invocation page budget exhausted');pages++;sources.set(key(args[1]),(sources.get(key(args[1]))??0)+1);return base.read(...args);}};
}
export async function runCatalogCycle(db:Client,deadline:number,stopping=()=>false,reader=boundedReader()){
 const start=Date.now(),time=Math.max(0,deadline-start),stopAt=(end:number)=>()=>stopping()||Date.now()>=end||reader.pages>=1000;
 // Time slices matter on the free 60-second schedule as much as page allocations.
 await runMaintenance(db,reader,stopAt(start+time*.5),500,true,stopAt(start+time*.5),'maintenance');
 if(!stopAt(start+time*.8)())await queueParserReconciliation(db);
 const remaining=1000-reader.pages;
 // Give reconciliation its own share so a large enrichment backlog cannot starve cleanup.
 const enriched=await runEnrichment(db,reader,stopAt(start+time*.65),Math.min(remaining,150));
 if(!stopAt(start+time*.8)())await runReconciliation(db,reader,stopAt(start+time*.8),Math.max(0,300-enriched.pages));
 await processContributions(db,reader,stopAt(start+time*.9));
 await runSearchDiscovery(db,stopAt(deadline),reader);
 if(!stopAt(deadline)())await runMaintenance(db,reader,stopAt(deadline),1000-reader.pages,true,stopAt(deadline),'discovery');
 // Spare capacity returns to due maintenance; persistent checkpoints keep other phases resumable.
 if(!stopAt(deadline)())await runMaintenance(db,reader,stopAt(deadline),1000-reader.pages,true,stopAt(deadline),'maintenance');
 return reader.pages;
}
