"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  User,
  FolderClosed,
  FileText,
  HardDrive,
  LogOut,
  Loader2,
  ShieldCheck,
  Check,
  Pencil,
  Download,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Profile {
  name: string;
  email: string;
  storageUsed: number;
  storageLimit: number;
  isAdmin: boolean;
  emailVerified: boolean;
  folderCount: number;
  documentCount: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function SettingsScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/user");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setProfile(data?.user ?? null);
        setName(data?.user?.name ?? "");
      }
    } catch (err) {
      toast.error("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not update name.");
        setSaving(false);
        return;
      }
      setProfile((p) => (p ? { ...p, name: trimmed } : p));
      setEditing(false);
      toast.success("Name updated.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace("/login");
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/user/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not export your data.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lockondocs-export-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export has been downloaded.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      toast.error("Please enter your password to confirm.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not delete your account.");
        setDeleting(false);
        return;
      }
      toast.success("Your account and documents have been deleted.");
      await signOut({ redirect: false });
      // replace so a back press cannot return to the deleted account's screens.
      window.location.replace("/login");
    } catch (err) {
      toast.error("Something went wrong.");
      setDeleting(false);
    }
  }

  return (
    <div className="px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and review your storage.
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Profile card */}
          <div className="rounded-[var(--radius-lg)] bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="gold-surface flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground">
                <User className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-1 font-display text-lg font-semibold">
                  {profile?.name || "Your account"}
                </p>
                <p
                  className="line-clamp-1 text-sm text-muted-foreground"
                  suppressHydrationWarning
                >
                  {profile?.email}
                </p>
              </div>
            </div>

            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={saving}
                />
                <Button size="icon" onClick={handleSaveName} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setEditing(true)}
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit name
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[var(--radius)] bg-card p-3 text-center shadow-sm">
              <FolderClosed className="mx-auto mb-1 h-5 w-5 text-primary" />
              <p className="font-mono text-lg font-semibold">{profile?.folderCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Vaults</p>
            </div>
            <div className="rounded-[var(--radius)] bg-card p-3 text-center shadow-sm">
              <FileText className="mx-auto mb-1 h-5 w-5 text-primary" />
              <p className="font-mono text-lg font-semibold">{profile?.documentCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
            <div className="rounded-[var(--radius)] bg-card p-3 text-center shadow-sm">
              <HardDrive className="mx-auto mb-1 h-5 w-5 text-primary" />
              <p className="font-mono text-lg font-semibold">
                {formatBytes(profile?.storageUsed ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                of {formatBytes(profile?.storageLimit ?? 0)}
              </p>
            </div>
          </div>

          {/* Admin panel entry */}
          {profile?.isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-card p-4 text-left shadow-sm transition hover:bg-accent/40"
            >
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-medium">Admin panel</p>
                <p className="text-xs text-muted-foreground">Manage users and review activity.</p>
              </div>
            </button>
          )}

          {/* Security note */}
          <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-accent/60 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-accent-foreground">
              Your documents are private and stored securely. Only you can view them.
            </p>
          </div>

          {/* Privacy: data controls */}
          <div className="space-y-2">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your data
            </p>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-start"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Download className="mr-2 h-5 w-5" />
              )}
              Download my data
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-start text-destructive"
              onClick={() => {
                setDeletePassword("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="mr-2 h-5 w-5" /> Delete my account
            </Button>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-5 w-5" /> Sign out
          </Button>

          <p className="pt-2 text-center text-xs text-muted-foreground">
            LockonDocs &middot; Version 1.0.0
          </p>
        </div>
      )}

      {/* Delete account confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" /> Delete your account
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account and every document you have stored.
              This cannot be undone. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
              disabled={deleting}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
