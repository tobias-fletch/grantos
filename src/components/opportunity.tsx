import Link from "next/link";
import type { Opportunity } from "@/lib/opportunities/store";
import { saveOpportunityAction } from "@/app/actions/opportunities";

export function checkedDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-US",{ month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York" }).format(value) : "Not checked";
}
export function award(o: Opportunity) {
  const money = (value: string) => new Intl.NumberFormat("en-US",{style:"currency",currency:o.currency,maximumFractionDigits:0}).format(Number(value));
  if (o.minimum_award && o.maximum_award && Number(o.minimum_award) === Number(o.maximum_award)) return money(o.maximum_award);
  if (o.minimum_award && o.maximum_award) return `${money(o.minimum_award)}–${money(o.maximum_award)}`;
  return o.maximum_award ? `Up to ${money(o.maximum_award)}` : "Amount not published";
}
export function deadline(o: Opportunity) {
  if (o.deadline_at) return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short",timeZone:"America/New_York"}).format(o.deadline_at);
  return o.rolling ? "Rolling applications" : o.status === "unannounced" ? "Next deadline not announced" : "See official schedule";
}
export function SaveButton({ opportunity:o, returnTo, canEdit=true }: { opportunity: Opportunity; returnTo: string; canEdit?: boolean }) {
  if (!canEdit) return <span className="text-sm text-[var(--muted)]">View-only access</span>;
  return <form action={saveOpportunityAction}>
    <input type="hidden" name="id" value={o.id}/><input type="hidden" name="saved" value={String(!o.saved)}/><input type="hidden" name="returnTo" value={returnTo}/>
    <button aria-label={`${o.saved ? "Unsave" : "Save"} ${o.name}`} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${o.saved ? "border-[var(--brand)] bg-[#eef4ed] text-[var(--brand)]" : "border-black/15 bg-white"}`}>{o.saved ? "Saved · Remove" : "Save grant"}</button>
  </form>;
}
export function OpportunityCard({ opportunity:o,returnTo,canEdit }: { opportunity: Opportunity;returnTo:string;canEdit:boolean }) {
  return <article className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{o.funder}</p><h2 className="mt-2 text-xl font-semibold"><Link href={`/app/opportunities/${o.slug}`} className="hover:underline">{o.name}</Link></h2></div><span className="rounded-full bg-[#eef4ed] px-3 py-1 text-xs capitalize">{o.status === "unannounced" ? "Next cycle unannounced" : o.status}</span></div>
    <p className="mt-4 leading-7 text-[var(--muted)]">{o.summary}</p>
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm"><strong>{award(o)}</strong><span>{deadline(o)}</span><span>{o.locations.join(" · ")}</span></div>
    <div className="mt-4 flex flex-wrap gap-2">{o.categories.map(c=><span key={c} className="rounded-md bg-[#f5f6f2] px-2 py-1 text-xs">{c}</span>)}</div>
    <p className="mt-4 text-xs text-[var(--muted)]">{o.fresh && o.verification_status === "verified" ? "Source verified" : "Reverification needed"} · Checked {checkedDate(o.last_checked_at)}</p>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Link href={`/app/opportunities/${o.slug}`} className="text-sm font-semibold text-[var(--brand)] underline">View requirements</Link><SaveButton opportunity={o} returnTo={returnTo} canEdit={canEdit}/></div>
  </article>;
}
