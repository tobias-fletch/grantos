import type { SearchParams } from '../opportunities/store';
export type ProjectSearchProfile = {id?:string;applicant_type:string;country:string;state:string;city:string;postal_code:string;categories:string[]};

/** Only coarse applicant facts go into search URLs; purpose and service area stay private. */
export function projectSearch(p: ProjectSearchProfile) {
  const q = new URLSearchParams({applicant:p.applicant_type,country:p.country??'',state:p.state??'',city:p.city??'',postal_code:p.postal_code??'',sort:'recommended',resultType:'programs',geoEligibility:'all',projectFilters:'custom'});
  if(p.id) q.set('project',p.id);
  for(const c of p.categories) q.append('category',c);
  return '/app/opportunities?'+q;
}

/** Expand an initial project-only link once. Later filter changes must not be silently reset. */
export function projectSearchDestination(project: ProjectSearchProfile, params: SearchParams) {
  const q = new URLSearchParams(projectSearch(project).split('?')[1]);
  for (const [key,value] of Object.entries(params)) {
    if (key === 'projectFilters' || value === undefined) continue;
    q.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) q.append(key,item);
  }
  return '/app/opportunities?'+q;
}
