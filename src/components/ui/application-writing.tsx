'use client';

import {useState} from 'react';
import {Alert,Box,Button,Card,CardContent,Chip,MenuItem,Stack,TextField,Typography} from '@mui/material';
import type {GuidanceItem,GuidanceProvenance} from '@/lib/applications/guidance';
import {guidanceUrl} from '@/lib/applications/guidance';
import {editorialOutline,editorialWordBudget,reviewDraft,suggestWritingSection,writingSections,writingStyles,type WritingSection,type WritingStyle} from '@/lib/applications/writing-coach';
import {writingResourceCatalog} from '@/lib/applications/writing-resource-catalog';
import type {ApplicationWritingResourceData} from '@/lib/applications/writing-resources';
import {SourceProvenance} from './application-guidance';

export type QuestionWritingCoachProps={
  question:string;answer:string;wordLimit?:string|number|null;sourceUrl?:string;
  sourceProvenance?:GuidanceProvenance;criteria?:GuidanceItem[];
};
export function QuestionWritingCoach({question,answer,wordLimit,sourceUrl,sourceProvenance,criteria=[]}:QuestionWritingCoachProps){
  const [selected,setSelected]=useState<WritingSection|'auto'>('auto');
  const [style,setStyle]=useState<WritingStyle>('direct');
  const [copyState,setCopyState]=useState<'idle'|'copied'|'failed'>('idle');
  const section=selected==='auto'?suggestWritingSection(question):selected;
  const review=reviewDraft({question,answer,wordLimit,section}),outline=editorialOutline(section,style);
  const budget=editorialWordBudget(wordLimit,section),source=guidanceUrl(sourceUrl)||guidanceUrl(sourceProvenance?.sourceUrl);
  const publishedCriteria=criteria.filter(item=>item.field==='criterion');
  async function copyOutline(){
    try{await navigator.clipboard.writeText(outline);setCopyState('copied');}catch{setCopyState('failed');}
  }
  return <Box component="details" sx={{p:2,bgcolor:'action.hover',borderRadius:2,overflowWrap:'anywhere'}}>
    <summary style={{cursor:'pointer',fontWeight:700}}>Writing coach · {review.words} words · {review.prompts.length} review prompt(s)</summary>
    <Typography variant="body2" sx={{my:2}}>Local guidance on the text currently in this editor. Suggestions and keyword checks can miss issues; they do not verify facts, satisfy review criteria or predict an award. Changes are saved only with the section’s Save button.</Typography>
    <Stack direction={{xs:'column',sm:'row'}} spacing={2} sx={{my:2}}>
      <TextField select fullWidth label="Editorial structure" value={selected} onChange={event=>{setSelected(event.target.value as WritingSection|'auto');setCopyState('idle');}}>
        <MenuItem value="auto">Suggested from question: {writingSections[suggestWritingSection(question)].label}</MenuItem>
        {Object.entries(writingSections).map(([key,value])=><MenuItem key={key} value={key}>{value.label}</MenuItem>)}
      </TextField>
      <TextField select fullWidth label="Writing style" value={style} onChange={event=>{setStyle(event.target.value as WritingStyle);setCopyState('idle');}}>
        {Object.entries(writingStyles).map(([key,value])=><MenuItem key={key} value={key}>{value.label}</MenuItem>)}
      </TextField>
    </Stack>
    <Typography component="h4" sx={{fontWeight:700}}>Shape this answer</Typography>
    <Typography variant="body2">Editorial suggestions, separate from the funder’s actual questions and instructions. Choose the structure that fits; a suggested category is only a keyword guess.</Typography>
    <Box component="ol" sx={{pl:3}}>{writingSections[section].parts.map((part,i)=><li key={part}><strong>{part}:</strong> {writingSections[section].prompts[i]}</li>)}</Box>
    <Box component="ul" sx={{pl:3}}>{writingStyles[style].tips.map(tip=><li key={tip}>{tip}</li>)}</Box>
    {budget.length>0&&<Box sx={{my:2}}><Typography sx={{fontWeight:700}}>Optional word budget</Typography><Typography variant="body2">{budget.map(part=>`${part.label}: about ${part.words}`).join(' · ')}. Rough editorial allocation with a 10% reserve; not a funder rule.</Typography></Box>}
    <Box component="details" sx={{my:2}}><summary>Preview an editorial outline</summary>
      <Typography variant="body2" sx={{my:1}}>Original planning prompts, not a funded application. Copying leaves your draft unchanged. Replace prompts with your own supported facts before using them.</Typography>
      <Box component="pre" sx={{whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:'0.875rem',p:2,bgcolor:'background.paper',border:1,borderColor:'divider',borderRadius:1}}>{outline}</Box>
      <Button type="button" onClick={copyOutline}>Copy outline</Button>
      {copyState==='copied'&&<Typography role="status" variant="body2">Outline copied. Paste only the parts you want into your draft.</Typography>}
      {copyState==='failed'&&<Typography role="status" variant="body2">Copy was unavailable. Select the outline text above to copy it manually.</Typography>}
    </Box>
    <Typography component="h4" sx={{fontWeight:700}}>Draft review</Typography>
    <Typography variant="body2" sx={{my:1}}>{review.limit===null?'Word limit unknown.':`${review.words} / ${review.limit} recorded words · ${review.remaining!<0?`${-review.remaining!} over`:`${review.remaining} remaining`}.`} The official form may count words differently or use a character/page limit.</Typography>
    {review.prompts.length?<Stack spacing={1} sx={{my:2}}>{review.prompts.map(prompt=><Alert key={prompt.id} severity={prompt.id==='over-limit'?'warning':'info'}><strong>{prompt.title}</strong> · {prompt.kind==='heuristic'?'Heuristic review prompt':'Text check'}<br/>{prompt.detail}</Alert>)}</Stack>:<Typography sx={{my:2}}>No issues found by these limited text checks. This does not mean the answer is complete, accurate or ready to submit.</Typography>}
    <Box component="details" sx={{my:2}}><summary>Numbers to verify ({review.numbers.length} passages shown, up to 8)</summary>
      <Typography variant="body2" sx={{my:1}}>Digit-based scan, not fact-checking. Verify amounts, counts, percentages, dates, units, sources and calculations. Label targets or estimates clearly. Numbers written as words and other claims may be missed; a citation does not prove a claim.</Typography>
      {review.numbers.length?<Box component="ul" sx={{pl:3}}>{review.numbers.map((passage,i)=><Box component="li" key={i} sx={{my:1}}><Typography variant="body2" sx={{whiteSpace:'pre-wrap'}}>{passage.text}</Typography><Typography variant="caption">Check: {passage.numbers.join(', ')}</Typography></Box>)}</Box>:<Typography variant="body2">No digit-based passages found. Review other factual claims yourself.</Typography>}
    </Box>
    <Box component="details" sx={{my:2}}><summary>Compare with the question and published criteria</summary>
      <Typography sx={{my:1,fontWeight:600}}>Current question in your editor</Typography>
      <Typography sx={{whiteSpace:'pre-wrap'}}>{question||'No question entered yet.'}</Typography>
      <Typography variant="body2" sx={{my:1}}>Read every part of the question. Point to the sentence in your answer that addresses each part and the evidence supporting it. There is no automatic criterion-satisfaction score.</Typography>
      {sourceProvenance&&<Typography variant="body2">This section retains original source evidence. Edited question text may differ from that source.</Typography>}
      {publishedCriteria.length?<Box component="ul" sx={{pl:3}}>{publishedCriteria.map((criterion,i)=><Box component="li" key={i} sx={{my:2}}><Typography sx={{whiteSpace:'pre-wrap'}}>{criterion.value}</Typography><SourceProvenance source={criterion.provenance}/></Box>)}</Box>:<Typography variant="body2">Current published review criteria: unknown or unverified here. Check the actual funder rubric; the editorial outline above is not a replacement.</Typography>}
      {source&&<Button component="a" href={source} target="_blank" rel="noopener noreferrer">Read recorded requirements source ↗</Button>}
    </Box>
  </Box>;
}

