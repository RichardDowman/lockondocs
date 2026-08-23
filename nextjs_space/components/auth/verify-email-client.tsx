"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

type State = "loading" | "success" | "error";

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setState("error");
        setMessage("This verification link is invalid or has expired.");
        return;
      }
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState("error");
          setMessage(data?.error ?? "Could not verify your email.");
          return;
        }
        setState("success");
        setMessage("Your email address has been verified.");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage("Something went wrong. Please try again.");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-4 text-center">
      {state === "loading" && (
        <>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your email...</p>
        </>
      )}
      {state === "success" && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link href="/home" className="inline-block text-sm font-medium text-primary hover:underline">
            Go to my vault
          </Link>
        </>
      )}
      {state === "error" && (
        <>
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link href="/home" className="inline-block text-sm font-medium text-primary hover:underline">
            Back to my vault
          </Link>
        </>
      )}
    </div>
  );
}
