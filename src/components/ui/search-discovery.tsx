"use client";
import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import { useRouter } from "next/navigation";
import {
  beginSearchDiscovery,
  searchDiscoveryStatus,
} from "@/app/actions/search-discovery";
// A request has immutable search intent; navigation changes only the displayed results.
const requests = new Map<string, ReturnType<typeof beginSearchDiscovery>>();
export function SearchDiscovery({ query, requestId }: { query: string; requestId:string }) {
  const router = useRouter();
  const [message, setMessage] = useState(
    "Checking approved funder websites for additional grants…",
  );
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const params: Record<string, string[]> = {};
    new URLSearchParams(query).forEach((v, k) => {
      (params[k] ??= []).push(v);
    });
    const normalized: Record<string, string | string[]> = {};
    Object.entries(params).forEach(([k, v]) => {
      normalized[k] = v.length === 1 ? v[0] : v;
    });
    async function poll(id: string) {
      try {
        const result = await searchDiscoveryStatus(id);
        if (cancelled) return;
        if (!result) {
          setMessage("Discovery status is unavailable.");
          return;
        }
        const finished = !["queued", "running"].includes(result.status);
        setMessage(
          (finished ? "Source search finished" : result.status === "queued" ? "Research queued for the background worker" : "Research in progress; waiting for the worker to continue") +
            " · " +
            result.pages +
            " pages checked · " +
            result.published +
            " shared catalog additions · " +
            result.updated +
            " updates" +
            (result.failures
              ? " · " + result.failures + " unavailable pages"
              : "") +
            ". " + (result.coverage_gap ? "Limited local coverage; checking applicable broader sources. " : "") +
            (finished
              ? "Coverage is bounded; not every grant can be found."
              : "Additional grants publish automatically."),
        );
        setDone(finished || result.published > 0 || result.updated > 0);
        if (!finished && ++attempts < 40)
          timer = setTimeout(() => poll(id), 10000);
        else if (!finished)
          setMessage(
            "Discovery is still queued or running. You can return later; the background worker retains progress.",
          );
      } catch {
        if (!cancelled)
          setMessage(
            "Discovery is paused. Existing catalog results remain available.",
          );
      }
    }
    setDone(false);
    if(!requests.has(requestId)){
      if(requests.size>100)requests.delete(requests.keys().next().value!);
      requests.set(requestId,beginSearchDiscovery(normalized));
    }
    requests.get(requestId)!
      .then((r) => {
        if (cancelled) return;
        if (r.id) poll(r.id);
        else setMessage(r.error ?? "Discovery is unavailable.");
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            "Discovery is unavailable. Existing results remain available.",
          );
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [requestId]);
  return (
    <Alert
      severity="info"
      sx={{ mb: 2 }}
      action={
        done ? (
          <Button color="inherit" onClick={() => router.refresh()}>
            Refresh results
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
