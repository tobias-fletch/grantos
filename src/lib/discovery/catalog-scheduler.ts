import {processContributions} from './contributions';
import {runProviderSync} from './provider-sync';
import type {Client} from 'pg';
import {createReader} from './reader';
import {runMaintenance} from './maintenance';
import {runEnrichment} from './enrichment';
import {runSearchDiscovery} from './search-jobs';
import {runReconciliation,queueParserReconciliation} from './reconcile';
export function boundedReader(base=createReader(),limit=1000){
 let pages=0;const sources=new Map<string,number>();
 const key=(domains:string[])=>[...domains].sort().join(',');
 return {policy:base.policy,get pages(){return pages;},charge:(provider:string)=>{const k='api:'+provider;if(pages>=limit||(sources.get(k)??0)>=50)throw Error('Invocation page budget exhausted');pages++;sources.set(k,(sources.get(k)??0)+1);},canRead:(_url:string,domains:string[])=>pages<limit&&(sources.get(key(domains))??0)<50,
  read:async(...args:Parameters<typeof base.read>)=>{if(pages>=limit||(sources.get(key(args[1]))??0)>=50)throw Error('Invocation page budget exhausted');pages++;sources.set(key(args[1]),(sources.get(key(args[1]))??0)+1);return base.read(...args);}};
}
export async function runCatalogCycle(db:Client,deadline:number,stopping=()=>false,reader=boundedReader()){
 const start=Date.now(),time=Math.max(0,deadline-start),stopAt=(end:number)=>()=>stopping()||Date.now()>=end||reader.pages>=1000;
 // User research gets its existing 20% share first, with durable four-page turns.
 const searchEnd=start+time*.2;
 // Structured imports share the existing discovery allocation, not additional runtime.
 await runProviderSync(db,stopAt(start+time*.1),reader);
 while(!stopAt(searchEnd-2000)()&&reader.pages<200){
  if(!await runSearchDiscovery(db,stopAt(searchEnd),reader,undefined,Math.min(4,200-reader.pages),stopAt(searchEnd-2000)))break;
 }
 // Maintenance retains half of the time/page budget; other phases keep their shares.
 await runMaintenance(db,reader,stopAt(start+time*.7),500,true,stopAt(start+time*.7),'maintenance');
 if(!stopAt(start+time*.95)())await queueParserReconciliation(db);
 const remaining=1000-reader.pages;
 const enriched=await runEnrichment(db,reader,stopAt(start+time*.825),Math.min(remaining,150));
 if(!stopAt(start+time*.95)())await runReconciliation(db,reader,stopAt(start+time*.95),Math.max(0,300-enriched.pages));
 await processContributions(db,reader,stopAt(deadline));
 if(!stopAt(deadline)())await runMaintenance(db,reader,stopAt(deadline),1000-reader.pages,true,stopAt(deadline),'discovery');
 // Spare capacity returns to due maintenance; persistent checkpoints keep other phases resumable.
 if(!stopAt(deadline)())await runMaintenance(db,reader,stopAt(deadline),1000-reader.pages,true,stopAt(deadline),'maintenance');
 return reader.pages;
}
