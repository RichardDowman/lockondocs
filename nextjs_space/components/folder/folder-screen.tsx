"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ScanLine,
  FileText,
  Loader2,
  MoreVertical,
  Trash2,
  Pencil,
} from "lucide-react";
import { FolderIcon, FOLDER_ICON_CHOICES } from "@/components/app/folder-icon";
import { cn } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";

interface DocItem {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  createdAt: string;
}
interface FolderInfo {
  id: string;
  name: string;
  icon: string;
  isDefault: boolean;
}

export function FolderScreen({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameIcon, setRenameIcon] = useState("folder");
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${folderId}`);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setFolder(data?.folder ?? null);
      setDocuments(data?.documents ?? []);
    } catch (err) {
      toast.error("Could not load this vault.");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRenameFolder() {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("Vault name cannot be empty.");
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, icon: renameIcon }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not rename vault.");
        setRenaming(false);
        return;
      }
      setFolder((prev) => (prev ? { ...prev, name: trimmed, icon: renameIcon } : prev));
      setRenameOpen(false);
      toast.success("Vault renamed.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteFolder() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not delete vault.");
        setDeleting(false);
        return;
      }
      toast.success("Vault deleted.");
      router.replace("/home");
    } catch (err) {
      toast.error("Something went wrong.");
      setDeleting(false);
    }
  }

  return (
    <div className="px-5 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground active:scale-95 no-select"
        >
          <ChevronLeft className="h-5 w-5" /> Vaults
        </button>
        {folder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Vault options"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:scale-95 no-select"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(folder?.name ?? "");
                  setRenameIcon(folder?.icon ?? "folder");
                  setRenameOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Rename vault
              </DropdownMenuItem>
              {!folder.isDefault && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete vault
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notFound ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="font-medium text-foreground">Vault not found</p>
          <Button className="mt-4" onClick={() => router.push("/home")}>
            Back to vaults
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] gold-tile text-accent-foreground">
              <FolderIcon name={folder?.icon} className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {folder?.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {documents.length} {documents.length === 1 ? "document" : "documents"}
              </p>
            </div>
          </div>

          <Button
            className="mb-6 w-full"
            size="lg"
            onClick={() => router.push(`/scan?folderId=${folderId}`)}
          >
            <ScanLine className="mr-2 h-5 w-5" /> Scan into this vault
          </Button>

          {documents.length === 0 ? (
            <div className="flex flex-col items-center rounded-[var(--radius-lg)] bg-card py-12 text-center shadow-sm">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full gold-tile text-accent-foreground">
                <FileText className="h-6 w-6" />
              </div>
              <p className="font-medium text-foreground">No documents yet</p>
              <p className="mt-1 max-w-[220px] text-sm text-muted-foreground">
                Scan your first document to store it securely here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {documents.map((doc, i) => (
                <motion.button
                  key={doc.id}
                  type="button"
                  onClick={() => router.push(`/document/${doc.id}`)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className="overflow-hidden rounded-[var(--radius)] bg-card text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.98] no-select"
                >
                  <div className="relative flex aspect-[3/4] w-full items-center justify-center bg-muted">
                    {doc.mimeType === "application/pdf" ? (
                      <div className="flex flex-col items-center gap-2 text-primary">
                        <FileText className="h-8 w-8" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          PDF
                        </span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/files/${doc.id}?disposition=inline`}
                        alt={doc.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">
                      {doc.name}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-[340px] rounded-[var(--radius-lg)]">
          <DialogHeader>
            <DialogTitle className="font-display">Rename vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="renameFolder">Vault name</Label>
              <Input
                id="renameFolder"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-5 gap-2">
                {FOLDER_ICON_CHOICES.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setRenameIcon(icon)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-[var(--radius)] transition-colors",
                      renameIcon === icon
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
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameFolder} disabled={renaming}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-[340px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vault?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the vault and all documents inside it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteFolder();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
