export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Ingest endpoint for the scheduled backup jobs (weekly GitHub push, daily
// storage verification). Authenticated with a shared secret so the jobs can
// record their outcome without direct database access or an admin session.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.BACKUP_INGEST_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Ingest not configured" },
        { status: 503 },
      );
    }

    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (type !== "github" && type !== "storage") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (status !== "success" && status !== "failed") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const message =
      typeof body?.message === "string" ? body.message.slice(0, 1000) : null;
    const meta =
      body?.meta && typeof body.meta === "object" ? body.meta : undefined;

    const entry = await prisma.backupLog.create({
      data: { type, status, message, meta },
    });

    return NextResponse.json({ ok: true, id: entry.id });
  } catch (err) {
    console.error("POST /api/backups/ingest failed:", err);
    return NextResponse.json(
      { error: "Failed to record backup" },
      { status: 500 },
    );
  }
}
