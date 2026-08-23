"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  FolderClosed,
  FileText,
  HardDrive,
  Loader2,
  Activity as ActivityIcon,
  Clock,
} from "lucide-react";
import { formatBytes, formatAction, formatDate } from "@/components/admin/format";
import { toast } from "sonner";

interface Profile {
  name: string;
  email: string;
  storageUsed: number;
  storageLimit: number;
  folderCount: number;
  documentCount: number;
}

interface ActivityItem {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
}

export function ActivityScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([
        fetch("/api/user"),
        fetch("/api/user/activity"),
      ]);
      const pData = await pRes.json().catch(() => ({}));
      const aData = await aRes.json().catch(() => ({}));
      setProfile(pData?.user ?? null);
      setActivity(aData?.activity ?? []);
    } catch (err) {
      toast.error("Could not load your activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const storageUsed = profile?.storageUsed ?? 0;
  const storageLimit = profile?.storageLimit ?? 0;
  const storagePct =
    storageLimit > 0 ? Math.min(100, Math.round((storageUsed / storageLimit) * 100)) : 0;

  return (
    <div className="px-5 pt-8">
      <div className="mb-6 flex flex-col items-center pt-1">
        <div className="relative h-16 w-16">
          <Image
            src="/logo.png"
            alt="LockonDocs logo"
            fill
            sizes="64px"
            className="object-contain"
          />
        </div>
        <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-foreground">
          Your activity
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          A quick look at your vaults and recent actions.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mb-4 grid grid-cols-3 gap-3">
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
              <p className="font-mono text-lg font-semibold">{formatBytes(storageUsed)}</p>
              <p className="text-xs text-muted-foreground">of {formatBytes(storageLimit)}</p>
            </div>
          </div>

          {/* Storage usage bar */}
          <div className="mb-7 rounded-[var(--radius-lg)] bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Storage used</span>
              <span className="font-mono text-muted-foreground">{storagePct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="gold-surface h-full rounded-full"
                style={{ width: `${storagePct}%` }}
              />
            </div>
          </div>

          {/* Recent activity */}
          <div className="mb-3 flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold tracking-tight">Recent activity</h2>
          </div>

          {activity.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] bg-card p-8 text-center shadow-sm">
              <Clock className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No activity yet. Scan or upload a document to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-card p-3 shadow-sm"
                >
                  <span className="gold-tile mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-foreground">
                    <ActivityIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatAction(item.action)}
                    </p>
                    {item.detail && (
                      <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
