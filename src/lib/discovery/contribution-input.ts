import {z} from 'zod';
import {canonicalUrl} from '../opportunities/research';
export const contributionFields=['program','status','deadline','minimum','maximum','eligibility','applicants','geography','rolling'] as const;
const schema=z.object({url:z.string().trim().max(2048),opportunityId:z.union([z.literal(''),z.string().uuid()]),field:z.enum(contributionFields),proposed:z.string().trim().max(2000),note:z.string().trim().max(2000)});
export function contributionInput(input:unknown){
 const value=schema.parse(input);
 if((value.field==='program')!==!value.opportunityId)throw Error('Choose a grant and field for a correction.');
 if(value.field!=='program'&&!value.proposed)throw Error('Describe the proposed correction.');
 return {...value,url:canonicalUrl(value.url)};
}
export const contributionLabels={checking:'Checking evidence',applied:'Applied',unconfirmed:'Could not confirm',decision:'Needs administrator decision'} as const;
