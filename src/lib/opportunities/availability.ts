/** Labels describe the application round, not the lifetime of the program. */
export function availabilityLabel(status:string,rolling=false){
 if(status==='open'&&rolling)return 'Open—rolling';
 return ({open:'Open',upcoming:'Upcoming',between_rounds:'Between rounds',round_ended:'Closed round',closed:'Closed round',unannounced:'Unknown',unknown:'Unknown',discontinued:'Discontinued'} as Record<string,string>)[status]??'Status unknown';
}
