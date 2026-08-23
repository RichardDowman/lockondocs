"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShieldCheck, ShieldPlus, UserMinus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function AdminManagementSection() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [assignRole, setAssignRole] = useState<Record<string, string>>({});

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?status=admins&sort=name_asc&pageSize=100`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not load admins.");
        return;
      }
      setAdmins(data.users ?? []);
    } catch {
      toast.error("Could not load admins.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  // Debounce dialog search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useCallback(async () => {
    if (!dialogOpen) return;
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      params.set("sort", "name_asc");
      params.set("pageSize", "25");
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Search failed.");
        return;
      }
      setResults(data.users ?? []);
    } catch {
      toast.error("Search failed.");
    } finally {
      setSearching(false);
    }
  }, [dialogOpen, debouncedQ]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  async function changeRole(user: AdminUser, role: string, refreshDialog: boolean) {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not change role.");
        return;
      }
      toast.success("Role updated.");
      await loadAdmins();
      if (refreshDialog) await runSearch();
    } catch {
      toast.error("Could not change role.");
    } finally {
      setBusyId(null);
    }
  }

  function currentRole(u: AdminUser): string {
    return u.isSuperAdmin ? "superadmin" : u.isAdmin ? "admin" : "user";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Admin Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promote trusted users to Admin or Super Admin, or step them back down. Super admin only.
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create admin
        </Button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No admins yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {admins.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{u.name || u.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
                {u.isSuperAdmin ? (
                  <Badge>Super admin</Badge>
                ) : (
                  <Badge variant="secondary">Admin</Badge>
                )}
                <div className="flex gap-2">
                  {u.isSuperAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => changeRole(u, "admin", false)}
                    >
                      {busyId === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Downgrade to Admin</>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => changeRole(u, "superadmin", false)}
                    >
                      {busyId === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ShieldPlus className="mr-1.5 h-4 w-4" /> Make super
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === u.id}
                    onClick={() => changeRole(u, "user", false)}
                  >
                    <UserMinus className="mr-1.5 h-4 w-4" /> Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create admin dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create admin</DialogTitle>
            <DialogDescription>
              Search for a user, choose a role and assign it. Roles take effect immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto">
            {searching ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              results.map((u) => {
                const role = assignRole[u.id] ?? "admin";
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {u.name || u.email}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {currentRole(u) === "superadmin" ? "Super admin" : currentRole(u)}
                    </Badge>
                    <Select
                      value={role}
                      onValueChange={(v) => setAssignRole((m) => ({ ...m, [u.id]: v }))}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="superadmin">Super admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === u.id || currentRole(u) === role}
                      onClick={() => changeRole(u, role, true)}
                    >
                      {busyId === u.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Assign"
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
