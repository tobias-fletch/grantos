'use client';
import {useEffect,useState} from 'react';
import {Stack,Typography,Link} from '@mui/material';
import type {AwardExample} from '@/lib/search/examples';
export function AwardExamples({id,kind='catalog'}:{id:string;kind?:string}){
 const [data,setData]=useState<{checked?:boolean;examples?:AwardExample[];reason?:string;error?:string}|null>(null);
 useEffect(()=>{const c=new AbortController();fetch('/api/grant-examples?'+new URLSearchParams({id,kind}),{signal:c.signal}).then(r=>r.json()).then(setData).catch(()=>{});return()=>c.abort();},[id,kind]);
 return <Stack spacing={2} sx={{my:3}}><Typography variant="h3">Previously funded projects</Typography><Typography>{!data?'Checking connected award sources…':data.error??data.reason}</Typography>{data?.checked&&!data.examples?.length&&<Typography>No public examples found in checked sources.</Typography>}{data?.examples?.map(e=><Stack key={e.url}><Link href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</Link><Typography>{e.recipient} · {e.year} · {e.source}</Typography><Typography>{e.description}</Typography></Stack>)}</Stack>;
}
