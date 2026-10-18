"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LockKeyhole, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/components/admin/format";

type Access = { id: string; mimeType: string; allowDownload: boolean; expiresAt: string; sessionExpiresAt: string };
export function RecipientScreen() {
  const token = useRef("");
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [fileError, setFileError] = useState(false);
  useEffect(() => {
    const read = () => { token.current = window.location.hash.slice(1); setValidLink(/^[A-Za-z0-9_-]{43}$/.test(token.current)); setReady(true); setAccess(null); setError(""); };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    const invalidate = (message: string) => { if (!cancelled) { setAccess(null); setError(message); } };
    const check = async () => {
      try {
        const res = await fetch(`/api/shared/status?id=${access.id}`, { cache: "no-store" });
        if (!res.ok) { const data = await res.json(); invalidate(data.error || "This share is no longer available."); }
      } catch (err) { console.error("Shared access check failed", err); invalidate("An internet connection is required. Reconnect and enter the sharing password again."); }
    };
    const interval = window.setInterval(check, 15000);
    const timeout = window.setTimeout(() => invalidate("Your viewing session ended. Enter the sharing password again."), Math.max(0, Math.min(new Date(access.expiresAt).getTime(), new Date(access.sessionExpiresAt).getTime()) - Date.now()));
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onOffline = () => invalidate("An internet connection is required to view this share.");
    document.addEventListener("visibilitychange", onVisible); window.addEventListener("offline", onOffline); window.addEventListener("pageshow", check);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("offline", onOffline); window.removeEventListener("pageshow", check); };
  }, [access]);
  async function unlock(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setFileError(false);
    try {
      const res = await fetch("/api/shared/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current, passcode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open the document.");
      setAccess(data);
    } catch (err) { console.error("Shared document unlock failed", err); setError(err instanceof Error ? err.message : "Could not open the document."); }
    finally { setPasscode(""); setBusy(false); }
  }
  async function close() {
    if (!access) return;
    const id = access.id; setAccess(null);
    try { const res = await fetch(`/api/shared/status?id=${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Session close failed"); }
    catch (err) { console.error("Shared session close failed", err); setError("The document is hidden, but the browser session could not be closed. Close this browser window to finish."); }
  }
  const fileUrl = access ? `/api/shared/file?id=${access.id}` : "";
  return <main className="mx-auto min-h-[100dvh] max-w-3xl space-y-6 bg-background px-5 py-8 text-foreground">
    <header className="text-center"><div className="relative mx-auto aspect-square w-16 bg-muted/20"><Image src="/logo.png" alt="LockonDocs logo" fill sizes="64px" className="object-contain" /></div><p className="mt-2 font-display text-xl font-bold">LockonDocs</p><h1 className="mt-4 font-display text-2xl font-semibold">Secure document sharing</h1></header>
    {!ready ? <p role="status" className="text-center">Loading...</p> : !validLink ? <div className="rounded-xl bg-card p-6 text-center shadow-sm"><p>This link is incomplete.</p><p className="mt-2 text-sm text-muted-foreground">Ask the sender for the full share link, including everything after the # symbol.</p></div> : !access ? <form onSubmit={unlock} className="mx-auto max-w-sm space-y-4 rounded-xl bg-card p-6 shadow-sm">
      <LockKeyhole className="mx-auto h-8 w-8 text-primary" /><p className="text-center text-sm text-muted-foreground">No account needed. Enter the sharing password the sender gave you separately.</p>
      <div className="space-y-2"><Label htmlFor="recipient-passcode">Sharing password</Label><Input id="recipient-passcode" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={passcode} onChange={(e) => setPasscode(e.target.value)} maxLength={64} required disabled={busy} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={busy || !passcode}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open document</Button>
    </form> : <section className="space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">Shared document</h2><Button variant="outline" onClick={close}>Close document</Button></div>
      <p className="text-sm text-muted-foreground">Expires {formatDate(access.expiresAt)} UTC. An internet connection is required.</p>
      {access.mimeType === "application/pdf" ? <><iframe src={`${fileUrl}#toolbar=0`} title="Shared PDF document" className="h-[70dvh] w-full rounded-xl border-0 bg-muted" /><p className="text-xs text-muted-foreground">If the PDF does not appear in your in-app browser, open the share link in your phone's browser.</p></> : <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted"><Image src={fileUrl} alt="Document shared with you" fill unoptimized sizes="(max-width: 768px) 100vw, 720px" className="object-contain" onError={() => setFileError(true)} /></div>}
      {fileError && <p role="alert" className="text-sm text-destructive">The file could not be displayed. Close the document and try again, or contact the sender.</p>}
      {access.allowDownload ? <Button className="w-full" onClick={() => { const a = document.createElement("a"); a.href = `${fileUrl}&download=1`; a.download = "shared-document"; document.body.appendChild(a); a.click(); a.remove(); }}>Download document</Button> : <p className="text-sm text-muted-foreground">The sender has not enabled a download button. Please respect their sharing preferences.</p>}
    </section>}
    <p className="text-center text-xs text-muted-foreground">Private document. Do not forward the link or sharing password without the sender's permission.</p>
  </main>;
}
