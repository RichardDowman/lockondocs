"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download, ChevronLeft, ChevronRight, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { DateFilter, DateFilterValue, dateFilterParams } from "@/components/admin/date-filter";
import { formatBytes, formatDateShort } from "@/components/admin/format";
import { UserDrawer } from "@/components/admin/user-drawer";
import type { UsersPrefill } from "@/components/admin/admin-console";

interface AdminUser {
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
  documentCount: number;
  folderCount: number;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All accounts" },
  { value: "admins", label: "Admins" },
  { value: "locked", label: "Locked" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "storage_desc", label: "Storage high-low" },
  { value: "storage_asc", label: "Storage low-high" },
];

export function UsersSection({
  isSuperAdmin,
  prefill,
  onConsumePrefill,
}: {
  isSuperAdmin: boolean;
  prefill: UsersPrefill | null;
  onConsumePrefill: () => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [range, setRange] = useState<DateFilterValue>({ key: "all" });
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Multi-select for super-admin bulk delete.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A row can be selected only if it is not a super admin (this also protects
  // the signed-in super admin's own row, since bulk delete is super-admin only).
  const selectableIds = useMemo(
    () => users.filter((u) => !u.isSuperAdmin).map((u) => u.id),
    [users],
  );
  const selectedCount = selected.size;
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(() => (checked ? new Set(selectableIds) : new Set()));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not delete the selected users.");
        return;
      }
      const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
      toast.success(
        `Deleted ${data.deleted} user${data.deleted === 1 ? "" : "s"}` +
          (skippedCount > 0 ? `; ${skippedCount} skipped` : "") +
          `; ${data.filesRemoved} file${data.filesRemoved === 1 ? "" : "s"} removed.`,
      );
      setSelected(new Set());
      setConfirmOpen(false);
      load();
    } catch {
      toast.error("Could not delete the selected users.");
    } finally {
      setDeleting(false);
    }
  }

  // Apply a dashboard drilldown prefill once.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.status) setStatus(prefill.status);
    if (prefill.sort) setSort(prefill.sort);
    if (prefill.range) setRange(prefill.range);
    setPage(1);
    onConsumePrefill();
  }, [prefill, onConsumePrefill]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams(dateFilterParams(range));
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (status !== "all") params.set("status", status);
    params.set("sort", sort);
    params.set("page", String(page));
    return params;
  }, [range, debouncedQ, status, sort, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?${queryParams.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not load users.");
        return;
      }
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      toast.error("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, sort, range]);

  // Clear any selection whenever the visible list changes.
  useEffect(() => {
    setSelected(new Set());
  }, [users]);

  function exportCsv() {
    const params = new URLSearchParams(queryParams);
    params.set("format", "csv");
    params.delete("page");
    window.location.assign(`/api/admin/users?${params.toString()}`);
  }

  function openUser(id: string) {
    setDrawerId(id);
    setDrawerOpen(true);
  }

  function statusBadge(u: AdminUser) {
    if (u.deleted) return <Badge variant="destructive">Deleted</Badge>;
    if (u.suspended) return <Badge variant="destructive">Suspended</Badge>;
    if (u.locked) return <Badge variant="destructive">Locked</Badge>;
    return <Badge variant="secondary">Active</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} account{total === 1 ? "" : "s"} match your filters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && selectedCount > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete selected ({selectedCount})
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or email"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateFilter value={range} onChange={setRange} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No users match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isSuperAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelectableSelected}
                        onCheckedChange={(c) => toggleAll(!!c)}
                        disabled={selectableIds.length === 0}
                        aria-label="Select all users"
                      />
                    </TableHead>
                  )}
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Docs</TableHead>
                  <TableHead className="hidden lg:table-cell">Storage</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    {isSuperAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(u.id)}
                          onCheckedChange={(c) => toggleOne(u.id, !!c)}
                          disabled={u.isSuperAdmin}
                          aria-label={`Select ${u.email}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {u.name || "(no name)"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(u)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {u.isSuperAdmin ? (
                        <Badge>Super admin</Badge>
                      ) : u.isAdmin ? (
                        <Badge>Admin</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">User</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {u.documentCount}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatBytes(u.storageUsed)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {formatDateShort(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openUser(u.id)}
                      >
                        <Eye className="mr-1.5 h-4 w-4" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <UserDrawer
        userId={drawerId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={load}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} user{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected account{selectedCount === 1 ? "" : "s"} and
              every document and stored file belonging to {selectedCount === 1 ? "it" : "them"}.
              This cannot be undone. Super admin accounts are protected and will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteSelected();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                </>
              ) : (
                <>Delete {selectedCount} user{selectedCount === 1 ? "" : "s"}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
