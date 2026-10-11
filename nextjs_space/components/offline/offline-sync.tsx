"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  OFFLINE_NEEDS_PASSWORD_EVENT,
  OFFLINE_SIZE_CAP_BYTES,
  OFFLINE_SYNCED_EVENT,
  OFFLINE_SYNC_NOW_EVENT,
  getKeyring,
  getOfflineState,
  idbDelete,
  idbKeys,
  idbPut,
  isStandalone,
  makeEncrypter,
  offlineEnabledHere,
  registerOfflineWorker,
} from "@/lib/offline/vault-store";

const MIN_GAP_MS = 10 * 60 * 1000;

class AuthLost extends Error {}

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new AuthLost();
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function getBytes(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new AuthLost();
  if (!res.ok) return null;
  return res.arrayBuffer();
}

const te = new TextEncoder();

/**
 * Keeps an encrypted, read-only copy of the signed-in user's vault on this
 * phone when the Offline vault setting is on. Only runs online and signed in;
 * never touches anything when the setting is off.
 */
export function OfflineSync() {
  const { data: session, status } = useSession() || {};
  const userId = (session?.user as any)?.id as string | undefined;
  const runningRef = useRef(false);
  const askedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (!offlineEnabledHere()) return;
    registerOfflineWorker();

    let cancelled = false;

    async function run(force: boolean) {
      if (cancelled || runningRef.current || !navigator.onLine) return;
      if (!offlineEnabledHere()) return;
      runningRef.current = true;
      try {
        const kr = await getKeyring();
        if (!kr || kr.userId !== userId) {
          // The copy can only be keyed with the password. The installed app
          // asks for it once through the lock screen; elsewhere it is picked
          // up at the next sign-in or unlock.
          if (isStandalone() && !askedRef.current) {
            askedRef.current = true;
            window.dispatchEvent(new CustomEvent(OFFLINE_NEEDS_PASSWORD_EVENT));
          }
          return;
        }
        const state = await getOfflineState();
        if (!force && state && state.userId === userId && Date.now() - state.lastSync < MIN_GAP_MS) {
          return;
        }
        await syncNow(kr.pubRaw, userId!, kr.email);
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNCED_EVENT));
      } catch (err) {
        if (!(err instanceof AuthLost)) console.error("Offline vault sync failed:", err);
      } finally {
        runningRef.current = false;
      }
    }

    const onNow = () => run(true);
    const onOnline = () => run(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    window.addEventListener(OFFLINE_SYNC_NOW_EVENT, onNow);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setTimeout(() => run(false), 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener(OFFLINE_SYNC_NOW_EVENT, onNow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, userId]);

  return null;
}

interface FolderListItem {
  id: string;
  name: string;
  icon?: string | null;
}

async function syncNow(pubRaw: ArrayBuffer, userId: string, email: string) {
  const encrypt = await makeEncrypter(pubRaw);
  const existing = new Set(await idbKeys("records"));

  const { folders } = (await getJson("/api/folders")) as { folders: FolderListItem[] };
  const vaults: any[] = [];
  const allDocs: any[] = [];

  for (const f of folders ?? []) {
    const data = await getJson(`/api/folders/${encodeURIComponent(f.id)}`);
    const docs: any[] = [];
    for (const d of data?.documents ?? []) {
      let metadata: Record<string, string> = {};
      let expiryDate: string | null = null;
      try {
        const detail = await getJson(`/api/documents/${encodeURIComponent(d.id)}`);
        metadata = detail?.document?.metadata ?? {};
        expiryDate = detail?.document?.expiryDate ?? null;
      } catch (err) {
        if (err instanceof AuthLost) throw err;
      }
      const doc = {
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize) || 0,
        createdAt: d.createdAt,
        expiryDate,
        metadata,
        hasThumbnail: !!d.hasThumbnail,
        saved: false,
        thumb: false,
      };
      docs.push(doc);
      allDocs.push(doc);
    }
    vaults.push({
      id: f.id,
      name: data?.folder?.name ?? f.name,
      icon: data?.folder?.icon ?? f.icon ?? null,
      fields: data?.folder?.fields ?? [],
      docs,
    });
  }

  // Newest first, so the size cap keeps the most recent documents.
  allDocs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  let bytes = 0;
  for (const doc of allDocs) {
    const fileKey = `file:${doc.id}`;
    if (existing.has(fileKey)) {
      doc.saved = true;
      bytes += doc.fileSize;
    } else if (bytes + doc.fileSize <= OFFLINE_SIZE_CAP_BYTES) {
      const buf = await getBytes(`/api/files/${encodeURIComponent(doc.id)}?disposition=inline`);
      if (buf) {
        await idbPut("records", fileKey, await encrypt(buf));
        doc.saved = true;
        bytes += buf.byteLength;
      }
    }
    const thumbKey = `thumb:${doc.id}`;
    if (existing.has(thumbKey)) {
      doc.thumb = true;
    } else if (doc.hasThumbnail) {
      const buf = await getBytes(`/api/files/${encodeURIComponent(doc.id)}?variant=thumb`);
      if (buf) {
        await idbPut("records", thumbKey, await encrypt(buf));
        doc.thumb = true;
      }
    }
  }

  // Drop anything deleted online since the last sync.
  const keep = new Set<string>(["index"]);
  for (const doc of allDocs) {
    if (doc.saved) keep.add(`file:${doc.id}`);
    if (doc.thumb) keep.add(`thumb:${doc.id}`);
  }
  for (const key of Array.from(existing)) {
    if (!keep.has(key)) await idbDelete("records", key);
  }

  const syncedAt = Date.now();
  const index = { email, syncedAt, vaults };
  await idbPut("records", "index", await encrypt(te.encode(JSON.stringify(index)).buffer as ArrayBuffer));
  await idbPut("meta", "state", {
    userId,
    lastSync: syncedAt,
    count: allDocs.length,
    saved: allDocs.filter((d) => d.saved).length,
    bytes,
  });
}
