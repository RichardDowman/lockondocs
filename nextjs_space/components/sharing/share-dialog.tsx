"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ShareList } from "./share-list";
import { formatDate } from "@/components/admin/format";
import { SHARE_PASSWORD_HINT, sharePasswordError } from "@/lib/share-password";

function generatePasscode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (v) => alphabet[v % alphabet.length]).join("").match(/.{4}/g)!.join("-");
}
export function ShareDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(24);
  const [allowDownload, setAllowDownload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  useEffect(() => { setPasscode(generatePasscode()); }, []);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success("Copied."); }
    catch (err) { console.error("Clipboard unavailable", err); toast.error("Copy was unavailable. Select and copy the text instead."); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const validationError = sharePasswordError(passcode);
    if (validationError) { setError(validationError); return; }
    if (passcode === password) { setError("Choose a sharing password that is different from your account password."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, passcode, password, label, hours, allowDownload }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create share.");
      setCreated({ url: `${window.location.origin}/share?v=48#${data.token}`, expiresAt: data.expiresAt });
    } catch (err) { console.error("Share creation failed", err); setError(err instanceof Error ? err.message : "Could not create share."); }
    finally { setPassword(""); setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[var(--radius-lg)]">
    <DialogHeader><DialogTitle className="flex items-center gap-2 font-display"><ShieldCheck className="h-5 w-5 text-primary" />Secure document sharing</DialogTitle><DialogDescription>Share only this file. Your vaults and saved details stay private. Information visible inside the file is still shared.</DialogDescription></DialogHeader>
    {created ? <div className="space-y-4 rounded-lg bg-muted p-4">
      <p className="font-semibold">Share created</p><p className="text-sm">Copy both items before closing. They are shown only now.</p>
      <div className="space-y-2"><Label htmlFor="created-share-link">Share link</Label><Input id="created-share-link" readOnly value={created.url} onFocus={(e) => e.target.select()} /><Button variant="outline" className="w-full" onClick={() => copy(created.url)}><Copy className="mr-2 h-4 w-4" />Copy link</Button></div>
      <div className="space-y-2"><Label htmlFor="created-passcode">Sharing password</Label><Input id="created-passcode" className="font-mono" readOnly value={passcode} onFocus={(e) => e.target.select()} /><Button variant="outline" className="w-full" onClick={() => copy(passcode)}>Copy password</Button></div>
      <p className="text-sm font-medium">Send the sharing password separately, such as by phone or a different messaging channel. Do not send it with the link.</p><p className="text-xs text-muted-foreground">Expires {formatDate(created.expiresAt)} UTC. Anyone with both items can open the document.</p>
      <Button className="w-full" onClick={onClose}>Done</Button>
    </div> : <form onSubmit={create} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="share-label">Private label (optional)</Label><Input id="share-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="For example: School office" disabled={busy} /></div>
      <div className="space-y-1.5"><Label htmlFor="share-expiry">Link expires after</Label><select id="share-expiry" value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={busy} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option></select></div>
      <div className="space-y-2"><Label htmlFor="share-passcode">Sharing password</Label><Input id="share-passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} required disabled={busy} aria-describedby="share-password-hint" className="font-mono" /><p id="share-password-hint" className="text-xs text-muted-foreground">Choose your own password or keep the generated one. {SHARE_PASSWORD_HINT}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPasscode(generatePasscode())}>Generate a password</Button></div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor="share-download">Allow downloads</Label><Switch id="share-download" checked={allowDownload} onCheckedChange={setAllowDownload} disabled={busy} /></div>
      <p className="text-xs text-muted-foreground">Viewing is not copy protection. Screenshots, browser tools, or PDF controls may save a copy. Revoking access cannot erase copies already made.</p>
      <div className="space-y-1.5"><Label htmlFor="share-password">Confirm your account password</Label><Input id="share-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={256} disabled={busy} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" type="submit" disabled={busy || !passcode || !password}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create secure share</Button>
    </form>}
    <ShareList documentId={documentId} refreshKey={created ? 1 : 0} />
    <Link href="/shares" onClick={onClose} className="text-center text-sm font-medium text-primary underline">Manage all document shares</Link>
  </DialogContent></Dialog>;
}
