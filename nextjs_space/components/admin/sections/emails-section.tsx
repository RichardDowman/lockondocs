"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  DateFilter,
  DateFilterValue,
  dateFilterParams,
} from "@/components/admin/date-filter";
import { formatDate } from "@/components/admin/format";

interface EmailEntry {
  id: string;
  recipientEmail: string;
  type: string;
  subject: string;
  preview: string;
  status: string;
  error: string;
  documentId: string;
  createdAt: string;
}

// Human labels for known email types.
const TYPE_LABELS: Record<string, string> = {
  reminder_soon: "Expiring soon",
  reminder_expired: "Expired",
  password_reset: "Password reset",
  email_verification: "Email verification",
  general: "General",
};

function typeLabel(t: string): string {
  return (
    TYPE_LABELS[t] ??
    t.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

export function EmailsSection() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<DateFilterValue>({ key: "all" });
  const [page, setPage] = useState(1);

  const [logs, setLogs] = useState<EmailEntry[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams(dateFilterParams(range));
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    params.set("page", String(page));
    return params;
  }, [range, debouncedQ, type, status, page]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/emails?${queryParams.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not load emails.");
        return;
      }
      setLogs(data.logs ?? []);
      setTypes(data.types ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      toast.error("Could not load emails.");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, type, status, range]);

  function exportCsv() {
    const params = new URLSearchParams(queryParams);
    params.set("format", "csv");
    params.delete("page");
    window.location.assign(`/api/admin/emails?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Emails
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Transactional emails sent by LockonDocs. Status reflects whether the
            mail provider accepted the message.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by recipient or subject"
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {typeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateFilter value={range} onChange={setRange} />
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No emails match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden lg:table-cell">Preview</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-[180px] truncate text-sm text-foreground">
                      {l.recipientEmail}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{typeLabel(l.type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm font-medium text-foreground">
                      {l.subject}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-[280px] truncate text-sm text-muted-foreground">
                      {l.preview || "-"}
                    </TableCell>
                    <TableCell>
                      {l.status === "sent" ? (
                        <Badge variant="secondary">Sent</Badge>
                      ) : (
                        <Badge variant="destructive" title={l.error || undefined}>
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                      {formatDate(l.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} email{total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
