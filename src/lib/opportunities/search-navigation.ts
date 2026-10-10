/** Only a deliberate form submission creates a new research request. */
export function searchSubmission(form: URLSearchParams, previous: {
  location: string; city: string; state: string; postal_code: string;
}, requestId: string) {
  const next = new URLSearchParams(form);
  if (!form.has('location') && ['city','state','postal_code'].every(k =>
    (form.get(k) ?? '') === previous[k as 'city'|'state'|'postal_code'])) {
    if (previous.location) next.set('location', previous.location);
  }
  next.set('researchRequest', requestId);
  for (const key of ['page','programPage','leadPage','preview']) next.delete(key);
  return next;
}

export function researchRequest(params: URLSearchParams) {
  const id = params.get('researchRequest') ?? '';
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ? id : null;
}
