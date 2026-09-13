"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { Plus, FileText, Loader2, FolderPlus, Search, ShieldCheck, Bell, AlarmClock, ChevronRight } from "lucide-react";
import { FolderIcon, FOLDER_ICON_CHOICES } from "@/components/app/folder-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FolderItem {
  id: string;
  name: string;
  icon: string;
  isDefault: boolean;
  documentCount: number;
}

interface RecentDoc {
  id: string;
  name: string;
  folderName: string;
  mimeType: string;
  url: string;
}

export function HomeScreen({ userName, isAdmin = false }: { userName: string; isAdmin?: boolean }) {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [recent, setRecent] = useState<RecentDoc[]>([]);
  const [reminderCount, setReminderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("folder");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fRes, dRes, rRes] = await Promise.all([
        fetch("/api/folders"),
        fetch("/api/documents"),
        fetch("/api/reminders"),
      ]);
      const fData = await fRes.json().catch(() => ({}));
      const dData = await dRes.json().catch(() => ({}));
      const rData = await rRes.json().catch(() => ({}));
      setFolders(fData?.folders ?? []);
      setRecent(dData?.documents ?? []);
      setReminderCount((rData?.items ?? []).length);
    } catch (err) {
      toast.error("Could not load your vaults.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      toast.error("Please enter a vault name.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon: newIcon }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create vault.");
        setCreating(false);
        return;
      }
      toast.success("Vault created.");
      setDialogOpen(false);
      setNewName("");
      setNewIcon("folder");
      await load();
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="px-5 pt-8">
      <div className="relative mb-6 flex flex-col items-center pt-1">
        <button
          type="button"
          onClick={() => router.push("/reminders")}
          className="absolute left-0 top-0 flex items-center rounded-[var(--radius-full)] border border-border bg-card p-2 text-foreground shadow-sm transition-shadow hover:shadow-md active:scale-[0.97] no-select"
          aria-label="Open expiry reminders"
        >
          <Bell className="h-4 w-4 text-primary" />
          {reminderCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-full)] bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {reminderCount > 9 ? "9+" : reminderCount}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="absolute right-0 top-0 flex items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-shadow hover:shadow-md active:scale-[0.97] no-select"
            aria-label="Open admin console"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Admin
          </button>
        )}
        <div className="relative h-20 w-20">
          <Image
            src="/logo.png"
            alt="LockonDocs logo"
            fill
            sizes="80px"
            className="object-contain"
          />
        </div>
        <span className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
          LockonDocs
        </span>
      </div>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Welcome back{userName ? `, ${userName}` : ""}
      </p>

      {/* Expiry reminders banner */}
      {reminderCount > 0 && (
        <button
          type="button"
          onClick={() => router.push("/reminders")}
          className="mb-4 flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] no-select"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlarmClock className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {reminderCount} {reminderCount === 1 ? "document needs" : "documents need"} attention
            </span>
            <span className="block text-xs text-muted-foreground">Expiring soon or already expired</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* Search entry */}
      <button
        type="button"
        onClick={() => router.push("/search")}
        className="mb-5 flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] bg-card px-4 py-3 text-left text-sm text-muted-foreground shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] no-select"
      >
        <Search className="h-4 w-4" />
        Search your documents
      </button>

      {/* Vaults */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">Vaults</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="text-primary"
        >
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(folders ?? []).map((folder, i) => (
            <motion.button
              key={folder.id}
              type="button"
              onClick={() => router.push(`/folder/${folder.id}`)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className="flex flex-col items-start rounded-[var(--radius-lg)] bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.98] no-select"
            >
              <div className="gold-tile mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-accent-foreground">
                <FolderIcon name={folder.icon} className="h-5 w-5" />
              </div>
              <p className="line-clamp-1 font-medium text-foreground">{folder.name}</p>
              <p className="text-xs text-muted-foreground">
                {folder.documentCount} {folder.documentCount === 1 ? "document" : "documents"}
              </p>
            </motion.button>
          ))}

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex min-h-[112px] flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary no-select"
          >
            <FolderPlus className="mb-1 h-6 w-6" />
            <span className="text-xs font-medium">New vault</span>
          </button>
        </div>
      )}

      {/* Recent documents */}
      {!loading && (recent ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            Recent
          </h2>
          <div className="space-y-2">
            {(recent ?? []).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => router.push(`/document/${doc.id}`)}
                className="flex w-full items-center gap-3 rounded-[var(--radius)] bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] no-select"
              >
                <div className="gold-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-accent-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{doc.folderName}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create vault dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[340px] rounded-[var(--radius-lg)]">
          <DialogHeader>
            <DialogTitle className="font-display">New vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folderName">Vault name</Label>
              <Input
                id="folderName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Finances"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-5 gap-2">
                {FOLDER_ICON_CHOICES.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewIcon(icon)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-[var(--radius)] transition-colors",
                      newIcon === icon
                        ? "gold-surface text-primary-foreground"
                        : "bg-accent text-muted-foreground hover:text-primary",
                    )}
                  >
                    <FolderIcon name={icon} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
