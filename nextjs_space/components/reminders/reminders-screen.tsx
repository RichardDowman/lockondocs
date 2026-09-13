"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  AlarmClock,
  CheckCircle2,
  X,
} from "lucide-react";
import { FolderIcon } from "@/components/app/folder-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { REMINDER_LEAD_CHOICES } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ReminderItem {
  id: string;
  name: string;
  folderId: string;
  folderName: string;
  folderIcon: string;
  expiryDate: string | null;
  status: "expired" | "soon" | "ok";
  daysRemaining: number;
  label: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function RemindersScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [leadDays, setLeadDays] = useState(30);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingLead, setSavingLead] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      const data = await res.json().catch(() => ({}));
      setItems(data?.items ?? []);
      if (typeof data?.leadDays === "number") setLeadDays(data.leadDays);
      if (typeof data?.emailRemindersEnabled === "boolean")
        setEmailEnabled(data.emailRemindersEnabled);
    } catch {
      toast.error("Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeLead(value: string) {
    const next = Number(value);
    setLeadDays(next);
    setSavingLead(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadDays: next }),
      });
      if (!res.ok) {
        toast.error("Could not save reminder window.");
      } else {
        await load();
      }
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setSavingLead(false);
    }
  }

  async function toggleEmail(next: boolean) {
    setEmailEnabled(next);
    setSavingEmail(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailRemindersEnabled: next }),
      });
      if (!res.ok) {
        setEmailEnabled(!next);
        toast.error("Could not update email reminders.");
      }
    } catch {
      setEmailEnabled(!next);
      toast.error("Something went wrong.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function dismiss(id: string) {
    // Optimistic removal.
    setItems((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissDocumentId: id }),
      });
      if (!res.ok) {
        toast.error("Could not dismiss reminder.");
        await load();
      }
    } catch {
      toast.error("Something went wrong.");
      await load();
    }
  }

  const expired = items.filter((d) => d.status === "expired");
  const soon = items.filter((d) => d.status === "soon");

  return (
    <div className="px-5 pt-8">
      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground active:scale-95 no-select"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="font-display text-2xl font-bold tracking-tight">Reminders</h1>
      </div>

      {/* Lead-time control */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Warn me before expiry</p>
          <p className="text-xs text-muted-foreground">
            How far ahead expiring documents appear here.
          </p>
        </div>
        <Select value={String(leadDays)} onValueChange={changeLead} disabled={savingLead}>
          <SelectTrigger className="w-[112px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMINDER_LEAD_CHOICES.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Email reminders toggle */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Email reminders</p>
          <p className="text-xs text-muted-foreground">
            Get one email when a document is 30 days from expiry, and one when it
            expires.
          </p>
        </div>
        <Switch
          checked={emailEnabled}
          onCheckedChange={toggleEmail}
          disabled={savingEmail}
          aria-label="Toggle email reminders"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] bg-card px-6 py-14 text-center shadow-sm">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <p className="font-medium text-foreground">Nothing needs attention</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents with an expiry or renewal date will appear here as the date
            approaches.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {expired.length > 0 && (
            <ReminderGroup
              title="Expired"
              tone="expired"
              items={expired}
              onOpen={(id) => router.push(`/document/${id}`)}
              onDismiss={dismiss}
              formatDate={formatDate}
            />
          )}
          {soon.length > 0 && (
            <ReminderGroup
              title="Expiring soon"
              tone="soon"
              items={soon}
              onOpen={(id) => router.push(`/document/${id}`)}
              onDismiss={dismiss}
              formatDate={formatDate}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReminderGroup({
  title,
  tone,
  items,
  onOpen,
  onDismiss,
  formatDate,
}: {
  title: string;
  tone: "expired" | "soon";
  items: ReminderItem[];
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  formatDate: (iso: string | null) => string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            tone === "expired"
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 rounded-[var(--radius)] bg-card p-3 shadow-sm"
          >
            <button
              type="button"
              onClick={() => onOpen(d.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99] no-select"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                  tone === "expired"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                <AlarmClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium text-foreground">
                  {d.name}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FolderIcon name={d.folderIcon} className="h-3 w-3" />
                  <span className="line-clamp-1">{d.folderName}</span>
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-xs font-medium",
                    tone === "expired"
                      ? "text-destructive"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {d.label}
                  {d.expiryDate ? ` \u00b7 ${formatDate(d.expiryDate)}` : ""}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onDismiss(d.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 no-select"
              aria-label={`Dismiss reminder for ${d.name}`}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
