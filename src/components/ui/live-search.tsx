'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Alert,Button,Stack,Typography,LinearProgress} from '@mui/material';
export function LiveSearch({query,requestId}:{query:string;requestId:string}){
 const router=useRouter(),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[changed,setChanged]=useState(false);const active=useRef(true);
 async function call(body:object){const r=await fetch('/api/grant-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error??'Search unavailable');return v;}
 async function batch(id:string){setBusy(true);setError('');try{const v=await call({action:'batch',id});if(active.current){setData(v);setChanged(true);}}catch(e){if(active.current)setError((e as Error).message);}finally{if(active.current)setBusy(false);}}
 useEffect(()=>{active.current=true;let cancelled=false;call({action:'start',requestId,query}).then(async v=>{if(cancelled)return;setData(v);if(v.providers.some((p:any)=>p.status==='queued'))await batch(v.id);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;active.current=false;};},[requestId]); // Navigation reuses this session; only a new submission starts fresh work.
 useEffect(()=>{if(!data?.providers.some((p:any)=>p.status==='searching'))return;const t=setTimeout(()=>{fetch('/api/grant-search?id='+encodeURIComponent(data.id)).then(r=>r.json()).then(v=>{if(v.providers){if(v.retrieved>data.retrieved)setChanged(true);setData(v);}}).catch(()=>setError('Progress temporarily unavailable.'));},1500);return()=>clearTimeout(t);},[data]);
 const names:Record<string,string>={'grants-gov':'Grants.gov',california:'California Grants Portal'};
 const labels:Record<string,string>={queued:'Waiting',searching:'Searching',received:'Results received',more:'More available',limited:'Rate limited',unavailable:'Unavailable'};
 return <Stack spacing={1} sx={{mb:3}} aria-live="polite"><Typography variant="h3">Live official-source search</Typography>{busy&&<LinearProgress/>}{error&&<Alert severity="warning">{error}</Alert>}
 {data&&<><Typography>{data.retrieved} distinct API records retrieved. Results below apply your filters and combine duplicates with saved source records.</Typography>{data.providers.map((p:any)=><Typography variant="body2" key={p.provider}>{names[p.provider]}: {labels[p.status]??p.status}{p.total!=null?` · provider reports ${p.total} records in status batches checked so far, before local eligibility filters`:''}</Typography>)}
 <Stack direction="row" spacing={1} sx={{flexWrap:"wrap"}}>{changed&&<Button variant="contained" onClick={()=>{setChanged(false);router.refresh();}}>New results available · Refresh results</Button>}{data.providers.some((p:any)=>!p.exhausted)&&<Button disabled={busy} onClick={()=>batch(data.id)}>Load next API batch</Button>}</Stack></>}
 <Typography variant="caption">Official website research continues separately in scheduled batches. API searches do not cover every grant on the internet.</Typography></Stack>;
}