export function ApplicationWritingResources({resources}: {resources:ApplicationWritingResourceData}){
  return <Card id="writing-resources" sx={{mt:3}}><CardContent sx={{p:3}}>
    <Typography variant="h2">Learn from funded work and official guidance</Typography>
    <Typography sx={{my:2}}>Examples show structure and context, not a formula for funding. Follow the current funder instructions and write from your own evidence. Public access does not give permission to copy an applicant’s prose.</Typography>
    <Typography variant="h3">Examples associated with this grant</Typography>
    {resources.examples.length?<Stack spacing={2} sx={{my:2}}>{resources.examples.map(example=><Box key={example.url} sx={{p:2,border:1,borderColor:'divider',borderRadius:2}}>
      <Chip size="small" label={example.kind==='funded_project'?'Funded project / recipient summary':'Public sample; award outcome not verified'}/>
      <Typography sx={{fontWeight:700,my:1}}>{example.title}</Typography>
      <Typography variant="body2">{example.excerpt}</Typography>
      <Typography variant="caption" component="p" sx={{my:1}}>Source excerpt · {example.year?`Year mentioned: ${example.year} · `:''}Source checked {new Date(example.fetchedAt).toLocaleDateString('en-US',{timeZone:'UTC'})}</Typography>
      <Typography variant="body2">{example.kind==='funded_project'?'Use this to understand supported work. A recipient summary does not show the submitted proposal or why it was selected.':'Read the source to determine which sections are available. A sample is not evidence of an award or a complete successful submission.'}</Typography>
      <Stack direction="row" sx={{flexWrap:'wrap',gap:1,mt:1}}><Button component="a" href={example.url} target="_blank" rel="noopener noreferrer">Open example ↗</Button><Button component="a" href={example.sourceUrl} target="_blank" rel="noopener noreferrer">Read source evidence ↗</Button></Stack>
    </Box>)}</Stack>:<Alert severity="info" sx={{my:2}}>No source-supported examples are recorded for this grant. Full successful proposals may not be public. This does not mean the program has never funded a project.</Alert>}
    {(resources.programUrl||resources.savedSourceUrl)&&<Button component="a" href={(resources.programUrl||resources.savedSourceUrl)!} target="_blank" rel="noopener noreferrer">{resources.programUrl?'Check the official program source':'Check your saved grant source'} ↗</Button>}
    <Typography variant="h3" sx={{mt:3}}>Writing reference library</Typography>
    <Typography variant="body2" sx={{my:1}}>These independent learning resources are not matched awards for this application. Compare the resource type, audience and historical period before borrowing an approach. Only the first three collections below publish application or narrative material identified as funded or successful by their publisher.</Typography>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:2,mt:2}}>{writingResourceCatalog.map(resource=><Card key={resource.id} variant="outlined"><CardContent>
      <Chip size="small" label={resource.badge} sx={{height:'auto','& .MuiChip-label':{whiteSpace:'normal',py:0.5}}}/>
      <Typography variant="h3" sx={{mt:2,fontSize:'1.1rem'}}>{resource.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{my:1}}>{resource.publisher} · {resource.audience}</Typography>
      <Typography variant="body2"><strong>What to study:</strong> {resource.learnFrom}</Typography>
      <Typography variant="body2" sx={{my:1}}><strong>Limits:</strong> {resource.limitations}</Typography>
      <Typography variant="caption" component="p">{resource.period} · Links and classification checked {resource.verifiedAt}. Recheck current instructions.</Typography>
      <Box component="details" sx={{my:1}}><summary>Reuse and rights</summary><Typography variant="body2">{resource.rightsNote}</Typography></Box>
      <Button component="a" href={resource.url} target="_blank" rel="noopener noreferrer">Read publisher’s resource ↗</Button>
      {resource.companion&&<Button component="a" href={resource.companion.url} target="_blank" rel="noopener noreferrer" size="small">{resource.companion.title} ↗</Button>}
    </CardContent></Card>)}</Box>
  </CardContent></Card>;
}
