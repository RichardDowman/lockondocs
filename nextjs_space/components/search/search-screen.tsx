"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Loader2, FileText, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ResultDoc {
  id: string;
  name: string;
  folderName: string;
  fileSize: number;
  createdAt: string;
  url: string;
}

const SORT_LABELS: Record<string, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  name_asc: "Name (A-Z)",
  name_desc: "Name (Z-A)",
};

export function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [results, setResults] = useState<ResultDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string, sortBy: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("sort", sortBy);
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Search failed.");
        setResults([]);
      } else {
        setResults(data?.documents ?? []);
      }
    } catch (err) {
      toast.error("Something went wrong.");
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  // Load all documents (most recent) on first mount.
  useEffect(() => {
    runSearch("", "date_desc");
  }, [runSearch]);

  // Debounced search on query change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(q, sort);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort]);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Sort results"
              className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm active:scale-95 no-select"
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> {SORT_LABELS[sort]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <DropdownMenuItem key={value} onClick={() => setSort(value)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">Search</h1>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, type, or details"
          className="pl-9"
          autoFocus
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--radius-lg)] bg-card py-12 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full gold-tile text-accent-foreground">
            <Search className="h-6 w-6" />
          </div>
          <p className="font-medium text-foreground">
            {searched && q ? "No matching documents" : "No documents yet"}
          </p>
          <p className="mt-1 max-w-[240px] text-sm text-muted-foreground">
            {searched && q
              ? "Try a different name or clear your search."
              : "Scan a document to see it here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((doc, i) => (
            <motion.button
              key={doc.id}
              type="button"
              onClick={() => router.push(`/document/${doc.id}`)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
              className="flex w-full items-center gap-3 rounded-[var(--radius)] bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] no-select"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] gold-tile text-accent-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium text-foreground">
                  {doc.name}
                </p>
                <p className="text-xs text-muted-foreground">{doc.folderName}</p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
