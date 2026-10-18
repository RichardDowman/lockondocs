// Client-only helpers for the offline vault (Build 43).
//
// The on-phone copy lives in IndexedDB "lockondocs-offline" and every record
// is encrypted. Layout (read the same way by public/offline/viewer.js):
//   meta/keyring : { userId, email, salt, iter, wrapIv, wrappedPriv, pubRaw }
//   meta/state   : { userId, lastSync, count, saved, bytes }
//   meta/fails   : number of wrong offline passwords
//   records/<k>  : { e, iv, ct } where k is "index", "file:<id>" or "thumb:<id>"
//
// Records are encrypted with AES-GCM 256 using a key agreed (ECDH P-256)
// between a per-sync ephemeral key and the phone's vault key pair. The private
// half of that pair is only stored wrapped by a key derived from the user's
// password (PBKDF2 SHA-256), so the copy can only be opened with the password,
// while the online app can keep it up to date without ever storing it.

export const OFFLINE_FLAG_KEY = "lockondocs.offlineVault";
export const OFFLINE_DB = "lockondocs-offline";
export const OFFLINE_SYNC_NOW_EVENT = "lockondocs:offline-sync-now";
export const OFFLINE_SYNCED_EVENT = "lockondocs:offline-synced";
export const OFFLINE_NEEDS_PASSWORD_EVENT = "lockondocs:offline-needs-password";
export const OFFLINE_SIZE_CAP_BYTES = 250 * 1024 * 1024;

const PBKDF2_ITERATIONS = 310000;
const SW_URL = "/sw.js?v=46";

export interface OfflineKeyring {
  userId: string;
  email: string;
  salt: Uint8Array;
  iter: number;
  wrapIv: Uint8Array;
  wrappedPriv: ArrayBuffer;
  pubRaw: ArrayBuffer;
}

export interface OfflineState {
  userId: string;
  lastSync: number;
  count: number;
  saved: number;
  bytes: number;
}

export interface EncryptedRecord {
  e: ArrayBuffer;
  iv: Uint8Array;
  ct: ArrayBuffer;
}

// ---------------------------------------------------------------- platform

export function getPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const androidWebView =
    isAndroid && (/; wv\)/.test(ua) || /Version\/\d+\.\d+ Chrome/.test(ua));
  const iosSafari =
    isIOS &&
    /Safari\//.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua);
  return { isIOS, isAndroid, androidWebView, iosSafari, standalone: isStandalone() };
}

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- flag

// "1" = on in this browser, "0" = switched off, "jump" = switched on here but
// handed over to the phone's own browser (in-app browsers cannot install).
export function readOfflineFlag(): string | null {
  try {
    return window.localStorage.getItem(OFFLINE_FLAG_KEY);
  } catch {
    return null;
  }
}

export function writeOfflineFlag(value: "1" | "0" | "jump") {
  try {
    window.localStorage.setItem(OFFLINE_FLAG_KEY, value);
  } catch {
    /* storage may be unavailable in some in-app browsers */
  }
}

// True when this browser should keep an offline copy. The installed app keeps
// one by default (that is the reason it exists) unless it was switched off.
export function offlineEnabledHere(): boolean {
  const flag = readOfflineFlag();
  if (flag === "1") return true;
  return isStandalone() && flag !== "0";
}

// ---------------------------------------------------------------- IndexedDB

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  store: "meta" | "records",
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export function idbGet<T = any>(store: "meta" | "records", key: string) {
  return tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
}
export function idbPut(store: "meta" | "records", key: string, value: any) {
  return tx(store, "readwrite", (s) => s.put(value, key));
}
export function idbDelete(store: "meta" | "records", key: string) {
  return tx(store, "readwrite", (s) => s.delete(key));
}
export async function idbKeys(store: "meta" | "records"): Promise<string[]> {
  const keys = await tx(store, "readonly", (s) => s.getAllKeys());
  return (keys as IDBValidKey[]).map(String);
}
function idbClear(store: "meta" | "records") {
  return tx(store, "readwrite", (s) => s.clear());
}

export function getKeyring() {
  return idbGet<OfflineKeyring | undefined>("meta", "keyring");
}
export function getOfflineState() {
  return idbGet<OfflineState | undefined>("meta", "state");
}

// ---------------------------------------------------------------- crypto

const enc = new TextEncoder();

async function passwordKey(password: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function passwordOpens(kr: OfflineKeyring, password: string) {
  try {
    const wk = await passwordKey(password, kr.salt, kr.iter);
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: kr.wrapIv }, wk, kr.wrappedPriv);
    return true;
  } catch {
    return false;
  }
}

async function createKeyring(password: string, userId: string, email: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const pubRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wk = await passwordKey(password, salt, PBKDF2_ITERATIONS);
  const wrappedPriv = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, wk, pkcs8);
  const kr: OfflineKeyring = {
    userId,
    email,
    salt,
    iter: PBKDF2_ITERATIONS,
    wrapIv,
    wrappedPriv,
    pubRaw,
  };
  await idbPut("meta", "keyring", kr);
  await idbPut("meta", "fails", 0);
}

// Called with the password the user has just proven (sign-in or unlock). Sets
// up the phone's vault key the first time, and re-keys after a password change
// or a different account, so the offline copy always opens with the current
// password. Never stores the password itself.
export async function rememberOfflinePassword(
  password: string,
  userId: string,
  email: string,
) {
  if (!password || !userId || !offlineEnabledHere()) return;
  if (typeof indexedDB === "undefined" || !crypto?.subtle) return;
  try {
    const kr = await getKeyring();
    if (kr && kr.userId === userId && (await passwordOpens(kr, password))) return;
    // New phone setup, a password change or a different account: start clean.
    await idbClear("records");
    await idbDelete("meta", "state");
    await createKeyring(password, userId, email);
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_NOW_EVENT));
  } catch (err) {
    console.error("Offline vault key setup failed:", err);
  }
}

// One encrypter per sync run: a fresh ephemeral key agreed with the phone's
// public key. Only the password-wrapped private key can reverse it.
export async function makeEncrypter(pubRaw: ArrayBuffer) {
  const pub = await crypto.subtle.importKey(
    "raw",
    pubRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const eph = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  )) as CryptoKeyPair;
  const aes = await crypto.subtle.deriveKey(
    { name: "ECDH", public: pub },
    eph.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const e = await crypto.subtle.exportKey("raw", eph.publicKey);
  return async (data: ArrayBuffer): Promise<EncryptedRecord> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, data);
    return { e, iv, ct };
  };
}

// ---------------------------------------------------------------- lifecycle

export async function registerOfflineWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await navigator.storage?.persist?.();
  } catch (err) {
    console.error("Offline worker registration failed:", err);
  }
}

async function unregisterOfflineWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = (r.active || r.waiting || r.installing)?.scriptURL;
          return !!url && new URL(url).pathname === "/sw.js";
        })
        .map((r) => r.unregister()),
    );
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("lockondocs-app-")).map((k) => caches.delete(k)),
    );
  } catch (err) {
    console.error("Offline worker removal failed:", err);
  }
}

// Removes the encrypted copy (and its key) from this browser.
export function wipeOfflineCopy(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(OFFLINE_DB);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Switching the toggle off: copy, key, worker and flag all go.
export async function turnOfflineOff() {
  writeOfflineFlag("0");
  await wipeOfflineCopy();
  await unregisterOfflineWorker();
}
