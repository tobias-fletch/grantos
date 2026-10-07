import { z } from 'zod';
import { categories, applicantTypes } from './store';

const optionalAmount=z.preprocess(v=>v===''||v==null?null:Number(v),z.number().finite().min(0).max(100000000).nullable());
const optionalDate=z.preprocess(v=>v===''||v==null?null:v,z.string().datetime({offset:true}).nullable());
export const reviewSchema=z.object({
 id:z.union([z.string().uuid(),z.literal('')]),
 name:z.string().trim().min(3).max(250),funder:z.string().trim().min(2).max(250),
 url:z.string().url().max(2000),summary:z.string().trim().min(20).max(3000),
 eligibility:z.string().trim().min(20).max(5000),notes:z.string().trim().min(10).max(3000),
 evidence:z.string().trim().min(30).max(3000),
 status:z.enum(['open','upcoming','closed','unannounced','unknown']),
 minimum:optionalAmount,maximum:optionalAmount,fee:optionalAmount,deadline:optionalDate,opens:optionalDate,
 rolling:z.boolean().default(false),currency:z.string().regex(/^[A-Z]{3}$/),
 categories:z.array(z.string().refine(v=>categories.includes(v))).min(1).max(14),
 applicants:z.array(z.string().refine(v=>applicantTypes.includes(v))).min(1).max(9),
 locations:z.string().trim().min(2).max(4000),
 attested:z.literal('yes'),archive:z.boolean().default(false),
}).superRefine((v,ctx)=>{
 if(v.minimum!=null&&v.maximum!=null&&v.minimum>v.maximum)ctx.addIssue({code:'custom',message:'Minimum award exceeds maximum.'});
 if(v.status==='upcoming'&&!v.opens)ctx.addIssue({code:'custom',message:'Upcoming programs need a published opening timestamp.'});
 if(v.deadline&&v.opens&&Date.parse(v.deadline)<=Date.parse(v.opens))ctx.addIssue({code:'custom',message:'Deadline must follow opening time.'});
 if(v.status==='open'&&v.deadline&&Date.parse(v.deadline)<Date.now())ctx.addIssue({code:'custom',message:'A passed deadline cannot be marked open.'});
 if(v.status==='open'&&v.opens&&Date.parse(v.opens)>Date.now())ctx.addIssue({code:'custom',message:'A future opening cannot be marked open.'});
});
export function parseLocations(text:string) {
 const rows=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 if(!rows.length||rows.length>60) throw new Error('Enter 1–60 eligibility locations.');
 return rows.map(row=>{
  if(row==='Worldwide')return {country:null,state:null,city:null};
  const parts=row.split('|').map(p=>p.trim());
  if(parts.length>3||!parts[0]||parts.some(p=>p.length>150))throw new Error('Use Country | State | City, one region per line.');
  return {country:parts[0],state:parts[1]||null,city:parts[2]||null};
 });
}
