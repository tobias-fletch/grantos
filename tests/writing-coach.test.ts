import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {editorialOutline,editorialWordBudget,numbersToVerify,recordedWordLimit,reviewDraft,suggestWritingSection,writingSections,writingStyles} from '../src/lib/applications/writing-coach';
import {QuestionWritingCoach,ApplicationWritingResources} from '../src/components/ui/application-writing';
import {writingResourceCatalog} from '../src/lib/applications/writing-resource-catalog';

test('the coach reports exact word counts, unknown limits and unresolved bracketed text without judging readiness',()=>{
  const empty=reviewDraft({question:'Describe your work',answer:'',wordLimit:null});
  assert.equal(empty.words,0);assert.equal(empty.limit,null);assert.equal(empty.remaining,null);
  assert.deepEqual(empty.prompts.map(p=>p.id),['empty','unknown-limit']);
  assert.equal(empty.humanReviewRequired,true);
  const draft=reviewDraft({question:'Project summary',answer:'First sentence. [Add source] [Add source]',wordLimit:4});
  assert.equal(draft.words,6);assert.equal(draft.remaining,-2);assert.equal(draft.placeholders.length,1);
  assert.ok(draft.prompts.some(p=>p.id==='over-limit'&&p.kind==='exact'&&p.detail.includes('2 word(s)')));
  assert.ok(draft.prompts.some(p=>p.id==='placeholders'&&p.detail.includes('genuine citations')));
  assert.ok(!('score' in draft));
});
test('numeric scan asks users to verify amounts, dates and targets rather than asserting falsehoods',()=>{
  const passages=numbersToVerify('We plan to reach 50 people in 2027. Cost: $1,500 at $30 per person. Target: 75%.\nhttps://census.gov/data/2026\n[Add 100 participants]');
  assert.equal(passages.length,3);
  assert.deepEqual(passages[0].numbers,['50','2027']);
  assert.deepEqual(passages[1].numbers,['$1,500','$30']);
  assert.deepEqual(passages[2].numbers,['75%']);
  assert.equal(numbersToVerify('We work with fifty people.').length,0);
  assert.equal(numbersToVerify(Array.from({length:20},(_,i)=>`Group ${i}.`).join('\n')).length,8);
});
test('evidence, delivery, measurement and absolute-language checks remain explicit heuristic review prompts',()=>{
  const draft=reviewDraft({question:'How will you measure outcomes?',answer:'We guarantee everyone will thrive.',wordLimit:100});
  for(const id of ['evidence','timeline','measurement','absolute'])assert.ok(draft.prompts.some(p=>p.id===id&&p.kind==='heuristic'));
  const evidence=reviewDraft({question:'Need and beneficiaries',answer:'According to a 2025 survey, 30 people requested classes. See https://census.gov/data.',wordLimit:100});
  assert.ok(!evidence.prompts.some(p=>p.id==='evidence'));
  assert.equal(evidence.numbers.length,1); // A source marker never verifies the figures.
  assert.equal(evidence.humanReviewRequired,true);
  const plan=reviewDraft({question:'Delivery activities',answer:'[Add a timeline in months and a survey]',wordLimit:100});
  assert.ok(plan.prompts.some(p=>p.id==='timeline')); // Placeholder vocabulary cannot satisfy a check.
});
test('section choices and original editable planning prompts do not invent project facts or funder limits',()=>{
  assert.equal(suggestWritingSection('Explain budget costs'),'budget');
  assert.equal(suggestWritingSection('Describe timeline and activities'),'plan');
  assert.equal(suggestWritingSection('Who are the beneficiaries?'),'need');
  assert.equal(suggestWritingSection('Relevant qualifications and experience'),'capacity');
  assert.equal(suggestWritingSection('Tell us about your project'),'summary');
  for(const section of Object.keys(writingSections) as (keyof typeof writingSections)[]){
    for(const style of Object.keys(writingStyles) as (keyof typeof writingStyles)[]){
      const outline=editorialOutline(section,style);
      assert.match(outline,/editorial outline/);assert.match(outline,/\[/);
      assert.ok(!outline.includes('will win'));assert.ok(!outline.includes('100 participants'));
    }
    const budget=editorialWordBudget(101,section);
    assert.equal(budget.reduce((n,p)=>n+p.words,0),90);
    assert.equal(editorialWordBudget(null,section).length,0);
  }
  for(const value of [null,undefined,'',0,-1,'hello',Infinity,50001,1.5,true,{},[]])assert.equal(recordedWordLimit(value),null);
  assert.equal(recordedWordLimit('250'),250);
});
test('coach renders unknown criteria, live word-limit prompts and non-mutating copy controls',()=>{
  const html=renderToStaticMarkup(createElement(QuestionWritingCoach,{question:'Need',answer:'One two three',wordLimit:2,sourceUrl:'javascript:alert(1)'}));
  assert.match(html,/Over the recorded word limit/);assert.match(html,/Current published review criteria: unknown or unverified here/);
  assert.match(html,/Copy outline/);assert.match(html,/Copying leaves your draft unchanged/);
  assert.doesNotMatch(html,/javascript:/);assert.doesNotMatch(html,/<form/);
  assert.match(html,/do not verify facts/);
});
test('criteria stay verbatim source-backed review material, never a pass/fail or simulated award score',()=>{
  const provenance={sourceUrl:'https://arts.gov/grants',excerpt:'Published criterion: artistic merit.',fetchedAt:'2026-10-11T00:00:00Z',verifiedAt:'2026-10-11T00:00:00Z',snapshotId:'snapshot',cycle:'2026',section:'Criteria',applicantScope:'Organizations',method:'human-reviewed' as const,reviewId:'review'};
  const html=renderToStaticMarkup(createElement(QuestionWritingCoach,{question:'Describe your project',answer:'Artistic merit',criteria:[{field:'criterion',value:'Published criterion: artistic merit.',provenance}]}));
  assert.match(html,/Published criterion: artistic merit/);assert.match(html,/Original source evidence/);
  assert.match(html,/There is no automatic criterion-satisfaction score/);
  assert.doesNotMatch(html.replace(/<style[^>]*>[\s\S]*?<\/style>/gu,''),/criterion satisfied|100%|award probability/);
});
test('resource library distinguishes funded proposals, narrative sections, directories and abstracts',()=>{
  const html=renderToStaticMarkup(createElement(ApplicationWritingResources,{resources:{programUrl:'https://arts.gov/grants',savedSourceUrl:null,examples:[]}}));
  for(const resource of writingResourceCatalog){
    assert.ok(resource.url.startsWith('https://'));assert.equal(resource.verifiedAt,'2026-10-11');
    assert.ok(html.includes(resource.title));
  }
  assert.match(html,/Funded narrative excerpts/);assert.match(html,/Awardee directory, not applications/);
  assert.match(html,/Funded project abstracts, not proposals/);assert.match(html,/No source-supported examples are recorded for this grant/);
  assert.match(html,/independent learning resources are not matched awards/);
});
