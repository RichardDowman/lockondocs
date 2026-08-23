"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Download,
  Loader2,
  MoreVertical,
  Trash2,
  Pencil,
  Check,
  X,
  FolderInput,
  FileText,
} from "lucide-react";
import { FolderIcon } from "@/components/app/folder-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

interface DocDetail {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  folderId: string;
  folderName: string;
  url: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DocumentScreen({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDoc(data?.document ?? null);
      setName(data?.document?.name ?? "");
    } catch (err) {
      toast.error("Could not load this document.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    load();
  }, [load]);

  const isPdf = doc?.mimeType === "application/pdf";
  // Preview and download both stream through the app's own domain so the
  // underlying storage host is never shown to the user.
  const previewUrl = `/api/files/${documentId}?disposition=inline`;
  const downloadUrl = `/api/files/${documentId}`;

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = downloadUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [downloadUrl]);

  async function handleRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not rename.");
        setSaving(false);
        return;
      }
      setDoc((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setEditing(false);
      toast.success("Document renamed.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function openMove() {
    setMoveOpen(true);
    try {
      const res = await fetch("/api/folders");
      const data = await res.json().catch(() => ({}));
      setFolders(data?.folders ?? []);
    } catch (err) {
      toast.error("Could not load vaults.");
    }
  }

  async function handleMove(targetFolderId: string) {
    if (!doc || targetFolderId === doc.folderId) {
      setMoveOpen(false);
      return;
    }
    setMoving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not move document.");
        setMoving(false);
        return;
      }
      const target = folders.find((f) => f.id === targetFolderId);
      setDoc((prev) =>
        prev
          ? { ...prev, folderId: targetFolderId, folderName: target?.name ?? prev.folderName }
          : prev,
      );
      setMoveOpen(false);
      toast.success("Document moved.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not delete.");
        setDeleting(false);
        return;
      }
      toast.success("Document deleted.");
      const target = doc?.folderId ? `/folder/${doc.folderId}` : "/home";
      router.replace(target);
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
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground active:scale-95 no-select"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        {doc && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Document options"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:scale-95 no-select"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openMove}>
                <FolderInput className="mr-2 h-4 w-4" /> Move to vault
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notFound || !doc ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="font-medium text-foreground">Document not found</p>
          <Button className="mt-4" onClick={() => router.push("/home")}>
            Back to vaults
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 overflow-hidden rounded-[var(--radius-lg)] bg-card p-2 shadow-sm">
            {isPdf ? (
              <iframe
                src={previewUrl}
                title={doc.name}
                className="h-[70vh] w-full rounded-[var(--radius)] border-0 bg-muted"
              />
            ) : (
              <div className="relative flex min-h-[300px] w-full items-center justify-center overflow-hidden rounded-[var(--radius)] bg-muted">
                {/* object-contain keeps the full image visible and preserves its
                    aspect ratio, so a landscape scan is never squashed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={doc.name}
                  className="h-auto max-h-[70vh] w-full object-contain"
                />
              </div>
            )}
          </div>

          {editing ? (
            <div className="mb-4 flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={saving}
              />
              <Button size="icon" onClick={handleRename} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setName(doc.name);
                }}
                disabled={saving}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="mb-4">
              <h1 className="font-display text-xl font-bold tracking-tight">{doc.name}</h1>
              <p className="text-sm text-muted-foreground">
                {doc.folderName} &middot; {formatBytes(doc.fileSize)}
              </p>
            </div>
          )}

          <Button className="w-full" size="lg" variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-5 w-5" /> {isPdf ? "Download PDF" : "Download"}
          </Button>
        </>
      )}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-[340px] rounded-[var(--radius-lg)]">
          <DialogHeader>
            <DialogTitle className="font-display">Move to vault</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {folders.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              folders.map((f) => {
                const current = f.id === doc?.folderId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={moving || current}
                    onClick={() => handleMove(f.id)}
                    className="flex w-full items-center gap-3 rounded-[var(--radius)] p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60 no-select"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] gold-tile text-accent-foreground">
                      <FolderIcon name={f.icon} className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {f.name}
                    </span>
                    {current && (
                      <span className="text-xs text-muted-foreground">Current</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-[340px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the document. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
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
