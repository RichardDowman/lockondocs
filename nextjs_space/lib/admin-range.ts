/**
 * Parses admin dashboard/list date-range query params into a start/end window.
 * Supported ranges: today, 7d, 30d, all, custom (with from/to ISO dates).
 * Returns null bounds for "all" so callers can omit the filter entirely.
 */
export type RangeKey = "today" | "7d" | "30d" | "all" | "custom";

export interface ResolvedRange {
  key: RangeKey;
  from: Date | null;
  to: Date | null;
}

export function resolveRange(params: URLSearchParams): ResolvedRange {
  const rawKey = (params.get("range") ?? "all").toLowerCase() as RangeKey;
  const now = new Date();

  if (rawKey === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { key: "today", from, to: null };
  }
  if (rawKey === "7d") {
    return { key: "7d", from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: null };
  }
  if (rawKey === "30d") {
    return { key: "30d", from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: null };
  }
  if (rawKey === "custom") {
    const fromStr = params.get("from");
    const toStr = params.get("to");
    let from: Date | null = null;
    let to: Date | null = null;
    if (fromStr) {
      const d = new Date(fromStr);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        from = d;
      }
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        to = d;
      }
    }
    return { key: "custom", from, to };
  }
  return { key: "all", from: null, to: null };
}

/** Builds a Prisma createdAt filter object, or undefined when the range is open. */
export function createdAtFilter(range: ResolvedRange): { gte?: Date; lte?: Date } | undefined {
  const f: { gte?: Date; lte?: Date } = {};
  if (range.from) f.gte = range.from;
  if (range.to) f.lte = range.to;
  return Object.keys(f).length ? f : undefined;
}

/** Escapes a value for safe inclusion in a CSV cell. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}
