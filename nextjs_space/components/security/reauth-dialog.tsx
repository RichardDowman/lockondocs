"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Reusable password confirmation modal. Verifies the signed-in user's password
 * through /api/auth/reauth and calls onSuccess when it matches. Used to reveal
 * masked sensitive fields on the document screen.
 */
export function ReauthDialog({
  open,
  onOpenChange,
  onSuccess,
  title = "Confirm your password",
  description = "For your security, please re-enter your password to reveal this information.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}) {
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  // Clear state whenever the dialog is opened or closed.
  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setVerifying(false);
    }
  }, [open]);

  async function verify() {
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
        onOpenChange(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !verifying && onOpenChange(o)}>
      <DialogContent className="max-w-[340px] rounded-[var(--radius-lg)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ShieldCheck className="h-5 w-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reauth-password">Password</Label>
          <Input
            id="reauth-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") verify();
            }}
            placeholder="Your password"
            disabled={verifying}
            autoFocus
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={verifying}
          >
            Cancel
          </Button>
          <Button className="flex-1" onClick={verify} disabled={verifying}>
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reveal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
