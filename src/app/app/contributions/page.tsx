import {ownContributions} from '@/lib/discovery/contribution-store';
import Link from 'next/link';
import {Alert,Box,Button,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import {requireWorkspace} from '@/lib/auth/workspace';
import {pool} from '@/lib/db/pool';
import {submitContribution} from '@/app/actions/contributions';
import {contributionFields,contributionLabels} from '@/lib/discovery/contribution-input';
export default async function Contributions({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {session,workspace}=await requireWorkspace();const p=await searchParams;
 const target=p.grant&&/^[a-f0-9-]{36}$/i.test(p.grant)?(await pool.query("SELECT id,name FROM opportunities WHERE id=$1 AND publication_state='published' AND merged_into IS NULL",[p.grant])).rows[0]:null;
 const rows=await ownContributions(pool,session.user.id);
 return <Stack spacing={3}><Link href='/app/opportunities'>← Find grants</Link><Typography variant='h4'>{target?'Report a correction':'Suggest a grant'}</Typography>
 <Typography>Share an official source. We check its evidence before changing public facts. Your explanation is visible only to you and administrators.</Typography>
 {p.submitted&&<Alert severity='success'>Suggestion received. You can track its progress below.</Alert>}
 {p.error&&<Alert severity='warning'>{p.error==='limit'?'You have reached the hourly suggestion limit. Please try later.':p.error==='readonly'?'Your workspace is read-only.':'Check the public HTTPS URL and required fields, then try again.'}</Alert>}
 {workspace.role!=='viewer'&&<Paper sx={{p:3}}><Box component='form' action={submitContribution}><Stack spacing={2}>
 {target&&<Typography>{target.name}</Typography>}<input type='hidden' name='opportunityId' value={target?.id??''}/>
 <TextField name='url' label='Official source URL' type='url' required slotProps={{htmlInput:{maxLength:2048}}}/>
 {target?<><TextField select name='field' label='Fact to correct' defaultValue='status'>{contributionFields.filter(f=>f!=='program').map(f=><MenuItem key={f} value={f}>{({status:'Application status',deadline:'Deadline',minimum:'Minimum award',maximum:'Maximum award',eligibility:'Eligibility',applicants:'Applicant types',geography:'Location',rolling:'Rolling applications'} as Record<string,string>)[f]}</MenuItem>)}</TextField><TextField name='proposed' label='Proposed correction' required multiline slotProps={{htmlInput:{maxLength:2000}}}/></>:<input type='hidden' name='field' value='program'/>}
 <TextField name='note' label='Explanation (optional)' multiline slotProps={{htmlInput:{maxLength:2000}}}/><Button type='submit' variant='contained'>Submit for evidence checks</Button></Stack></Box></Paper>}
 <Typography variant='h5'>Your recent contributions</Typography>{rows.length===0&&<Typography>No contributions yet.</Typography>}{rows.map(r=><Paper key={r.id} sx={{p:2}}><Stack spacing={1}><Typography sx={{fontWeight:700}}>{contributionLabels[r.state as keyof typeof contributionLabels]}</Typography><Typography>{r.outcome}</Typography><a href={r.source_url} target='_blank' rel='noopener noreferrer'>Submitted source ↗</a>{r.proposed_value&&<Typography>Suggested: {r.proposed_value}</Typography>}{r.note&&<Typography>Your note: {r.note}</Typography>}</Stack></Paper>)}</Stack>;
}
