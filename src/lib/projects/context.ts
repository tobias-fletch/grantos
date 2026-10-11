import {z} from 'zod';

export const legalStatuses=['unknown','individual','business','nonprofit','fiscally_sponsored','other'] as const;
const optionalText=(max:number)=>z.string().trim().max(max).optional();
/** User-supplied project context, not independently verified facts or eligibility. */
export const projectContextSchema=z.object({
 legal_status:z.preprocess(value=>value===''?undefined:value,z.enum(legalStatuses).optional()),
 service_area:optionalText(1000),
 beneficiaries:optionalText(2000),
 activities:optionalText(4000),
 intended_outcomes:optionalText(3000),
 evidence:optionalText(6000),
 evidence_url:z.string().trim().max(2000).refine(value=>{
  if(!value)return true;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}
 },'Use an http or https URL without login credentials').optional(),
});
export type ProjectContext=z.infer<typeof projectContextSchema>;
export const projectContextFields=['legal_status','service_area','beneficiaries','activities','intended_outcomes','evidence','evidence_url'] as const;
/** An absent context section preserves the profile when older forms submit. */
export function projectContextFromForm(form:FormData):ProjectContext|undefined{
 if(!projectContextFields.some(key=>form.has(`context_${key}`)))return undefined;
 return projectContextSchema.parse(Object.fromEntries(projectContextFields.map(key=>[key,form.get(`context_${key}`)??undefined])));
}
