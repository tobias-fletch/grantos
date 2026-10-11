'use client';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ApplicationGuidance, GuidanceField, GuidanceProvenance } from '@/lib/applications/guidance';
const labels:Record<GuidanceField,string>={application_url:'Official application route',eligibility:'Eligibility requirements',document:'Required documents',step:'Application steps',deadline:'Deadline',fee:'Application fee',match:'Matching funds',question:'Verified application questions',criterion:'Published selection criteria'};
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('en-US',{timeZone:'UTC'}):'Not verified';
export function SourceProvenance({source}:{source:GuidanceProvenance & {originalValue?:string}}){
  return <Box component="details" sx={{my:1,overflowWrap:'anywhere'}}><summary>Original source evidence</summary>
    {source.originalValue&&<Typography sx={{mt:1}}>{source.originalValue}</Typography>}
    <Typography variant="body2" sx={{whiteSpace:'pre-wrap',my:1}}>{source.excerpt}</Typography>
    <Typography variant="caption" component="p">{source.section?source.section+' · ':''}Cycle: {source.cycle??'Not stated'} · {source.method==='assistant-reviewed'?'Assistant source review '+date(source.reviewedAt??null)+' · ':''}Source fetched {date(source.fetchedAt)} · Human verified {date(source.verifiedAt)}</Typography>
    {source.applicantScope&&<Typography variant="body2">Applies to: {source.applicantScope}. Confirm your applicant route.</Typography>}
    <Button component="a" href={source.sourceUrl} target="_blank" rel="noopener noreferrer" size="small">Read cited source ↗</Button>
  </Box>;
}
export function ApplicationGuidanceCard({guidance:g}:{guidance:ApplicationGuidance}){
  return <Card id="how-to-apply" sx={{mt:3}}><CardContent sx={{p:3}}>
    <Typography variant="h2">How to apply</Typography>
    <Typography sx={{my:2}}>Program-specific requirements are shown only where supported by current recorded evidence. This partial guide does not establish your eligibility.</Typography>
    {g.warnings.map(w=><Alert severity="warning" key={w} sx={{my:1}}>{w}</Alert>)}
    <Stack direction="row" sx={{gap:1,my:2,flexWrap:'wrap'}}>
      {g.applicationUrl&&<Button component="a" href={g.applicationUrl} target="_blank" rel="noopener noreferrer" variant="outlined">Open verified application route ↗</Button>}
      {g.programUrl&&<Button component="a" href={g.programUrl} target="_blank" rel="noopener noreferrer">Read official program source ↗</Button>}
    </Stack>
    {!g.applicationUrl&&<Typography sx={{my:1}}>Application portal: Unknown or unverified. Some programs require contacting the funder first; follow only their recorded instructions.</Typography>}
    <Typography variant="body2" color="text.secondary">Source checked {date(g.sourceCheckedAt)} · Guidance last human verified {date(g.lastVerifiedAt)}. Opening a link or saving work here does not submit an application.</Typography>
    {(['eligibility','document','step','deadline','fee','match','question','criterion'] as GuidanceField[]).map(field=><Box key={field} sx={{mt:3}}>
      <Typography variant="h3">{labels[field]}</Typography>
      {g.items.some(i=>i.field===field)?<Box component={field==='step'?'ol':'ul'} sx={{pl:3}}>{g.items.filter(i=>i.field===field).map((item,i)=><Box component="li" key={i} sx={{my:2}}>
        <Typography sx={{whiteSpace:'pre-wrap'}}>{item.value}</Typography>
        {item.provenance.applicantScope&&<Typography variant="body2" sx={{fontWeight:600}}>Applicant route: {item.provenance.applicantScope}</Typography>}
        <SourceProvenance source={item.provenance}/>
      </Box>)}</Box>:<Typography sx={{mt:1}}>Unknown / unverified. Check the current official requirements.</Typography>}
    </Box>)}
    <Box sx={{mt:3,p:2,bgcolor:'action.hover',borderRadius:2}}><Typography variant="h3">GrantOS preparation suggestions</Typography>
      <Typography variant="body2" sx={{my:1}}>General advice, separate from the funder’s requirements and questions.</Typography>
      <Box component="ul" sx={{pl:3}}>{g.suggestions.map(s=><li key={s}>{s}</li>)}</Box>
    </Box>
  </CardContent></Card>;
}
