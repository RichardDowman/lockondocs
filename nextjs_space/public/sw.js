/* LockonDocs offline vault worker (Build 43).
 * Registered only when the Offline vault setting is on, in the installed app,
 * or on /install. Pages always come from the network; only when the network
 * fails is the encrypted offline viewer shown instead. API responses and
 * documents are never cached here: the encrypted copy lives in IndexedDB.
 */
var CACHE = "lockondocs-app-v1";
var PREFIX = "lockondocs-app-";
var SHELL = [
  "/offline/index.html",
  "/offline/viewer.js",
  "/icons/icon-192.png",
  "/icons/apple-icon-180.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(
        SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isShell(path) {
  return SHELL.indexOf(path) !== -1;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;
  if (path.indexOf("/api/") === 0 || path.indexOf("/offline-test/") === 0) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("/offline/index.html", { ignoreSearch: true }).then(function (r) {
          return r || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        });
      })
    );
    return;
  }

  if (isShell(path)) {
    // Network first so updates arrive, cached copy when offline.
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(path, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(path).then(function (r) {
          return r || new Response("", { status: 504 });
        });
      })
    );
  }
});
