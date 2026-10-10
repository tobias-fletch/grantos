import type { Geography } from './ranking';
import type { SearchParams } from './store';
export const usStates:Record<string,string> = Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|PR:Puerto Rico'.split('|').map(v=>v.split(':')));
const clean=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,100):'';
export function normalizeState(v:unknown){const s=clean(v);return usStates[s.toUpperCase()]??Object.values(usStates).find(n=>n.toLowerCase()===s.toLowerCase())??s;}
export type SearchLocation={country:string;state:string;city:string;postal_code:string;county?:string;borough?:string};
const countryNames=new Intl.DisplayNames(['en'],{type:'region'});
const knownCountries=new Set(Array.from({length:676},(_,i)=>countryNames.of(String.fromCharCode(65+Math.floor(i/26),65+i%26))!.toLowerCase()).filter(n=>n.length>2));
export function explicitPlace(value:string):Partial<Geography>|null{
 const text=value.trim().replace(/^the /i,'');
 if(/^[a-z]{2}$/i.test(text))return null;
 if(/^(worldwide|global|international)$/i.test(text))return {country:'Worldwide',rule:'eligible'};
 if(/^New York City$/i.test(text))return {country:'United States',state:'New York',city:'New York City',rule:'eligible'};
 const state=normalizeState(text.replace(/ State$/i,''));
 if(Object.values(usStates).includes(state)&&knownCountries.has(text.toLowerCase()))return null;
 if(Object.values(usStates).includes(state))return {country:'United States',state,rule:'eligible'};
 const parts=text.split(',').map(p=>p.trim());
 let country=normalizeCountry(parts.at(-1));
 if(parts.length===2&&Object.values(usStates).includes(normalizeState(parts[1])))return {country:'United States',state:normalizeState(parts[1]),city:parts[0],rule:'eligible'};
 if(!knownCountries.has(country.toLowerCase())||parts.length>3)return null;
 // Compound restrictions need a dedicated parser; never truncate them into a country match.
 if(parts.some(p=>/\b(and|or|except|excluding|within|outside|only if)\b/i.test(p)))return null;
 if(parts.length===1)return {country,rule:'eligible'};
 if(parts.length===2)return null; // City versus province cannot be inferred from two names.
 return {country,state:country==='United States'?normalizeState(parts[1]):parts[1],city:parts[0],rule:'eligible'};
}
export function normalizeCountry(value:unknown){const s=clean(value);if(/^(us|usa|u\.s\.|united states(?: of america)?)$/i.test(s))return 'United States';if(/^(uk|gb|great britain|united kingdom)$/i.test(s))return 'United Kingdom';if(/^(worldwide|global|international)$/i.test(s))return 'Worldwide';if(/^[a-z]{2}$/i.test(s))return countryNames.of(s.toUpperCase())??s;return s;}
export function normalizeLocation(v:Partial<SearchLocation>):SearchLocation{
 const country=normalizeCountry(v.country),us=!country||country==='United States',postal=clean(v.postal_code);
 return {country,state:us?normalizeState(v.state):clean(v.state),city:us&&/^(nyc|new york|new york city)$/i.test(clean(v.city))?'New York City':clean(v.city),postal_code:us?(/^\d{5}(?:-\d{4})?$/.test(postal)?postal.slice(0,5):''):(/^[\p{L}\d][\p{L}\d -]{0,19}$/u.test(postal)?postal.toUpperCase().replace(/\s/g,''):''),county:clean(v.county),borough:clean(v.borough)};
}
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
 const t=normalizeLocation(target),parts=scope.split(/\s*[,/|]\s*/).map(v=>v.trim().toLowerCase()),country=t.country.toLowerCase();
 const nations=parts.map(p=>normalizeCountry(p).toLowerCase());
 if(nations.every(n=>knownCountries.has(n)||n==='worldwide')&&(nations.includes(country)||nations.includes('worldwide')))return 2;
 if(parts.length===1&&normalizeCountry(parts[0]).toLowerCase()==='worldwide')return 2;
 if(parts.length===1&&normalizeCountry(parts[0]).toLowerCase()===country)return 2;
 // Unqualified legacy local scopes are U.S. sources. Elsewhere require country context
 // to avoid matching cities with the same name in different countries.
 const hasCountry=parts.some(p=>normalizeCountry(p).toLowerCase()===country);
 const qualified=hasCountry||t.country==='United States'&&(!parts.some(p=>knownCountries.has(normalizeCountry(p).toLowerCase()))||parts.length===1&&parts[0]===t.state.toLowerCase());
 if(!qualified)return 0;
 if(t.state&&parts.filter(p=>normalizeCountry(p).toLowerCase()!==country).length===1&&parts.includes(t.state.toLowerCase()))return 3;
 if(t.city&&parts.includes(t.city.toLowerCase())&&(!t.state||!hasCountry||parts.length<3||parts.includes(t.state.toLowerCase())))return 4;
 if(t.country==='United States'&&/^(national|nationwide)$/.test(scope.trim().toLowerCase()))return 2;
 return 0;
}
