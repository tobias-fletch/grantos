"use client";
import {Accordion,AccordionDetails,AccordionSummary,Alert,Box,Button,Chip,LinearProgress,Paper,Stack,Typography} from '@mui/material';
import {CrawlButton} from './discovery-admin-form';
import {categories} from '@/lib/opportunities/store';
import {fundingFocusOptions} from '@/lib/opportunities/funding-focus';
const date=(value:string)=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/New_York'}):'Not yet recorded';
export function CatalogOverview({data:d}:{data:any}){
 const {stats:s,settings,reconciliation:r}=d;
 const decisions=Number(s.domains)+Number(s.locked)+Number(s.duplicates)+Number(s.persistent_failures)+Number(s.failed);
 return <Stack spacing={3}>
  <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
   <Typography variant="h5" component="h2">Catalog quality</Typography>
   <Typography color="text.secondary" sx={{mt:1,mb:2}}>Missing facts are researched automatically. You do not need to approve routine updates.</Typography>
   <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap',mb:3}}>
    <Chip label={`${s.published} published listings`} /><Chip label={`${s.added} added in 24h`} /><Chip label={`${s.updated} updated in 24h`} /><Chip label={`${s.facts_resolved} unknown facts resolved in 24h`} />
   </Stack>
   <Box sx={{display:'grid',gap:2,gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'}}}>
    {[['status','Application availability'],['deadline','Current deadline or rolling schedule'],['amount','Award amount'],['applicants','Applicant types'],['geography','Eligible location'],['recurrence','Recurrence']].map(([field,label])=>{
     const known=Number(d.completeness[field]??0),total=Number(d.completeness.total);
     return <Box key={field}><Typography variant="body2">{label}: {known} / {total}</Typography><LinearProgress aria-label={`${label} completeness`} variant="determinate" value={total?Math.min(100,known/total*100):0} sx={{mt:1,height:6,borderRadius:3}} /></Box>;
    })}
   </Box>
   <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>Rolling grants do not need a fixed deadline. These counts describe available facts, not blanket verification or guaranteed eligibility.</Typography>
   <Button href="/app/discovery-admin?tab=catalog">Browse catalog</Button><Button href="/app/discovery-admin?tab=research">See automatic research</Button>
  </Paper>
  <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
   <Typography variant="h5" component="h2">Worker progress</Typography>
   {(!settings.heartbeat_at||Date.now()-new Date(settings.heartbeat_at).getTime()>3*3600000)&&!settings.paused&&<Alert severity="warning" sx={{my:2}}>Worker heartbeat overdue. A configured schedule does not establish current coverage.</Alert>}
   <Typography sx={{mt:1}}>Heartbeat: {date(settings.heartbeat_at)}</Typography><Typography>Last successful maintenance: {date(settings.last_success_at)}</Typography>
   <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap',my:2}}><Chip label={`${s.overdue} due URL checks`} /><Chip label={`${s.researching} researching`} /><Chip label={`${s.retrying} retries scheduled`} /><Chip label={`${s.unavailable} with information unavailable`} /></Stack>
   {r&&<Alert severity={r.unchecked?'info':'success'} sx={{my:2}}>Latest cleanup inventory: {r.checked} processed, {r.unchecked} awaiting processing, {r.retry_scheduled} retries assigned, {r.research_needed} needing further identity research. {r.merged} merges, {r.hidden} unsuitable listings hidden, {r.facts_resolved} facts resolved. Inventory completion does not mean complete source coverage.</Alert>}
   {d.throughput?.slice(0,3).map((sample:any)=><Typography key={sample.id} variant="body2" sx={{my:1}}>{date(sample.started_at)} · {sample.successful_checks} distinct successful URL checks · Due {sample.due_before} → {sample.due_after??'Pending'} · {sample.outcome}</Typography>)}
   <Typography variant="caption" color="text.secondary">Due work also includes newly discovered and newly overdue URLs. Compare completed checks against incoming work, not just successful job labels.</Typography>
   <Box sx={{mt:2}}><Button href="/app/discovery-admin?tab=activity">View activity</Button><CrawlButton command="run" label="Queue refresh" /></Box>
   <Accordion disableGutters elevation={0} sx={{mt:2}}><AccordionSummary>Schedule and operating controls</AccordionSummary><AccordionDetails>
    <Typography>{settings.paused?'Paused':settings.hourly_enabled?'Hourly processing enabled':'Daily cadence selected'}. Existing time and page budgets still apply.</Typography>
    <Typography variant="body2">Checks target six hours near opening dates and deadlines, daily for active or recurring programs, and weekly for other closed programs. Source restrictions and capacity may delay checks.</Typography>
    {d.owner&&<Box sx={{mt:2}}><CrawlButton command={settings.hourly_enabled?'daily':'hourly'} label={settings.hourly_enabled?'Use daily cadence':'Use hourly cadence'} /><CrawlButton command={settings.paused?'resume':'pause'} label={settings.paused?'Resume automation':'Pause automation'} /></Box>}
    <Typography variant="caption">Snapshot storage: {Number(s.snapshot_mb).toFixed(1)} MB</Typography>
   </AccordionDetails></Accordion>
  </Paper>
  <Paper variant="outlined" sx={{p:{xs:2,md:3}}}>
   <Typography variant="h5" component="h2">Decisions needed</Typography>
   <Typography sx={{my:1}}>{decisions?`${decisions} exceptions across the categories below.`:'No current exceptions require your attention.'}</Typography>
   <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap'}}>{[['domain','Unfamiliar domains',s.domains],['locked','Locked fact conflicts',s.locked],['duplicate','Uncertain duplicates',s.duplicates],['unavailable','Persistent source failures',s.persistent_failures]].map(([kind,label,n])=><Button key={kind} href={`/app/discovery-admin?tab=attention&kind=${kind}`}>{label}: {n}</Button>)}</Stack>
   {Number(s.failed)>0&&<Alert severity="warning" sx={{mt:2}}>{s.failed} publication failures in the last day. <Button href="/app/discovery-admin?tab=activity">Inspect activity</Button></Alert>}
   {settings.last_error&&<Alert severity="error" sx={{mt:2}}>{settings.last_error}</Alert>}
   <Typography variant="body2" color="text.secondary" sx={{mt:2}}>Unknown facts and ordinary research stay with the worker. Review only evidence conflicts that need judgment, locked corrections, new domains, and operational failures.</Typography>
  </Paper>
  <Accordion><AccordionSummary>Source coverage and gaps</AccordionSummary><AccordionDetails>
   <Typography color="text.secondary">A registered source is a place to research. Its topics do not establish an individual grant’s eligibility or guarantee current open grants.</Typography>
   <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap',mt:2}}>{categories.map(c=>{const n=d.coverage.find((r:any)=>r.category===c)?.sources??0;return <Chip key={c} color={Number(n)?'default':'warning'} label={`${c}: ${n} sources`} />;})}</Stack>
   <Stack direction="row" useFlexGap sx={{gap:1,flexWrap:'wrap',mt:2}}>{fundingFocusOptions.map(f=><Chip key={f.value} label={`${f.label}: ${d.focusCoverage.find((r:any)=>r.focus===f.value)?.sources??0} sources`} />)}</Stack>
   <Button href="/app/discovery-admin?tab=sources">Manage sources</Button>
  </AccordionDetails></Accordion>
 </Stack>;
}
