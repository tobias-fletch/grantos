import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applicationNextAction} from '../src/lib/applications/next-action';
const app={stage:'preparing',project_id:'project'};
const meets={kind:'eligibility',data:{status:'meets'}};
test('next action follows saved state without asserting readiness or submitting',()=>{
 assert.equal(applicationNextAction({...app,project_id:null}).section,'preparation');
 assert.equal(applicationNextAction(app).section,'how-to-apply');
 assert.equal(applicationNextAction(app,[{kind:'eligibility',data:{status:'unchecked'}}]).section,'eligibility');
 assert.equal(applicationNextAction(app,[meets],[{title:'Attach project budget'}]).label,'Attach project budget');
 assert.equal(applicationNextAction(app,[meets,{kind:'question',data:{answer:'[Add evidence]'}}]).section,'question');
 assert.equal(applicationNextAction(app,[meets,{kind:'question',data:{answer:'Too many words',word_limit:1}}]).label,'Shorten over-limit drafts');
 assert.equal(applicationNextAction(app,[meets,{kind:'question',data:{answer:'Finished draft'}}]).label,'Review against the official application');
 assert.match(applicationNextAction(app,[meets]).detail,/Nothing is submitted here/);
});
test('archival, submission and outcomes supersede open preparation and ignore deleted tasks',()=>{
 assert.equal(applicationNextAction({...app,archived_at:'today'}).label,'Review archived application');
 assert.equal(applicationNextAction({...app,stage:'submitted'},[],[{title:'Old task'}]).section,'notes');
 for(const stage of ['awarded','declined','withdrawn'])assert.equal(applicationNextAction({...app,stage}).label,'Review the recorded outcome');
 assert.equal(applicationNextAction(app,[meets],[{title:'Deleted',deleted_at:'today'},{title:'Done',completed_at:'today'}]).section,'how-to-apply');
 assert.equal(applicationNextAction(app,[{...meets,archived_at:'today'}]).label,'Check the official requirements');
});
