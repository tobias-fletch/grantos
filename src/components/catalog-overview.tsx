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
  <Alert severity={settings.paused?'warning':'info'}>{settings.paused?'Automatic research is paused.':'Searches and catalog updates run automatically.'} Most updates need no action from you. Missing facts do not need approval.</Alert>
  <Paper variant="outlined" sx={{p:3}}>
   <Typography variant="h5" component="h2">Grants people can find</Typography>
   <Typography sx={{my:1}}>{s.published} published listings · {s.added} added · {s.updated} updated in the last 24 hours</Typography>
   <Button href="/app/discovery-admin?tab=catalog">View catalog</Button><Button href="/app/opportunities">Try a search</Button>
  </Paper>
  <Paper variant="outlined" sx={{p:3}}>
   <Typography variant="h5" component="h2">Search progress</Typography>
   <Typography sx={{my:1}}>{d.searchQueue?.waiting??0} searches waiting or continuing · {d.searchQueue?.finished??0} bounded searches finished in 24 hours</Typography>
   <Typography>Last search batch: {date(d.searchQueue?.last_served_at)}</Typography>
   <Typography>Worker last seen: {date(settings.heartbeat_at)}</Typography>
   {!!Number(d.searchQueue?.overdue)&&<Alert severity="warning" sx={{mt:2}}>{d.searchQueue.overdue} searches have waited over a day. Scheduling or capacity needs attention.</Alert>}
   {(!settings.heartbeat_at||Date.now()-new Date(settings.heartbeat_at).getTime()>3*3600000)&&!settings.paused&&<Alert severity="warning" sx={{mt:2}}>Scheduled worker is overdue. Queued searches will not update until it runs.</Alert>}
   <Typography color="text.secondary" sx={{mt:1}}>Searches get the first processing turn. Existing results stay available while scheduled batches check official sources. A finished batch does not mean complete internet coverage.</Typography>
   <Button href="/app/discovery-admin?tab=activity">View recent activity</Button>
   {d.aiResearch&&<Box sx={{mt:2}}><Typography variant="subtitle2">AI catalog pilot</Typography>
    <Typography variant="body2">{d.aiResearch.last_attempt?`Last attempt: ${date(d.aiResearch.last_attempt)}`:'No AI research recorded this month; setup may still be pending.'}</Typography>
    <Typography variant="body2">{d.aiResearch.queued_links} approved-source links queued · {d.aiResearch.suggested_domains} domain suggestions · ${(Number(d.aiResearch.reserved_cents)/100).toFixed(2)} / $10 monthly allowance reserved</Typography>
    <Typography variant="caption">Reservations include failed attempts and are not the actual invoice. Links still need official-source checks before becoming grants.</Typography>
    {!!Number(d.aiResearch.failures)&&<Alert severity="warning">{d.aiResearch.failures} AI attempts failed this month. Check the research workflow; ordinary catalog maintenance continues.</Alert>}
   </Box>}
  </Paper>
  <Paper variant="outlined" sx={{p:3}}>
   <Typography variant="h5" component="h2">Needs your decision</Typography>
   <Typography sx={{my:1}}>{decisions?'Optional review is available for unfamiliar sources, conflicting records, and persistent failures. The catalog keeps working while these wait.':'Nothing needs your decision right now.'}</Typography>
   {!!decisions&&<Button href="/app/discovery-admin?tab=attention">Review exceptions ({decisions})</Button>}
   {settings.last_error&&<Alert severity="error">{settings.last_error}</Alert>}
  </Paper>
  <Accordion><AccordionSummary>Advanced diagnostics and controls</AccordionSummary><AccordionDetails><Stack spacing={3}>
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
 </Stack></AccordionDetails></Accordion>
 </Stack>;
}
