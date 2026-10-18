// Run against the preview server only: yarn tsx --require dotenv/config scripts/test-sharing.ts
// Disposable fixtures only. Never prints credentials, cookies, tokens, or storage URLs.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import jwt from "jsonwebtoken";
import { jsPDF } from "jspdf";
import { prisma } from "../lib/db";
import { generatePresignedUploadUrl, deleteFile } from "../lib/s3";
import { digest, recordShareAccess } from "../lib/sharing";

const base = "http://localhost:3000";
let checks = 0;
const users: string[] = [];
const paths: string[] = [];
const password = randomBytes(24).toString("base64url");
const passcode = randomBytes(16).toString("hex");
function ok(condition: unknown, label: string) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
async function call(path: string, method = "GET", body?: unknown, cookie?: string, origin = base) {
  const headers: Record<string, string> = { origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}
async function fixture() {
  const user = await prisma.user.create({ data: { email: `sharing-test-${randomBytes(10).toString("hex")}@example.invalid`, password: await bcrypt.hash(password, 12), name: "Sharing test", emailVerified: new Date() } });
  users.push(user.id);
  const folder = await prisma.folder.create({ data: { userId: user.id, name: "Sharing test" } });
  const session = await encode({ token: { id: user.id, email: user.email }, secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600 });
  return { user, folder, cookie: `next-auth.session-token=${session}` };
}
async function main() {
  const owner = await fixture(); const other = await fixture();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const pdf = new jsPDF(); pdf.text("LockonDocs sharing test - no personal data", 10, 20);
  const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
  async function documentFor(bytes: Buffer, mime: string, ext: string) {
    const upload = await generatePresignedUploadUrl(`${owner.user.id}-sharing-test-${randomBytes(8).toString("hex")}.${ext}`, mime, false);
    paths.push(upload.cloud_storage_path);
    const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": mime, "x-amz-server-side-encryption": "AES256" }, body: new Uint8Array(bytes) });
    assert.equal(put.status, 200, "Fixture storage upload");
    return prisma.document.create({ data: { userId: owner.user.id, folderId: owner.folder.id, name: "PRIVATE FILENAME NOT FOR RECIPIENT", metadata: { confidential: "PRIVATE METADATA NOT FOR RECIPIENT" }, cloudStoragePath: upload.cloud_storage_path, mimeType: mime, fileSize: bytes.length } });
  }
  const doc = await documentFor(png, "image/png", "png"); const pdfDoc = await documentFor(pdfBytes, "application/pdf", "pdf");
  const body = { documentId: doc.id, password, passcode };
  ok((await call("/api/shares")).status === 401, "Owner list requires login");
  ok((await call("/api/shares", "POST", body)).status === 401, "Creation requires login");
  ok((await call("/api/shares", "POST", body, other.cookie)).status === 404, "Cannot share another owner's document");
  ok((await call("/api/shares", "POST", body, owner.cookie, "https://example.invalid")).status === 403, "Cross-origin creation blocked");
  ok((await call("/api/shares", "POST", { ...body, password: undefined }, owner.cookie)).status === 400, "Password confirmation required on server");
  ok((await call("/api/shares", "POST", { ...body, password: "incorrect" }, owner.cookie)).status === 401, "Wrong owner password denied");
  ok((await call("/api/shares", "POST", { ...body, passcode: "123" }, owner.cookie)).status === 400, "Weak passcode rejected");
  ok((await call("/api/shares", "POST", { ...body, hours: 169 }, owner.cookie)).status === 400, "Expiry above seven days rejected");
  ok((await call("/api/shares", "POST", { ...body, allowDownload: "true" }, owner.cookie)).status === 400, "Download option strictly validated");
  let res = await call("/api/shares", "POST", body, owner.cookie);
  ok(res.status === 201, "Owner creates share"); const share = await res.json();
  const row = await prisma.documentShare.findUniqueOrThrow({ where: { id: share.id } });
  ok(row.tokenHash === digest(share.token) && row.passcodeHash !== passcode && await bcrypt.compare(passcode, row.passcodeHash), "Only hashed link and passcode stored");
  ok(!row.allowDownload && Math.abs(row.expiresAt.getTime() - Date.now() - 86400000) < 10000, "Default 24-hour expiry and downloads off");
  const list = await (await call("/api/shares", "GET", undefined, owner.cookie)).json();
  ok(list.shares.length === 1 && !JSON.stringify(list).includes(share.token) && !JSON.stringify(list).includes(row.passcodeHash), "Owner list includes share without credentials");
  ok((await (await call("/api/shares", "GET", undefined, other.cookie)).json()).shares.length === 0, "Owner list isolated");
  for (const [value, label] of [["a".repeat(11), "Too short"], ["a".repeat(65), "Too long"], [" " + passcode, "Leading space"], [passcode + " ", "Trailing space"], [passcode + "\n", "Control character"], ["é".repeat(37), "Above bcrypt byte limit"], [password, "Account password reuse"]]) {
    ok((await call("/api/shares", "POST", { ...body, passcode: value }, owner.cookie)).status === 400, `${label} rejected for custom password`);
  }
  for (const value of ["Custom " + randomBytes(8).toString("hex") + " !?", "Café " + randomBytes(8).toString("hex") + " 🔒", randomBytes(32).toString("hex"), "é".repeat(28) + randomBytes(8).toString("hex")]) {
    // Isolate policy cases from the intentional five-check owner throttle.
    await prisma.user.update({ where: { id: owner.user.id }, data: { shareAuthAttempts: 0, shareAuthWindow: new Date() } });
    const made = await call("/api/shares", "POST", { ...body, passcode: value }, owner.cookie);
    ok(made.status === 201, "Custom password accepted including symbols, Unicode, or maximum length");
    const custom = await made.json();
    const saved = await prisma.documentShare.findUniqueOrThrow({ where: { id: custom.id } });
    ok(saved.passcodeHash !== value && await bcrypt.compare(value, saved.passcodeHash), "Custom password stored only as a hash");
    ok((await call("/api/shared/unlock", "POST", { token: custom.token, passcode: value })).status === 200, "Custom password unlocks without an account");
    ok((await call("/api/shared/unlock", "POST", { token: custom.token, passcode: "Wrong " + value })).status === 401, "Changed custom password denied");
  }
  ok((await call(`/api/shares/${share.id}`, "GET", undefined, other.cookie)).status === 404, "Foreign history denied");
  ok((await call(`/api/shares/${share.id}`, "DELETE", undefined, other.cookie)).status === 404, "Foreign revocation denied");
  ok((await call(`/api/shared/file?id=${share.id}`)).status === 401, "File requires recipient session");
  ok((await call(`/api/files/${doc.id}`)).status === 401, "Owner file route remains private");
  ok((await call(`/api/files/${doc.id}`, "GET", undefined, other.cookie)).status === 404, "Owner file route still enforces isolation");
  ok((await call("/api/shared/unlock", "POST", { token: share.token, passcode: "incorrect" })).status === 401, "Wrong recipient passcode denied");
  ok((await call("/api/shared/unlock", "POST", { token: share.token, passcode }, undefined, "https://example.invalid")).status === 403, "Cross-origin unlock blocked");
  res = await call("/api/shared/unlock", "POST", { token: share.token, passcode });
  ok(res.status === 200, "Recipient unlocks without account"); const access = await res.json();
  const cookieHeader = res.headers.get("set-cookie")!; const recipient = cookieHeader.split(";")[0];
  ok(/httponly/i.test(cookieHeader) && /samesite=strict/i.test(cookieHeader) && /path=\/api\/shared/i.test(cookieHeader), "Recipient cookie is HttpOnly and scoped");
  ok(Object.keys(access).sort().join(",") === "allowDownload,expiresAt,id,mimeType,sessionExpiresAt", "Recipient response omits saved metadata and owner identity");
  res = await call(`/api/shared/file?id=${share.id}`, "GET", undefined, recipient);
  ok(res.status === 200 && Buffer.from(await res.arrayBuffer()).equals(png), "Recipient image bytes delivered");
  ok(res.headers.get("cache-control")?.includes("no-store") && res.headers.get("referrer-policy") === "no-referrer" && res.headers.get("x-content-type-options") === "nosniff", "Private file response security headers");
  ok(!res.headers.get("location") && !res.headers.get("content-disposition")?.includes(doc.name), "No storage URL or owner filename exposed");
  ok((await call(`/api/shared/file?id=${share.id}&download=1`, "GET", undefined, recipient)).status === 403, "Downloads blocked by server when disabled");
  res = await call("/api/shares", "POST", { ...body, documentId: pdfDoc.id, hours: 168, allowDownload: true }, owner.cookie);
  ok(res.status === 201, "PDF share created with seven-day expiry and downloads"); const pdfShare = await res.json();
  ok((await call(`/api/shared/file?id=${pdfShare.id}`, "GET", undefined, recipient)).status === 401, "Recipient session cannot access another share");
  res = await call("/api/shared/unlock", "POST", { token: pdfShare.token, passcode }); const pdfCookie = res.headers.get("set-cookie")!.split(";")[0];
  res = await call(`/api/shared/file?id=${pdfShare.id}`, "GET", undefined, pdfCookie);
  ok(res.status === 200 && Buffer.from(await res.arrayBuffer()).equals(pdfBytes), "PDF preview bytes delivered");
  res = await call(`/api/shared/file?id=${pdfShare.id}&download=1`, "GET", undefined, pdfCookie);
  ok(res.status === 200 && res.headers.get("content-disposition")?.startsWith("attachment") && Buffer.from(await res.arrayBuffer()).equals(pdfBytes), "Allowed PDF download is attachment");
  const history = await (await call(`/api/shares/${pdfShare.id}`, "GET", undefined, owner.cookie)).json();
  ok(history.events.some((e: any) => e.action === "view") && history.events.some((e: any) => e.action === "download"), "Owner access history records views and downloads");
  const expiredJwt = jwt.sign({ sid: share.id, exp: Math.floor(Date.now()/1000)-1 }, process.env.NEXTAUTH_SECRET!, { audience: "document-share", issuer: "lockondocs" });
  ok((await call(`/api/shared/file?id=${share.id}`, "GET", undefined, `ld_share_${share.id}=${expiredJwt}`)).status === 401, "Expired recipient session denied");
  ok((await call(`/api/shared/file?id=${share.id}`, "GET", undefined, recipient + "tampered")).status === 401, "Tampered recipient session denied");
  await prisma.documentShare.update({ where: { id: share.id }, data: { attemptCount: 0, attemptWindow: new Date() } });
  const attempts = await Promise.all(Array.from({ length: 12 }, () => call("/api/shared/unlock", "POST", { token: share.token, passcode: "incorrect" })));
  ok(attempts.filter((r) => r.status === 401).length === 10 && attempts.filter((r) => r.status === 429).length === 2, "Concurrent guessing capped at ten attempts");
  ok((await call(`/api/shares/${share.id}`, "DELETE", undefined, owner.cookie)).status === 200, "Owner revokes share");
  ok((await call(`/api/shared/file?id=${share.id}`, "GET", undefined, recipient)).status === 410, "Revocation blocks existing recipient session");
  ok((await call("/api/shared/unlock", "POST", { token: share.token, passcode })).status === 410, "Revocation blocks fresh unlock");
  await prisma.user.update({ where: { id: owner.user.id }, data: { suspendedAt: new Date() } });
  ok((await call(`/api/shared/file?id=${pdfShare.id}`, "GET", undefined, pdfCookie)).status === 410, "Owner suspension blocks recipient access");
  ok((await call("/api/shares", "GET", undefined, owner.cookie)).status === 403, "Suspended owner cannot manage shares");
  await prisma.user.update({ where: { id: owner.user.id }, data: { suspendedAt: null } });
  await prisma.documentShare.update({ where: { id: pdfShare.id }, data: { expiresAt: new Date(Date.now()-1000) } });
  ok((await call(`/api/shared/file?id=${pdfShare.id}`, "GET", undefined, pdfCookie)).status === 410, "Link expiry blocks existing recipient session");
  ok((await call("/api/shared/unlock", "POST", { token: pdfShare.token, passcode })).status === 410, "Expired link cannot unlock");
  await prisma.documentShare.update({ where: { id: pdfShare.id }, data: { expiresAt: new Date(Date.now()+3600000) } });
  for (let i = 0; i < 102; i++) await recordShareAccess(pdfShare.id, "view");
  ok(await prisma.shareAccess.count({ where: { shareId: pdfShare.id } }) === 100, "Access history retention bounded at 100 events");
  await prisma.user.update({ where: { id: owner.user.id }, data: { shareAuthAttempts: 5, shareAuthWindow: new Date() } });
  ok((await call("/api/shares", "POST", body, owner.cookie)).status === 429, "Owner password attempts are rate limited");
  await prisma.document.delete({ where: { id: pdfDoc.id } });
  ok((await call(`/api/shared/file?id=${pdfShare.id}`, "GET", undefined, pdfCookie)).status === 410 && await prisma.documentShare.count({ where: { id: pdfShare.id } }) === 0, "Deleting document invalidates and cascades its shares");
  res = await call("/share");
  ok(res.status === 200 && res.headers.get("x-robots-tag")?.includes("noindex") && !res.headers.has("x-frame-options"), "Public recipient page requires no login and permits iframe use");
  console.log(`Sharing integration checks passed: ${checks}`);
}
main().catch((e) => { console.error("SHARING TEST FAILED:", e instanceof Error ? e.message : "Unknown error"); process.exitCode = 1; }).finally(async () => {
  for (const path of paths) await deleteFile(path);
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users }, email: { endsWith: "@example.invalid" } } });
  console.log("Disposable sharing fixtures cleaned up.");
  await prisma.$disconnect();
});
