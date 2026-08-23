"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Github,
  HardDriveDownload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  GitCommitHorizontal,
  FileText,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate } from "@/components/admin/format";

interface BackupEntry {
  id: string;
  type: string;
  status: string;
  message: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
}

interface BackupData {
  github: { latest: BackupEntry | null; history: BackupEntry[] };
  storage: { latest: BackupEntry | null; history: BackupEntry[] };
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "success";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold " +
        (ok
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-red-500/10 text-red-600")
      }
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}
      {ok ? "Success" : "Failed"}
    </span>
  );
}

function MetaChip({
  icon: Icon,
  label,
}: {
  icon: typeof FileText;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function StatusCard({
  title,
  subtitle,
  icon: Icon,
  latest,
  history,
  cadence,
  renderMeta,
}: {
  title: string;
  subtitle: string;
  icon: typeof Github;
  latest: BackupEntry | null;
  history: BackupEntry[];
  cadence: string;
  renderMeta: (e: BackupEntry) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[var(--radius-lg)] border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="gold-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {latest ? (
        <div className="rounded-[var(--radius)] border border-border bg-background/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <StatusPill status={latest.status} />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(latest.createdAt)}
            </span>
          </div>
          {latest.message ? (
            <p className="mt-3 text-sm text-foreground">{latest.message}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">{renderMeta(latest)}</div>
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-background/40 p-4">
          <p className="text-sm text-muted-foreground">
            No run recorded yet. This job runs {cadence}; the first result will
            appear here once it has run.
          </p>
        </div>
      )}

      {history.length > 1 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent runs
          </p>
          <ul className="space-y-1.5">
            {history.slice(1).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  {e.status === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                  )}
                  <span className="truncate">{e.message ?? (e.status === "success" ? "Completed" : "Failed")}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">Schedule: {cadence}.</p>
    </div>
  );
}

export function BackupsSection() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backups");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Non-blocking: leave data null so the empty state renders.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const githubMeta = (e: BackupEntry) => {
    const m = e.meta ?? {};
    const chips: React.ReactNode[] = [];
    if (m.commit) {
      chips.push(
        <MetaChip
          key="commit"
          icon={GitCommitHorizontal}
          label={`Commit ${String(m.commit).slice(0, 7)}`}
        />,
      );
    }
    if (m.branch) {
      chips.push(<MetaChip key="branch" icon={Github} label={String(m.branch)} />);
    }
    if (typeof m.files === "number") {
      chips.push(
        <MetaChip key="files" icon={FileText} label={`${m.files} files`} />,
      );
    }
    return chips.length ? chips : null;
  };

  const storageMeta = (e: BackupEntry) => {
    const m = e.meta ?? {};
    const chips: React.ReactNode[] = [];
    if (typeof m.documents === "number") {
      chips.push(
        <MetaChip
          key="docs"
          icon={FileText}
          label={`${m.documents} documents`}
        />,
      );
    }
    if (typeof m.totalBytes === "number") {
      chips.push(
        <MetaChip
          key="bytes"
          icon={HardDriveDownload}
          label={formatBytes(m.totalBytes)}
        />,
      );
    }
    if (typeof m.users === "number") {
      chips.push(
        <MetaChip key="users" icon={UsersIcon} label={`${m.users} users`} />,
      );
    }
    return chips.length ? chips : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Backups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live status of the automated code backup and daily storage
            verification.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-[var(--radius-lg)] border border-border bg-card p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatusCard
            title="Code backup to GitHub"
            subtitle="Weekly push of the application source code."
            icon={Github}
            latest={data?.github.latest ?? null}
            history={data?.github.history ?? []}
            cadence="every week"
            renderMeta={githubMeta}
          />
          <StatusCard
            title="Storage verification"
            subtitle="Daily check confirming every stored document is present in durable cloud storage."
            icon={HardDriveDownload}
            latest={data?.storage.latest ?? null}
            history={data?.storage.history ?? []}
            cadence="every day"
            renderMeta={storageMeta}
          />
        </div>
      )}
    </div>
  );
}
