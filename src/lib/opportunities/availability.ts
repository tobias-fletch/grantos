/** Labels describe the application round, not the lifetime of the program. */
export function availabilityLabel(status:string,rolling=false){
 if(status==='open'&&rolling)return 'Rolling applications';
 return ({open:'Open now',upcoming:'Upcoming application round',between_rounds:'Between rounds — next dates unannounced',round_ended:'Previous round ended — future availability unknown',closed:'Not accepting applications',unannounced:'Next dates unannounced',unknown:'Status unknown',discontinued:'Discontinued'} as Record<string,string>)[status]??'Status unknown';
}
