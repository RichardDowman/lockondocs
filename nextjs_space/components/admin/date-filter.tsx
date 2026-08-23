"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RangeKey = "today" | "7d" | "30d" | "all" | "custom";

export interface DateFilterValue {
  key: RangeKey;
  from?: string; // yyyy-mm-dd (custom only)
  to?: string; // yyyy-mm-dd (custom only)
}

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

// Serialise the current filter into query-string params for the admin APIs.
export function dateFilterParams(value: DateFilterValue): Record<string, string> {
  const params: Record<string, string> = { range: value.key };
  if (value.key === "custom") {
    if (value.from) params.from = value.from;
    if (value.to) params.to = value.to;
  }
  return params;
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function DateFilter({
  value,
  onChange,
}: {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>(
    value.from
      ? { from: new Date(value.from), to: value.to ? new Date(value.to) : undefined }
      : undefined
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.key}
          type="button"
          size="sm"
          variant={value.key === p.key ? "default" : "outline"}
          onClick={() => onChange({ key: p.key })}
        >
          {p.label}
        </Button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={value.key === "custom" ? "default" : "outline"}
            className={cn("justify-start text-left font-normal")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value.key === "custom" && value.from ? (
              value.to ? (
                <>
                  {format(new Date(value.from), "dd LLL y")} -{" "}
                  {format(new Date(value.to), "dd LLL y")}
                </>
              ) : (
                format(new Date(value.from), "dd LLL y")
              )
            ) : (
              <span>Custom range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={pending?.from}
            selected={pending}
            onSelect={(r) => setPending(r as DateRange)}
            numberOfMonths={2}
          />
          <div className="flex items-center justify-end gap-2 border-t border-border p-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPending(undefined);
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!pending?.from}
              onClick={() => {
                if (!pending?.from) return;
                onChange({
                  key: "custom",
                  from: toYmd(pending.from),
                  to: pending.to ? toYmd(pending.to) : toYmd(pending.from),
                });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
