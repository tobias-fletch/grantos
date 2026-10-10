export function words(s:string){return s.trim()?s.trim().split(/\s+/u).length:0;}
export function budgetTotals(rows:{cost:number;requested:number}[]){const cost=rows.reduce((n,r)=>n+Math.round(r.cost*100),0),requested=rows.reduce((n,r)=>n+Math.round(r.requested*100),0);return {cost:cost/100,requested:requested/100,other:(cost-requested)/100};}
