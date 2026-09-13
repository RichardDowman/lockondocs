"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUTO_LOCK_STORAGE_KEY,
  AUTO_LOCK_CHANGED_EVENT,
  DEFAULT_AUTO_LOCK_MINUTES,
  normalizeAutoLockMinutes,
} from "@/lib/auto-lock";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

/**
 * Client-side auto-lock. When the signed-in user is idle for their chosen
 * number of minutes, or the app is backgrounded and reopened, a full-screen
 * overlay covers the vault and the user must re-enter their password to carry
 * on. The NextAuth session itself is preserved (this is an overlay, not a
 * sign-out) so the GoodBarber in-app session and cookies survive.
 *
 * A value of 0 minutes means "Never" - no idle lock and no background lock.
 */
export function LockProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession() || {};
  const authenticated = status === "authenticated";
  const router = useRouter();

  const [minutes, setMinutes] = useState<number>(DEFAULT_AUTO_LOCK_MINUTES);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutesRef = useRef(minutes);
  const lockedRef = useRef(locked);
  minutesRef.current = minutes;
  lockedRef.current = locked;

  const lockNow = useCallback(() => {
    if (lockedRef.current) return;
    setLocked(true);
    try {
      window.localStorage.setItem(AUTO_LOCK_STORAGE_KEY, "1");
    } catch {
      /* storage may be unavailable inside some in-app browsers */
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    const m = minutesRef.current;
    if (!m || m <= 0) return; // "Never"
    timerRef.current = setTimeout(lockNow, m * 60 * 1000);
  }, [clearTimer, lockNow]);

  // Load the user's auto-lock setting and any persisted locked state once the
  // session is known to be authenticated.
  useEffect(() => {
    if (!authenticated) {
      clearTimer();
      return;
    }
    let cancelled = false;

    // Restore a locked state that survived a reload.
    try {
      if (window.localStorage.getItem(AUTO_LOCK_STORAGE_KEY) === "1") {
        setLocked(true);
      }
    } catch {
      /* ignore */
    }

    (async () => {
      try {
        const res = await fetch("/api/user");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setMinutes(normalizeAutoLockMinutes(data?.user?.autoLockMinutes));
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) armTimer();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticated, armTimer, clearTimer]);

  // Live-update the window when the user changes the setting in Settings.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      const next = normalizeAutoLockMinutes(detail?.minutes);
      setMinutes(next);
    }
    window.addEventListener(AUTO_LOCK_CHANGED_EVENT, onChange as EventListener);
    return () =>
      window.removeEventListener(
        AUTO_LOCK_CHANGED_EVENT,
        onChange as EventListener,
      );
  }, []);

  // Re-arm the idle timer whenever the window changes (and the vault is open).
  useEffect(() => {
    if (authenticated && !locked) armTimer();
    else clearTimer();
  }, [minutes, authenticated, locked, armTimer, clearTimer]);

  // Track user activity to reset the idle timer.
  useEffect(() => {
    if (!authenticated || locked) return;
    const reset = () => armTimer();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [authenticated, locked, armTimer]);

  // Lock when the app is backgrounded and reopened (unless set to Never).
  useEffect(() => {
    if (!authenticated) return;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (minutesRef.current > 0) lockNow();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [authenticated, lockNow]);

  async function handleUnlock() {
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setUnlocking(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setLocked(false);
        setPassword("");
        try {
          window.localStorage.removeItem(AUTO_LOCK_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        armTimer();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Incorrect password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSignOut() {
    try {
      window.localStorage.removeItem(AUTO_LOCK_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setLocked(false);
    await signOut({ redirect: false });
    router.replace("/login");
  }

  return (
    <>
      {children}
      {authenticated && locked ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6">
          <div className="w-full max-w-[340px] text-center">
            <div className="gold-surface mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground">
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Vault locked
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your password to unlock your documents.
            </p>
            <div className="mt-6 space-y-2 text-left">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUnlock();
                }}
                placeholder="Your password"
                disabled={unlocking}
                autoFocus
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={handleUnlock}
              disabled={unlocking}
            >
              {unlocking ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Lock className="mr-2 h-5 w-5" />
              )}
              Unlock
            </Button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={unlocking}
              className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95 no-select"
            >
              <LogOut className="h-4 w-4" /> Sign out instead
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
