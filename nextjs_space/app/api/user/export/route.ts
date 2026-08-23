export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, getClientIp } from "@/lib/audit";

// CCPA/CPRA "download my data": returns a self-contained, human-readable HTML
// report of the user's account, folders and documents. Document links point at
// the app's own branded domain (never the underlying storage host).

function escapeHtml(value: string): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

function mimeLabel(mimeType: string): string {
  switch ((mimeType || "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "Image (JPEG)";
    case "image/png":
      return "Image (PNG)";
    case "image/webp":
      return "Image (WebP)";
    case "image/heic":
    case "image/heif":
      return "Image (HEIC)";
    case "application/pdf":
      return "PDF document";
    default:
      return mimeType || "File";
  }
}

// Builds the absolute origin from the incoming request so links always match
// whichever host the user is on (branded on the custom domain).
function getOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    (process.env.NEXTAUTH_URL || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        storageUsed: true,
        storageLimit: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const [folders, documents] = await Promise.all([
      prisma.folder.findMany({
        where: { userId },
        select: { id: true, name: true, isDefault: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.document.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          folderId: true,
          mimeType: true,
          fileSize: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    await recordAudit({
      userId,
      action: "user.data_export",
      detail: `Exported ${documents.length} documents across ${folders.length} vaults`,
      ip: getClientIp(req),
    });

    const origin = getOrigin(req);
    const storageUsed = Number(user.storageUsed ?? BigInt(0));
    const storageLimit = Number(user.storageLimit ?? BigInt(0));

    // Group documents by folder, with an "Other" bucket for anything unmatched.
    const byFolder = new Map<string, typeof documents>();
    for (const d of documents) {
      const key = d.folderId ?? "__none__";
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(d);
    }

    const folderSections = folders.map((f) => {
      const docs = byFolder.get(f.id) ?? [];
      byFolder.delete(f.id);
      return { name: f.name, isDefault: f.isDefault, docs };
    });
    const orphanDocs = byFolder.get("__none__") ?? [];
    if (orphanDocs.length) {
      folderSections.push({ name: "Other", isDefault: false, docs: orphanDocs });
    }

    function docRows(docs: typeof documents): string {
      if (!docs.length) {
        return `<tr><td colspan="4" class="empty">No documents in this vault.</td></tr>`;
      }
      return docs
        .map(
          (d) => `
            <tr>
              <td>${escapeHtml(d.name)}</td>
              <td>${escapeHtml(mimeLabel(d.mimeType))}</td>
              <td class="num">${formatBytes(Number(d.fileSize ?? 0))}</td>
              <td>${formatDate(d.createdAt)}</td>
              <td><a class="dl" href="${origin}/api/files/${d.id}">Download</a></td>
            </tr>`,
        )
        .join("");
    }

    const foldersHtml = folderSections
      .map(
        (f) => `
        <section class="folder">
          <h3>${escapeHtml(f.name)}${f.isDefault ? '<span class="tag">Default</span>' : ""}
            <span class="count">${f.docs.length} document${f.docs.length === 1 ? "" : "s"}</span>
          </h3>
          <table>
            <thead>
              <tr><th>Document</th><th>Type</th><th class="num">Size</th><th>Date added</th><th>File</th></tr>
            </thead>
            <tbody>${docRows(f.docs)}</tbody>
          </table>
        </section>`,
      )
      .join("");

    const generatedAt = formatDate(new Date());

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LockonDocs data export</title>
<style>
  :root { --primary: #c8a44d; --ink: #1f2430; --muted: #6b7280; --line: #e6e8ee; --bg: #f6f7f9; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 24px 18px 56px; }
  header.brand { display: flex; align-items: center; gap: 12px; padding: 20px 0 16px; border-bottom: 3px solid var(--primary); }
  .logo { width: 40px; height: 40px; border-radius: 10px; background: var(--primary); color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
  header.brand h1 { margin: 0; font-size: 22px; letter-spacing: 0.2px; }
  header.brand p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .note { background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--primary);
    border-radius: 10px; padding: 14px 16px; margin: 20px 0; font-size: 14px; color: var(--ink); }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted);
    margin: 32px 0 12px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 4px 18px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .row:last-child { border-bottom: none; }
  .row .k { color: var(--muted); }
  .row .v { font-weight: 600; text-align: right; word-break: break-word; }
  .summary { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .stat { flex: 1 1 140px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  .stat .n { font-size: 24px; font-weight: 700; color: var(--primary); }
  .stat .l { font-size: 13px; color: var(--muted); margin-top: 2px; }
  section.folder { margin-top: 18px; }
  section.folder h3 { font-size: 16px; margin: 0 0 8px; display: flex; align-items: center; gap: 10px; }
  section.folder h3 .tag { font-size: 11px; font-weight: 600; color: var(--primary); border: 1px solid var(--primary);
    border-radius: 999px; padding: 1px 8px; text-transform: uppercase; letter-spacing: 0.4px; }
  section.folder h3 .count { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: 14px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: #fafbfc; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted); }
  tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.empty { color: var(--muted); font-style: italic; }
  a.dl { color: var(--primary); font-weight: 600; text-decoration: none; white-space: nowrap; }
  a.dl:hover { text-decoration: underline; }
  footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <div class="logo">LD</div>
      <div>
        <h1>LockonDocs data export</h1>
        <p>Generated ${generatedAt}</p>
      </div>
    </header>

    <div class="note">
      This is a copy of your account information and the documents you have stored.
      To download a file, open this page while signed in to LockonDocs and select the
      Download link next to it. Download links open securely inside your account and
      only work for you.
    </div>

    <h2>Account</h2>
    <div class="card">
      <div class="row"><span class="k">Name</span><span class="v">${escapeHtml(user.name ?? "-")}</span></div>
      <div class="row"><span class="k">Email</span><span class="v">${escapeHtml(user.email ?? "-")}</span></div>
      <div class="row"><span class="k">Email verified</span><span class="v">${user.emailVerified ? "Yes" : "No"}</span></div>
      <div class="row"><span class="k">Member since</span><span class="v">${formatDate(user.createdAt)}</span></div>
      <div class="row"><span class="k">Storage used</span><span class="v">${formatBytes(storageUsed)} of ${formatBytes(storageLimit)}</span></div>
    </div>

    <h2>Summary</h2>
    <div class="summary">
      <div class="stat"><div class="n">${folders.length}</div><div class="l">Vault${folders.length === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="n">${documents.length}</div><div class="l">Document${documents.length === 1 ? "" : "s"}</div></div>
      <div class="stat"><div class="n">${formatBytes(storageUsed)}</div><div class="l">Total size</div></div>
    </div>

    <h2>Your documents</h2>
    ${foldersHtml || '<div class="card"><div class="row"><span class="k">No documents stored yet.</span></div></div>'}

    <footer>
      LockonDocs - your private document vault. This export was generated for your
      records at your request. Keep it somewhere safe, as it lists your stored documents.
    </footer>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="lockondocs-export-${Date.now()}.html"`,
      },
    });
  } catch (err: any) {
    console.error("User export error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to export your data." }, { status: 500 });
  }
}
