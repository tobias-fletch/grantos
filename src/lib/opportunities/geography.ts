import type { Geography } from './ranking';
import type { SearchParams } from './store';
export const usStates:Record<string,string> = Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico'.split('|').map(v=>v.split(':')));
const clean=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,100):'';
export function normalizeState(v:unknown){const s=clean(v);return usStates[s.toUpperCase()]??Object.values(usStates).find(n=>n.toLowerCase()===s.toLowerCase())??s;}
export type SearchLocation={country:string;state:string;city:string;postal_code:string;county?:string;borough?:string};
export function normalizeLocation(v:Partial<SearchLocation>):SearchLocation{return {country:/^(us|usa|u\.s\.|united states(?: of america)?)$/i.test(clean(v.country))?'United States':clean(v.country),state:normalizeState(v.state),city:/^(nyc|new york|new york city)$/i.test(clean(v.city))?'New York City':clean(v.city),postal_code:/^\d{5}(?:-\d{4})?$/.test(clean(v.postal_code))?clean(v.postal_code).slice(0,5):'',county:clean(v.county),borough:clean(v.borough)};}
export function locationParams(params:SearchParams,profile:Partial<SearchLocation>={}):SearchParams{
 if(params.location==='nyc'||params.location==='nyc_only')return {...params,country:'United States',state:'New York',city:'New York City'};
 if(params.location==='any')return {...params,country:'',state:'',city:'',postal_code:''};
 const explicit=['country','state','city','postal_code'].some(k=>Object.hasOwn(params,k));
 const v=normalizeLocation(explicit?{...Object.fromEntries(['country','state','city','postal_code','county','borough'].map(k=>[k,typeof params[k]==='string'?params[k]:undefined])),country:typeof params.country==='string'?params.country:'United States'}:profile);
 return {...params,...v};
}
export type GeographicMatch={state:'eligible'|'unknown'|'excluded';reason:string};
export function matchGeography(records:Geography[],target:Partial<SearchLocation>):GeographicMatch{
 const t=normalizeLocation(target),fields=['country','state','city','county','borough','postal_code'] as const;
 const relation=(g:Geography)=>{const n=normalizeLocation(g as Partial<SearchLocation>);if(g.postal_code&&!n.postal_code)return 'unknown';if(/^(worldwide|global|international)$/i.test(n.country))n.country='';let missing=false;for(const k of fields){if(!n[k])continue;if(!t[k])missing=true;else if(n[k]!.toLowerCase()!==t[k]!.toLowerCase())return 'different';}return missing?'unknown':'matches';};
 if(records.some(g=>g.rule==='excluded'&&relation(g)==='matches'))return {state:'excluded',reason:'Not available in this location'};
 const eligible=records.filter(g=>g.rule==='eligible'&&[g.country,g.state,g.city,g.county,g.borough,g.postal_code].some(Boolean)),fits=eligible.filter(g=>relation(g)==='matches');
 if(fits.length&&!records.some(g=>g.rule==='excluded'&&relation(g)==='unknown')){const g=normalizeLocation(fits[0] as Partial<SearchLocation>);return {state:'eligible',reason:g.city?'Available in '+g.city:g.state?'Available in '+g.state:/^(worldwide|global|international)$/i.test(g.country)||!g.country?'Accepts applicants worldwide':g.country==='United States'?'Accepts applicants nationwide':'Available in '+g.country};}
 if(eligible.length&&eligible.every(g=>relation(g)==='different'))return {state:'excluded',reason:'Not available in this location'};
 return {state:'unknown',reason:'Location eligibility needs checking'};
}
// Registry scope selects research sources, never establishes grant eligibility.
export function sourceLocationPriority(scope:string,target:SearchLocation){
 if(!target.country)return 1;
 const s=scope.toLowerCase();
 if(target.city&&s.includes(target.city.toLowerCase()))return 4;
 if(target.state&&[target.state.toLowerCase(),target.state.toLowerCase()+' state'].includes(s.trim()))return 3;
 if(/^(worldwide|global|international)$/.test(s.trim()))return 2;
 if(target.country==='United States'&&/^(united states|usa|national|nationwide)$/.test(s.trim()))return 2;
 return 0;
}
