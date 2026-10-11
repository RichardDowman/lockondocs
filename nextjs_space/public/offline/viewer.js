/* LockonDocs offline viewer (Build 43). Read-only view of the encrypted copy
 * saved on this phone by the Offline vault setting. Format: see
 * lib/offline/vault-store.ts.
 */
(function () {
  "use strict";
  var DB = "lockondocs-offline";
  var MAX_FAILS = 10;
  var RELOCK_MS = 5 * 60 * 1000;
  var SENSITIVE = /(id.?number|passport.?number|licen[cs]e.?number|\bssn\b|social.?security|account.?number|\bvin\b|tax.?id|policy.?number|username|password|recovery.?code|patient.?name)/i;

  var app = document.getElementById("app");
  var bar = document.getElementById("bar");
  var priv = null;
  var keyCache = {};
  var index = null;
  var urls = [];
  var stack = [];
  var hiddenAt = 0;
  var online = false;

  // ------------------------------------------------------------ storage
  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function op(store, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var r = fn(t.objectStore(store));
        t.oncomplete = function () { db.close(); resolve(r.result); };
        t.onerror = function () { db.close(); reject(t.error); };
      });
    });
  }
  function get(store, key) { return op(store, "readonly", function (s) { return s.get(key); }); }
  function put(store, key, val) { return op(store, "readwrite", function (s) { return s.put(val, key); }); }
  function wipe() {
    return new Promise(function (resolve) {
      var r = indexedDB.deleteDatabase(DB);
      r.onsuccess = r.onerror = r.onblocked = function () { resolve(); };
    });
  }

  // ------------------------------------------------------------ crypto
  function unwrap(password, kr) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: kr.salt, iterations: kr.iter, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      })
      .then(function (wk) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: kr.wrapIv }, wk, kr.wrappedPriv); })
      .then(function (pkcs8) {
        return crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
      });
  }
  function b64(buf) {
    var s = "", b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function recordKey(e) {
    var id = b64(e);
    if (keyCache[id]) return keyCache[id];
    keyCache[id] = crypto.subtle.importKey("raw", e, { name: "ECDH", namedCurve: "P-256" }, false, [])
      .then(function (pub) {
        return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      });
    return keyCache[id];
  }
  function openRecord(key) {
    return get("records", key).then(function (rec) {
      if (!rec || !priv) return null;
      return recordKey(rec.e).then(function (k) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, k, rec.ct);
      });
    });
  }

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function when(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString("en-US") + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  function dateOnly(v) {
    if (!v) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (m) return Number(m[2]) + "/" + Number(m[3]) + "/" + m[1];
    return String(v);
  }
  function sensitive(f) {
    return (f.type === "text" || f.type === "number") && (SENSITIVE.test(f.key || "") || SENSITIVE.test(f.label || ""));
  }
  function releaseUrls() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
  }
  function blobUrl(buf, type) {
    var u = URL.createObjectURL(new Blob([buf], { type: type || "application/octet-stream" }));
    urls.push(u);
    return u;
  }

  // ------------------------------------------------------------ connection bar
  function renderBar() {
    if (online) {
      bar.innerHTML = "<span>Back online</span><button type=\"button\" id=\"goLive\">Open vault</button>";
      document.getElementById("goLive").onclick = function () { location.replace("/home"); };
      bar.hidden = false;
    } else if (index) {
      bar.innerHTML = "<span>Offline · showing the copy saved " + esc(when(index.syncedAt)) + "</span>";
      bar.hidden = false;
    } else {
      bar.hidden = true;
    }
  }
  function checkOnline() {
    if (!navigator.onLine) { online = false; renderBar(); return; }
    fetch("/manifest.webmanifest?ping=" + Date.now(), { cache: "no-store" })
      .then(function (r) { online = r.ok; })
      .catch(function () { online = false; })
      .then(renderBar);
  }

  // ------------------------------------------------------------ screens
  function showMessage(title, text) {
    app.innerHTML = "<div class=\"center\"><img class=\"logo\" src=\"/icons/apple-icon-180.png\" alt=\"LockonDocs logo\"><h1>" +
      esc(title) + "</h1><p class=\"sub\">" + esc(text) + "</p></div>";
  }

  function showLock(kr) {
    priv = null; keyCache = {}; index = null; stack = []; releaseUrls(); renderBar();
    app.innerHTML =
      "<form class=\"center\" id=\"lockForm\" autocomplete=\"off\">" +
      "<img class=\"logo\" src=\"/icons/apple-icon-180.png\" alt=\"LockonDocs logo\">" +
      "<h1>Vault locked</h1><p class=\"sub\">" + esc(kr.email || "") + "</p>" +
      "<input type=\"password\" id=\"pw\" placeholder=\"Your password\" autocomplete=\"current-password\">" +
      "<button class=\"btn\" id=\"unlockBtn\" type=\"submit\">Unlock</button>" +
      "<div class=\"err\" id=\"err\"></div></form>";
    var form = document.getElementById("lockForm");
    var pw = document.getElementById("pw");
    var btn = document.getElementById("unlockBtn");
    var err = document.getElementById("err");
    form.onsubmit = function (e) {
      e.preventDefault();
      if (!pw.value) { err.textContent = "Please enter your password."; return; }
      btn.disabled = true; err.textContent = "";
      unwrap(pw.value, kr).then(function (key) {
        priv = key;
        return put("meta", "fails", 0).then(function () { return openRecord("index"); });
      }).then(function (buf) {
        index = JSON.parse(new TextDecoder().decode(buf));
        renderBar();
        go({ view: "vaults" }, true);
      }).catch(function () {
        if (priv) { showMessage("Could not open the copy", "Connect to the internet and open LockonDocs to save it again."); return; }
        get("meta", "fails").then(function (n) {
          n = (Number(n) || 0) + 1;
          if (n >= MAX_FAILS) {
            return wipe().then(function () {
              showMessage("Offline copy removed", "Too many wrong passwords. Connect and sign in to save your vault again.");
            });
          }
          return put("meta", "fails", n).then(function () {
            btn.disabled = false; pw.value = "";
            err.textContent = "Incorrect password. " + (MAX_FAILS - n) + " tries left.";
          });
        });
      });
    };
    setTimeout(function () { pw.focus(); }, 50);
  }

  function go(state, replace) {
    if (replace) stack = [state]; else stack.push(state);
    if (!replace) history.pushState({ ld: stack.length }, "");
    render();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); }
  }
  window.addEventListener("popstate", function () { if (priv) back(); });

  function render() {
    releaseUrls();
    var s = stack[stack.length - 1];
    window.scrollTo(0, 0);
    if (s.view === "vaults") return renderVaults();
    if (s.view === "vault") return renderVault(s.id);
    if (s.view === "doc") return renderDoc(s.vault, s.id);
  }

  function findVault(id) {
    for (var i = 0; i < index.vaults.length; i++) if (index.vaults[i].id === id) return index.vaults[i];
    return null;
  }

  function renderVaults() {
    var html = "<h2>Your vaults</h2><div class=\"list\">";
    index.vaults.forEach(function (v) {
      html += "<button class=\"row\" data-id=\"" + esc(v.id) + "\"><div class=\"thumb\">" + esc((v.name || "?").charAt(0).toUpperCase()) +
        "</div><div class=\"meta\"><div class=\"name\">" + esc(v.name) + "</div><div class=\"small\">" +
        v.docs.length + (v.docs.length === 1 ? " document" : " documents") + "</div></div></button>";
    });
    if (!index.vaults.length) html += "<div class=\"empty\">No vaults saved yet.</div>";
    app.innerHTML = html + "</div>";
    Array.prototype.forEach.call(app.querySelectorAll(".row"), function (el) {
      el.onclick = function () { go({ view: "vault", id: el.getAttribute("data-id") }); };
    });
  }

  function renderVault(id) {
    var v = findVault(id);
    if (!v) return back();
    var html = "<button class=\"back\" id=\"bk\">‹ Vaults</button><h2>" + esc(v.name) + "</h2><div class=\"list\">";
    v.docs.forEach(function (d) {
      html += "<button class=\"row\" data-id=\"" + esc(d.id) + "\"><div class=\"thumb\" data-thumb=\"" + (d.thumb ? esc(d.id) : "") + "\">" +
        (/pdf/i.test(d.mimeType) ? "PDF" : "IMG") + "</div><div class=\"meta\"><div class=\"name\">" + esc(d.name) +
        "</div><div class=\"small\">" + esc(dateOnly(d.createdAt)) + (d.saved ? "" : " · not saved offline") + "</div></div></button>";
    });
    if (!v.docs.length) html += "<div class=\"empty\">No documents in this vault.</div>";
    app.innerHTML = html + "</div>";
    document.getElementById("bk").onclick = function () { history.back(); };
    Array.prototype.forEach.call(app.querySelectorAll(".row"), function (el) {
      el.onclick = function () { go({ view: "doc", vault: id, id: el.getAttribute("data-id") }); };
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-thumb]"), function (el) {
      var docId = el.getAttribute("data-thumb");
      if (!docId) return;
      openRecord("thumb:" + docId).then(function (buf) {
        if (!buf || !el.isConnected) return;
        var img = document.createElement("img");
        img.className = "thumb"; img.alt = ""; img.src = blobUrl(buf, "image/jpeg");
        el.replaceWith(img);
      }).catch(function () {});
    });
  }

  function renderDoc(vaultId, id) {
    var v = findVault(vaultId);
    var d = null;
    if (v) v.docs.forEach(function (x) { if (x.id === id) d = x; });
    if (!d) return back();
    var html = "<button class=\"back\" id=\"bk\">‹ " + esc(v.name) + "</button><h2>" + esc(d.name) + "</h2>" +
      "<div class=\"viewer\" id=\"viewer\">" + (d.saved ? "<div class=\"empty\">Opening...</div>" :
      "<div class=\"empty\">This document was not saved offline.</div>") + "</div>";
    var rows = "";
    (v.fields || []).forEach(function (f) {
      var val = d.metadata ? d.metadata[f.key] : "";
      if (val == null || val === "") return;
      var shown = f.type === "date" ? dateOnly(val) : String(val);
      rows += "<div class=\"field\"><span class=\"k\">" + esc(f.label) + "</span><span class=\"v\">" +
        (sensitive(f) ? "<button class=\"reveal\" data-v=\"" + esc(shown) + "\">•••••• Show</button>" : esc(shown)) + "</span></div>";
    });
    if (d.expiryDate) rows += "<div class=\"field\"><span class=\"k\">Expires</span><span class=\"v\">" + esc(dateOnly(d.expiryDate)) + "</span></div>";
    if (rows) html += "<div class=\"fields\">" + rows + "</div>";
    app.innerHTML = html;
    document.getElementById("bk").onclick = function () { history.back(); };
    Array.prototype.forEach.call(app.querySelectorAll(".reveal"), function (el) {
      el.onclick = function () { var t = document.createElement("span"); t.textContent = el.getAttribute("data-v"); el.replaceWith(t); };
    });
    if (!d.saved) return;
    openRecord("file:" + d.id).then(function (buf) {
      var box = document.getElementById("viewer");
      if (!box) return;
      if (!buf) { box.innerHTML = "<div class=\"empty\">This document was not saved offline.</div>"; return; }
      var u = blobUrl(buf, d.mimeType);
      if (/pdf/i.test(d.mimeType)) {
        box.innerHTML = "<iframe title=\"" + esc(d.name) + "\" src=\"" + u + "\"></iframe><a class=\"open\" href=\"" + u + "\" target=\"_blank\" rel=\"noopener\">Open full screen</a>";
      } else {
        box.innerHTML = "<img alt=\"" + esc(d.name) + "\" src=\"" + u + "\">";
      }
    }).catch(function () {
      var box = document.getElementById("viewer");
      if (box) box.innerHTML = "<div class=\"empty\">Could not open this document.</div>";
    });
  }

  // ------------------------------------------------------------ start
  function start() {
    if (!window.indexedDB || !window.crypto || !crypto.subtle) {
      showMessage("Offline vault unavailable", "This browser cannot open the offline copy.");
      return;
    }
    get("meta", "keyring").then(function (kr) {
      if (!kr) {
        showMessage("No offline copy yet", "Open LockonDocs once with a connection to save your vault on this phone.");
        return;
      }
      showLock(kr);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
        checkOnline();
        if (priv && hiddenAt && Date.now() - hiddenAt >= RELOCK_MS) showLock(kr);
        hiddenAt = 0;
      });
    }).catch(function () {
      showMessage("Offline vault unavailable", "The offline copy could not be read.");
    });
    window.addEventListener("online", checkOnline);
    window.addEventListener("offline", checkOnline);
    checkOnline();
    setInterval(checkOnline, 30000);
  }
  start();
})();
