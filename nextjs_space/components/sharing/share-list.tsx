"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDate } from "@/components/admin/format";

type Event = { id: string; action: string; createdAt: string };
type Share = { id: string; label: string; documentId: string; document: { name: string }; allowDownload: boolean; expiresAt: string; createdAt: string; status: string; viewCount: number; downloadCount: number };
export function ShareList({ documentId, refreshKey = 0 }: { documentId?: string; refreshKey?: number }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, Event[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const load = useCallback(async (next?: string) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams();
      if (documentId) query.set("documentId", documentId);
      if (next) query.set("cursor", next);
      const res = await fetch(`/api/shares?${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load shares.");
      setShares((old) => next ? [...old, ...data.shares] : data.shares);
      setCursor(data.nextCursor);
    } catch (err) { console.error("Share list failed", err); setError(err instanceof Error ? err.message : "Could not load shares."); }
    finally { setLoading(false); }
  }, [documentId]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  async function revoke(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShares((old) => old.map((s) => s.id === id ? { ...s, status: "Revoked" } : s));
      setConfirm(null); toast.success("Share revoked. Future access is blocked.");
    } catch (err) { console.error("Share revocation failed", err); toast.error(err instanceof Error ? err.message : "Could not revoke share."); }
    finally { setBusy(null); }
  }
  async function history(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setBusy(id);
    try {
      const res = await fetch(`/api/shares/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvents((old) => ({ ...old, [id]: data.events })); setExpanded(id);
    } catch (err) { console.error("Share history failed", err); toast.error(err instanceof Error ? err.message : "Could not load history."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-base font-semibold">{documentId ? "Shares for this document" : "Your document shares"}</h2><Button size="icon" variant="ghost" disabled={loading} onClick={() => load()} aria-label="Refresh shares"><RefreshCw className="h-4 w-4" /></Button></div>
    <p className="text-xs text-muted-foreground">Times are UTC. Access history records use of the link, not a verified recipient identity. Links and passcodes cannot be retrieved after creation.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loading && !error && shares.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No shares yet.</p>}
    {shares.map((s) => <article key={s.id} className="space-y-2 rounded-[var(--radius-lg)] bg-card p-4 shadow-sm ring-1 ring-border/50">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{s.label || "Document share"}</p>{!documentId && <Link href={`/document/${s.documentId}`} className="break-words text-sm text-primary underline">{s.document.name}</Link>}</div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-foreground">{s.status}</span></div>
      <p className="text-xs text-muted-foreground">Created {formatDate(s.createdAt)}<br />Expires {formatDate(s.expiresAt)}<br />{s.allowDownload ? "Downloads enabled" : "Viewing only"} · {s.viewCount} file opens · {s.downloadCount} downloads</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => history(s.id)}>{expanded === s.id ? "Hide history" : "Access history"}</Button>{s.status === "Active" && <Button size="sm" variant="outline" className="text-destructive" disabled={busy === s.id} onClick={() => setConfirm(s.id)}>Revoke</Button>}</div>
      {confirm === s.id && <div className="space-y-2 rounded-lg bg-muted p-3"><p className="text-sm">Block future access? Copies already saved cannot be recalled.</p><div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy === s.id} onClick={() => revoke(s.id)}>Revoke share</Button><Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
      {expanded === s.id && <div className="max-h-48 overflow-y-auto text-xs"><p className="mb-2 text-muted-foreground">Most recent 100 file opens and downloads. Repeated browser requests may count as additional opens.</p>{events[s.id]?.length ? events[s.id].map((e) => <p key={e.id} className="py-1">{e.action === "download" ? "Downloaded" : "Opened"} · {formatDate(e.createdAt)}</p>) : <p>No file access recorded.</p>}</div>}
    </article>)}
    {loading && <div role="status" className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /><span className="sr-only">Loading shares</span></div>}
    {cursor && <Button className="w-full" variant="outline" disabled={loading} onClick={() => load(cursor)}>Load more</Button>}
  </section>;
}
