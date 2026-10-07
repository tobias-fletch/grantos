'use server';
import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {AuthError} from 'next-auth';
import {signIn,signOut} from '@/auth';
import {pool} from '@/lib/db/pool';
import {allowedAttempt,requestAddress,redeemInvitation} from '@/lib/beta/security';
export async function registerAction(form:FormData){
 const email=String(form.get('email')??'').trim().toLowerCase();let failed=false;
 try{if(!await allowedAttempt(pool,'register',email,requestAddress(await headers())))throw Error('Limited');await redeemInvitation(pool,Object.fromEntries(form));}catch{failed=true;}
 if(failed)redirect('/register?error=invalid');
 await signIn('credentials',{email,password:String(form.get('password')),redirectTo:'/onboarding'});
}
export async function loginAction(form:FormData){try{await signIn('credentials',{email:String(form.get('email')??''),password:String(form.get('password')??''),redirectTo:'/app/dashboard'});}catch(e){if(e instanceof AuthError)redirect('/login?error=credentials');throw e;}}
export async function logoutAction(){await signOut({redirectTo:'/'});}
