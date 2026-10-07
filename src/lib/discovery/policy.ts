// Provider-backed research is deliberately unavailable until billing is implemented.
export const PREMIUM_SEARCH_ENABLED = false;
export function requirePremiumSearch(plan?:string) {
 if(!PREMIUM_SEARCH_ENABLED || plan!=='paid')throw new Error('Premium web research — coming later. Direct source discovery remains available.');
}
export function scheduledDay(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 const day=`${get('year')}-${get('month')}-${get('day')}`;
 if(Number(get('hour'))>=6)return day;
 // Date arithmetic on the local calendar date, not a 24-hour subtraction through DST.
 return new Date(Date.parse(`${day}T12:00:00Z`)-86400000).toISOString().slice(0,10);
}
