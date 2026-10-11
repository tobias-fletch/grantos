'use client';
import { Alert, Box, Card, CardContent, Chip, Link, Stack, Typography } from '@mui/material';
import type { ApplicationFit } from '@/lib/applications/fit';

export function ProjectFit({ fit }: { fit: ApplicationFit }) {
  return <Box component="section" aria-labelledby="project-fit-title" sx={{ maxWidth: 1000, mx: 'auto', mt: 4 }}>
    <Card><CardContent>
      <Typography id="project-fit-title" variant="h2">Project fit</Typography>
      <Typography sx={{ mt: 1 }}>{fit.project ? `Connected project: ${fit.project.name}${fit.project.archived ? ' (archived)' : ''}` : 'No project connected'}</Typography>
      <Alert severity={fit.state === 'excluded' ? 'warning' : 'info'} sx={{ my: 2 }}>{fit.summary} This compares recorded facts only. It does not determine eligibility or measure writing readiness.</Alert>
      <Stack spacing={2}>{fit.checks.map(check => <Box key={check.key}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography variant="h3">{check.label}</Typography><Chip size="small" color={check.state === 'excluded' ? 'warning' : 'default'} label={check.state === 'excluded' ? 'Recorded conflict' : check.state === 'recorded_match' ? 'Broad category matches' : 'Needs confirmation'} /></Stack>
        <Typography sx={{ mt: 0.5 }}>{check.detail}</Typography>
      </Box>)}</Stack>
      {fit.eligibilityExcerpt && <Box sx={{ mt: 3 }}><Typography variant="h3">{fit.source.structured ? 'Recorded eligibility excerpt' : 'Saved source excerpt'}</Typography><Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{fit.eligibilityExcerpt}</Typography><Typography variant="body2">This excerpt may be incomplete. Review the full current requirements.</Typography></Box>}
      <Box sx={{ mt: 3 }}><Typography variant="h3">Confirm before applying</Typography><Box component="ul">{fit.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</Box></Box>
      {fit.source.url && <Link href={fit.source.url} target="_blank" rel="noopener noreferrer">Review recorded source</Link>}
      <Typography variant="body2" sx={{ mt: 1 }}>Source checked: {fit.source.checkedAt ? fit.source.checkedAt.slice(0, 10) + ' UTC' : 'Not recorded'} · Source fetched: {fit.source.fetchedAt ? fit.source.fetchedAt.slice(0, 10) + ' UTC' : 'Not recorded'}</Typography>
    </CardContent></Card>
  </Box>;
}
