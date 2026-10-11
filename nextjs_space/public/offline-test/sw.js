// LockonDocs offline proof of concept (Step 0 of docs/offline_plan.md).
// Keeps a copy of the test page on the phone so it can open with no signal,
// including when it is installed to the home screen (Build 42).
// Scope is /offline-test/ only: it never touches the real vault pages.
const CACHE = "lockondocs-offline-test-v2";
const PAGE = "/offline-test/index.html";
const ASSETS = [
  PAGE,
  "/offline-test/manifest.json",
  "/offline-test/icon-180.png",
  "/offline-test/icon-192.png",
  "/offline-test/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.indexOf("lockondocs-offline-test") === 0 && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/offline-test/")) return;
  if (url.pathname.endsWith("/ping.txt")) return; // always a real network check

  // Page: network first, stored copy when there is no signal.
  if (event.request.mode === "navigate" || url.pathname === PAGE) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(PAGE, copy));
          return res;
        })
        .catch(() => caches.match(PAGE)),
    );
    return;
  }

  // Manifest and icons: stored copy first.
  if (ASSETS.indexOf(url.pathname) !== -1) {
    event.respondWith(
      caches.match(url.pathname).then((hit) => hit || fetch(event.request)),
    );
  }
});
