"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { FolderIcon } from "@/components/app/folder-icon";
import { Input } from "@/components/ui/input";
import { VAULT_ICON_LIBRARY } from "@/lib/vault-icon-library";
import { cn } from "@/lib/utils";

export function VaultIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const selected = VAULT_ICON_LIBRARY.find((icon) => icon.id === value);
  const results = VAULT_ICON_LIBRARY.filter((icon) => icon.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="vault-icon-options"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-[var(--radius)] bg-accent p-3 text-left text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FolderIcon name={value} className="h-6 w-6" imageClassName="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Choose an icon</span>
          <span className="block text-xs text-muted-foreground">{selected?.label ?? "Default folder icon"}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div id="vault-icon-options" className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search icons" placeholder="Search icons, e.g. travel" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <p className="text-xs text-muted-foreground">Choose artwork for your vault. This does not add any extra vaults.</p>
          <div className="grid max-h-[32dvh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-1" role="group" aria-label="Vault icon library">
            {results.map((icon) => (
              <button
                key={icon.id}
                type="button"
                aria-label={icon.label}
                aria-pressed={value === icon.id}
                onClick={() => { onChange(icon.id); setExpanded(false); setQuery(""); }}
                className={cn(
                  "relative flex min-h-[96px] flex-col items-center justify-start gap-1 rounded-[var(--radius)] p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  value === icon.id ? "bg-accent text-accent-foreground ring-2 ring-primary" : "bg-card text-card-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <FolderIcon name={icon.id} className="h-6 w-6" imageClassName="h-11 w-11" />
                <span className="text-[10px] leading-tight">{icon.label}</span>
                {value === icon.id && <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
          {results.length === 0 && <p role="status" className="text-sm text-muted-foreground">No icons found. Try a different search.</p>}
        </div>
      )}
    </div>
  );
}
