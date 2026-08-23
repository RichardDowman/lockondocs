"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  HardDrive,
  Unlock,
  UserX,
  UserCheck,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatBytes, formatDate, formatAction } from "@/components/admin/format";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  emailVerified: boolean;
  storageUsed: number;
  storageLimit: number;
  locked: boolean;
  suspended: boolean;
  deleted: boolean;
  failedLoginAttempts: number;
  documentCount: number;
  folderCount: number;
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
}

export function UserDrawer({
  userId,
  open,
  onOpenChange,
  onChanged,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [limitMb, setLimitMb] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not load user.");
        return;
      }
      setDetail(data.user);
      setActivity(data.recentActivity ?? []);
      setLimitMb(String(Math.round((data.user.storageLimit ?? 0) / (1024 * 1024))));
    } catch {
      toast.error("Could not load user.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) load();
  }, [open, userId, load]);

  async function patch(body: Record<string, unknown>, label: string, successMsg: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Update failed.");
        return;
      }
      toast.success(successMsg);
      await load();
      onChanged();
    } catch {
      toast.error("Update failed.");
    } finally {
      setBusy(null);
    }
  }

  const usedPct =
    detail && detail.storageLimit > 0
      ? Math.min(100, Math.round((detail.storageUsed / detail.storageLimit) * 100))
      : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !detail ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="break-words">{detail.name || detail.email}</SheetTitle>
              <SheetDescription className="break-words">{detail.email}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              {detail.isSuperAdmin && <Badge>Super admin</Badge>}
              {detail.isAdmin && !detail.isSuperAdmin && <Badge>Admin</Badge>}
              {detail.emailVerified ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
              {detail.locked && <Badge variant="destructive">Locked</Badge>}
              {detail.suspended && <Badge variant="destructive">Suspended</Badge>}
              {detail.deleted && <Badge variant="destructive">Deleted</Badge>}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius)] border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">Documents</div>
                <div className="font-display text-lg font-bold text-foreground">
                  {detail.documentCount}
                </div>
              </div>
              <div className="rounded-[var(--radius)] border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">Vaults</div>
                <div className="font-display text-lg font-bold text-foreground">
                  {detail.folderCount}
                </div>
              </div>
              <div className="col-span-2 rounded-[var(--radius)] border border-border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Storage</span>
                  <span>
                    {formatBytes(detail.storageUsed)} of {formatBytes(detail.storageLimit)} ({usedPct}%)
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
              <div className="col-span-2 rounded-[var(--radius)] border border-border bg-card p-3 text-xs text-muted-foreground">
                <div>Joined: {formatDate(detail.createdAt)}</div>
                <div>Failed login attempts: {detail.failedLoginAttempts}</div>
              </div>
            </div>

            {detail.deleted ? (
              <p className="rounded-[var(--radius)] bg-muted p-3 text-sm text-muted-foreground">
                This account has been deleted. Management actions are unavailable.
              </p>
            ) : (
              <div className="space-y-5">
                {/* Storage limit */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <HardDrive className="h-4 w-4" /> Storage limit (MB)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={limitMb}
                      onChange={(e) => setLimitMb(e.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={busy === "limit"}
                      onClick={() =>
                        patch({ storageLimitMb: Number(limitMb) }, "limit", "Storage limit updated.")
                      }
                    >
                      {busy === "limit" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {detail.locked && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === "unlock"}
                      onClick={() => patch({ unlock: true }, "unlock", "Account unlocked.")}
                    >
                      <Unlock className="mr-2 h-4 w-4" /> Unlock account
                    </Button>
                  )}

                  {detail.suspended ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === "unsuspend"}
                      onClick={() => patch({ suspend: false }, "unsuspend", "Account reinstated.")}
                    >
                      <UserCheck className="mr-2 h-4 w-4" /> Reinstate account
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === "suspend" || detail.isSuperAdmin}
                      onClick={() => patch({ suspend: true }, "suspend", "Account suspended.")}
                    >
                      <UserX className="mr-2 h-4 w-4" /> Suspend account
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === "reset"}
                    onClick={() => patch({ sendReset: true }, "reset", "Password reset link sent.")}
                  >
                    <Mail className="mr-2 h-4 w-4" /> Send reset link
                  </Button>
                </div>

                {detail.isSuperAdmin && (
                  <p className="flex items-start gap-2 rounded-[var(--radius)] bg-muted p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Super admin accounts cannot be suspended. Role changes are managed under Admin Management.
                  </p>
                )}
              </div>
            )}

            {/* Recent activity */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Recent activity</h3>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="space-y-2">
                  {activity.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-[var(--radius)] border border-border bg-card p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{formatAction(a.action)}</span>
                        <span className="shrink-0 text-muted-foreground">{formatDate(a.createdAt)}</span>
                      </div>
                      {a.detail && <div className="mt-0.5 break-words text-muted-foreground">{a.detail}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
