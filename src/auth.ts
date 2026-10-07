import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {pool} from '@/lib/db/pool';
import {accountAllowed,allowedAttempt,requestAddress,validSession} from '@/lib/beta/security';
const credentialsSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(8).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72)});
export const {handlers,auth,signIn,signOut}=NextAuth({
 session:{strategy:'jwt',maxAge:60*60*24*7},pages:{signIn:'/login'},
 logger:{error(){console.error('Authentication request failed');},warn(code){console.warn('Authentication configuration warning',code);}},
 providers:[Credentials({credentials:{email:{type:'email'},password:{type:'password'}},async authorize(raw,request){
  const p=credentialsSchema.safeParse(raw);if(!p.success)return null;
  if(!await allowedAttempt(pool,'login',p.data.email,requestAddress(request.headers)))return null;
  const u=(await pool.query('SELECT * FROM users WHERE lower(email)=$1',[p.data.email])).rows[0];
  // Fixed valid bcrypt hash makes nonexistent-account requests perform comparable password work.
  const valid=await bcrypt.compare(p.data.password,u?.password_hash??'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttx/XAoPKCJNypQ5CyyXMlrLG.wG');
  if(!valid||!accountAllowed(u))return null;
  return {id:u.id,email:u.email,name:u.name,sessionVersion:u.session_version};
 }})],
 callbacks:{async jwt({token,user}){if(user){token.userId=user.id;token.sessionVersion=(user as typeof user&{sessionVersion:number}).sessionVersion;}
  if(typeof token.userId==='string'&&typeof token.sessionVersion==='number'){
   const u=await validSession(pool,token.userId,token.sessionVersion);if(u){token.editor=!!(accountAllowed(u,true)&&u.catalog_editor);token.owner=!!(accountAllowed(u,true)&&u.beta_owner);return token;}
  }
  token.userId='';token.editor=false;token.owner=false;return token;
 },session({session,token}){if(session.user){session.user.id=String(token.userId??'');session.user.catalogEditor=!!token.editor;session.user.betaOwner=!!token.owner;}return session;}}
});
