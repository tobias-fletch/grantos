import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountAllowed,editorAllowed,requireBetaOwner} from '../src/lib/beta/security';

test('unverified trusted owner can administer development only; role and revocation checks remain enforced',async()=>{
 const env:Record<string,string|undefined>=process.env;
 const old=env.NODE_ENV;
 const owner={beta_owner:true,catalog_editor:true,beta_active:true,email_verified_at:null,disabled_at:null};
 const db={query:async()=>({rows:[owner]})} as any;
 try{
  env.NODE_ENV='development';
  assert.equal(accountAllowed(owner,true),true);
  assert.equal(await editorAllowed(db,'owner'),true);
  assert.equal(await requireBetaOwner(db,'owner'),owner);
  assert.equal(accountAllowed({...owner,beta_owner:false},true),false);
  assert.equal(accountAllowed({...owner,beta_active:false},true),false);
  assert.equal(accountAllowed({...owner,disabled_at:new Date()},true),false);
  for(const mode of ['production','test']){
   env.NODE_ENV=mode;
   assert.equal(accountAllowed(owner,true),false);
   assert.equal(await editorAllowed(db,'owner'),false);
   await assert.rejects(()=>requireBetaOwner(db,'owner'));
  }
  assert.equal(owner.email_verified_at,null);
 }finally{if(old===undefined)delete env.NODE_ENV;else env.NODE_ENV=old;}
});
