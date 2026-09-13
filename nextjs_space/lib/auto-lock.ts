// Auto-lock settings shared between the settings screen, the lock provider and
// the user API. The vault locks after this many idle minutes on a device, and
// also whenever the app is backgrounded and reopened. A value of 0 means the
// vault never auto-locks.

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

// 0 is rendered as "Never" in the UI. The rest are whole-minute choices.
export const AUTO_LOCK_CHOICES: number[] = [1, 3, 5, 10, 0];

// localStorage key that keeps the vault locked across reloads on this device.
export const AUTO_LOCK_STORAGE_KEY = "lockondocs.locked";

// Window event dispatched by the settings screen when the user changes the
// auto-lock window, so the mounted lock provider can pick up the new value
// without a page reload.
export const AUTO_LOCK_CHANGED_EVENT = "lockondocs:autolock-changed";

// Clamps an arbitrary value to one of the allowed choices. Anything invalid
// falls back to the default so the lock always behaves predictably.
export function normalizeAutoLockMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_AUTO_LOCK_MINUTES;
  const rounded = Math.round(n);
  return AUTO_LOCK_CHOICES.includes(rounded) ? rounded : DEFAULT_AUTO_LOCK_MINUTES;
}

// Human label for a given choice.
export function autoLockLabel(minutes: number): string {
  if (minutes === 0) return "Never";
  return `${minutes} min`;
}
