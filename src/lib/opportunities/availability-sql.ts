// Shared public/admin round status. Aliases o (program) and m (monitor) are required.
export const catalogAvailabilitySql = `CASE WHEN m.state='discontinued' THEN 'discontinued'
    WHEN o.opens_at > now() THEN 'upcoming'
    WHEN (o.deadline_at::date < (now() AT TIME ZONE 'UTC')::date OR o.application_status='closed') AND o.recurrence IN ('annual','recurring') THEN 'between_rounds'
    WHEN o.deadline_at::date < (now() AT TIME ZONE 'UTC')::date THEN 'round_ended'
    WHEN o.application_status='upcoming' AND o.opens_at <= now() THEN 'unknown'
    ELSE o.application_status END`;
