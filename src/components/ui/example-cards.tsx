'use client';
import {useState} from 'react';
import {Box,Button,Card,CardContent,Chip,Stack,Typography} from '@mui/material';
import type {ProgramExample} from '@/lib/discovery/program-examples';
function ExampleImage({example:e}:{example:ProgramExample}){
 const [failed,setFailed]=useState(false);
 if(!e.image_url||failed)return <Box sx={{p:3,bgcolor:'action.hover'}}><Typography variant="body2" color="text.secondary">{e.kind==='sample_application'?'Application example':'No project image provided'}</Typography></Box>;
 return <Box component="img" src={e.image_url} alt={e.image_alt||e.title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} sx={{width:'100%',height:200,objectFit:'contain',bgcolor:'action.hover'}}/>;
}
export function ExampleCards({examples,title='Funded projects & application examples'}:{examples:(ProgramExample&{fetched_at:string})[];title?:string}){
 return <Box component="section" sx={{mt:4}}>
  <Typography variant="h5" component="h2">{title}</Typography>
  <Typography color="text.secondary" sx={{mt:1,mb:2}}>See what the funder has supported and any public application examples. These are historical references, not current eligibility or a promise of an award.</Typography>
  {!examples.length?<Typography sx={{p:3,border:1,borderColor:'divider',borderRadius:2}}>No source-supported examples found yet. Some funders do not publish applications or project images. Official-source research will add examples when available.</Typography>:<Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
   {examples.map(e=><Card key={e.url} variant="outlined"><ExampleImage example={e}/><CardContent>
    <Chip size="small" label={e.kind==='sample_application'?'Public application example':'Funded project / recipient'}/>
    <Typography variant="h6" component="h3" sx={{mt:1}}>{e.title}</Typography>
    {e.year&&<Typography variant="caption">Year mentioned by source: {e.year}</Typography>}
    <Typography component="blockquote" sx={{my:2,fontStyle:'italic'}}>“{e.excerpt}”</Typography>
    <Typography variant="caption" sx={{display:'block'}}>Source excerpt · Checked {new Date(e.fetched_at).toLocaleDateString('en-US',{timeZone:'UTC'})}</Typography>
    {e.image_url&&<Typography variant="caption" sx={{display:'block'}}>Image supplied by the source; rights remain with its owner.</Typography>}
    <Stack direction="row" spacing={1} sx={{mt:2,flexWrap:'wrap'}}><Button component="a" href={e.url} target="_blank" rel="noopener noreferrer">{e.kind==='sample_application'?'Read application example':'View full project'} ↗</Button><Button component="a" href={e.source_url} target="_blank" rel="noopener noreferrer">Funder evidence ↗</Button></Stack>
   </CardContent></Card>)}
  </Box>}
 </Box>;
}

