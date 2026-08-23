"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users as UsersIcon,
  FileText,
  FolderClosed,
  HardDrive,
  ShieldAlert,
  Lock,
  UserX,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { DateFilter, DateFilterValue, dateFilterParams } from "@/components/admin/date-filter";
import { formatBytes } from "@/components/admin/format";
import type { UsersPrefill } from "@/components/admin/admin-console";
import { cn } from "@/lib/utils";

interface Stats {
  totals: {
    users: number;
    admins: number;
    superAdmins: number;
    documents: number;
    folders: number;
    storageUsedBytes: number;
    lockedUsers: number;
    suspendedUsers: number;
    deletedUsers: number;
  };
  inRange: {
    newUsers: number;
    newDocuments: number;
    newFolders: number;
    failedLogins: number;
  };
  topStorage: {
    id: string;
    name: string;
    email: string;
    storageUsed: number;
    storageLimit: number;
  }[];
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof UsersIcon;
  onClick?: () => void;
  accent?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-[var(--radius-lg)] border border-border bg-card p-4 text-left shadow-sm transition-all",
        clickable && "hover:shadow-md hover:border-primary/40 active:scale-[0.99] cursor-pointer",
        !clickable && "cursor-default"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            accent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <span className="mt-3 font-display text-2xl font-bold text-foreground">{value}</span>
      {sub && (
        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {sub}
          {clickable && <ChevronRight className="h-3 w-3" />}
        </span>
      )}
    </button>
  );
}

export function DashboardSection({
  onDrilldown,
}: {
  onDrilldown: (prefill: UsersPrefill) => void;
}) {
  const [range, setRange] = useState<DateFilterValue>({ key: "all" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(dateFilterParams(range));
      const res = await fetch(`/api/admin/stats?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not load dashboard.");
        return;
      }
      setStats(data);
    } catch {
      toast.error("Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeActive = range.key !== "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of accounts, documents and storage across LockonDocs.
        </p>
      </div>

      <DateFilter value={range} onChange={setRange} />

      {loading || !stats ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Users"
              value={String(stats.totals.users)}
              sub={
                rangeActive
                  ? `${stats.inRange.newUsers} new in range`
                  : `${stats.totals.admins} admin(s)`
              }
              icon={UsersIcon}
              onClick={() => onDrilldown({ range, sort: "created_desc" })}
            />
            <StatCard
              label="Documents"
              value={String(stats.totals.documents)}
              sub={rangeActive ? `${stats.inRange.newDocuments} new in range` : undefined}
              icon={FileText}
            />
            <StatCard
              label="Vaults"
              value={String(stats.totals.folders)}
              sub={rangeActive ? `${stats.inRange.newFolders} new in range` : undefined}
              icon={FolderClosed}
            />
            <StatCard
              label="Storage used"
              value={formatBytes(stats.totals.storageUsedBytes)}
              sub="View top users"
              icon={HardDrive}
              onClick={() => onDrilldown({ range, sort: "storage_desc" })}
            />
          </div>

          {/* Security widget */}
          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-foreground">
              Security
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Locked accounts"
                value={String(stats.totals.lockedUsers)}
                sub="View locked"
                icon={Lock}
                accent
                onClick={() => onDrilldown({ status: "locked", range })}
              />
              <StatCard
                label="Suspended accounts"
                value={String(stats.totals.suspendedUsers)}
                sub="View suspended"
                icon={UserX}
                accent
                onClick={() => onDrilldown({ status: "suspended", range })}
              />
              <StatCard
                label="Failed logins"
                value={String(stats.inRange.failedLogins)}
                sub={rangeActive ? "In selected range" : "All time"}
                icon={ShieldAlert}
                accent
              />
              <StatCard
                label="Deleted accounts"
                value={String(stats.totals.deletedUsers)}
                sub="View deleted"
                icon={UserX}
                onClick={() => onDrilldown({ status: "deleted", range })}
              />
            </div>
          </div>

          {/* Top storage */}
          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-foreground">
              Top users by storage
            </h2>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
              {stats.topStorage.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No users yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {stats.topStorage.map((u, i) => {
                    const pct =
                      u.storageLimit > 0
                        ? Math.min(100, Math.round((u.storageUsed / u.storageLimit) * 100))
                        : 0;
                    return (
                      <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {u.name || u.email}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-foreground">
                            {formatBytes(u.storageUsed)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {pct}% of {formatBytes(u.storageLimit)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
