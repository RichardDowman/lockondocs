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
  SlidersHorizontal,
  Plus,
  X,
  Eye,
  EyeOff,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { FieldDef, FieldType } from "@/lib/vault-fields";

interface DraftField {
  key: string;
  label: string;
  type: FieldType;
  optionsText: string;
}

interface DocItem {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  createdAt: string;
  hasThumbnail?: boolean;
}
interface FolderInfo {
  id: string;
  name: string;
  icon: string;
  isDefault: boolean;
  fields: FieldDef[];
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
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldDraft, setFieldDraft] = useState<DraftField[]>([]);
  const [savingFields, setSavingFields] = useState(false);
  // Whether document image previews are shown on the grid tiles. Remembered
  // per browser. Turning previews off means no document images are rendered at
  // all (the tiles show a neutral placeholder), which is useful both for privacy
  // and for checking whether rendered imagery is behind a browser warning.
  const [showPreviews, setShowPreviews] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("lockondocs.showPreviews");
      if (stored === "false") setShowPreviews(false);
    } catch {
      /* ignore storage access issues */
    }
  }, []);

  const togglePreviews = useCallback(() => {
    setShowPreviews((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "lockondocs.showPreviews",
          next ? "true" : "false",
        );
      } catch {
        /* ignore storage access issues */
      }
      return next;
    });
  }, []);

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

  function openFields() {
    const draft: DraftField[] = (folder?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      optionsText: (f.options ?? []).join(", "),
    }));
    setFieldDraft(draft);
    setFieldsOpen(true);
  }

  function addField() {
    setFieldDraft((prev) => [...prev, { key: "", label: "", type: "text", optionsText: "" }]);
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setFieldDraft((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFieldDraft((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveFields() {
    // Build the field definitions from the draft, dropping rows with no label.
    const fields: FieldDef[] = [];
    for (const d of fieldDraft) {
      const label = d.label.trim();
      if (!label) continue;
      const def: FieldDef = { key: d.key.trim(), label, type: d.type };
      if (d.type === "select") {
        const options = d.optionsText
          .split(",")
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
        if (options.length === 0) {
          toast.error(`Add at least one option for "${label}".`);
          return;
        }
        def.options = options;
      }
      fields.push(def);
    }
    if (fields.length > 20) {
      toast.error("A vault can have at most 20 fields.");
      return;
    }
    setSavingFields(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not save fields.");
        setSavingFields(false);
        return;
      }
      setFolder((prev) => (prev ? { ...prev, fields: data?.folder?.fields ?? fields } : prev));
      setFieldsOpen(false);
      toast.success("Fields saved.");
    } catch (err) {
      toast.error("Something went wrong.");
    } finally {
      setSavingFields(false);
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
              <DropdownMenuItem onClick={openFields}>
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Manage fields
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
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {folder?.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {documents.length} {documents.length === 1 ? "document" : "documents"}
              </p>
            </div>
            {documents.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePreviews}
                aria-pressed={showPreviews}
                title={showPreviews ? "Hide document previews" : "Show document previews"}
                aria-label={showPreviews ? "Hide document previews" : "Show document previews"}
                className="shrink-0 text-muted-foreground"
              >
                {showPreviews ? (
                  <Eye className="h-5 w-5" />
                ) : (
                  <EyeOff className="h-5 w-5" />
                )}
              </Button>
            )}
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
                    {!showPreviews ? (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <EyeOff className="h-7 w-7" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide">
                          Preview off
                        </span>
                      </div>
                    ) : doc.mimeType === "application/pdf" && !doc.hasThumbnail ? (
                      <div className="flex flex-col items-center gap-2 text-primary">
                        <FileText className="h-8 w-8" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          PDF
                        </span>
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/files/${doc.id}?disposition=inline&variant=thumb`}
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

      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogContent className="max-w-[360px] rounded-[var(--radius-lg)]">
          <DialogHeader>
            <DialogTitle className="font-display">Manage fields</DialogTitle>
          </DialogHeader>
          <p className="-mt-1 text-xs text-muted-foreground">
            These fields appear when saving or viewing a document in this vault. Renaming a field
            keeps values already saved; removing one hides its saved values.
          </p>
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {fieldDraft.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No fields yet. Add one below.
              </p>
            ) : (
              fieldDraft.map((f, i) => (
                <div key={i} className="space-y-2 rounded-[var(--radius)] bg-accent/50 p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      placeholder="Field name (e.g. Policy number)"
                      disabled={savingFields}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      aria-label="Remove field"
                      disabled={savingFields}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:text-destructive active:scale-95 no-select"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Select
                    value={f.type}
                    onValueChange={(v) => updateField(i, { type: v as FieldType })}
                    disabled={savingFields}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="select">Choice list</SelectItem>
                    </SelectContent>
                  </Select>
                  {f.type === "select" && (
                    <Input
                      value={f.optionsText}
                      onChange={(e) => updateField(i, { optionsText: e.target.value })}
                      placeholder="Options, comma separated"
                      disabled={savingFields}
                    />
                  )}
                </div>
              ))
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={addField}
              disabled={savingFields || fieldDraft.length >= 20}
            >
              <Plus className="mr-2 h-4 w-4" /> Add field
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldsOpen(false)} disabled={savingFields}>
              Cancel
            </Button>
            <Button onClick={handleSaveFields} disabled={savingFields}>
              {savingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
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
