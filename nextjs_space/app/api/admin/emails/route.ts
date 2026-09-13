export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";
import { resolveRange, createdAtFilter, toCsv } from "@/lib/admin-range";

// GET /api/admin/emails
// Paginated log of transactional emails the app has sent, newest first, with
// optional search (recipient or subject), type filter, status filter and date
// range. Supports ?format=csv for export. Admin-gated.
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = (searchParams.get("type") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim();
    const format = (searchParams.get("format") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number(searchParams.get("pageSize") ?? "25") || 25),
    );
    const range = resolveRange(searchParams);
    const createdAt = createdAtFilter(range);

    const where: Prisma.EmailLogWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (createdAt) where.createdAt = createdAt;
    if (q) {
      const contains = { contains: q, mode: "insensitive" as const };
      where.OR = [{ recipientEmail: contains }, { subject: contains }];
    }

    // Distinct types present, for the filter dropdown.
    const typeRows = await prisma.emailLog.findMany({
      distinct: ["type"],
      select: { type: true },
      orderBy: { type: "asc" },
    });
    const types = typeRows.map((r) => r.type);

    const total = await prisma.emailLog.count({ where });

    const logs = await prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(format === "csv"
        ? {}
        : { skip: (page - 1) * pageSize, take: pageSize }),
      select: {
        id: true,
        recipientEmail: true,
        type: true,
        subject: true,
        preview: true,
        status: true,
        error: true,
        documentId: true,
        createdAt: true,
      },
    });

    if (format === "csv") {
      const csv = toCsv(
        ["Recipient", "Type", "Subject", "Preview", "Status", "When"],
        logs.map((l) => [
          l.recipientEmail,
          l.type,
          l.subject,
          l.preview ?? "",
          l.status,
          new Date(l.createdAt).toISOString(),
        ]),
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lockondocs-emails-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        recipientEmail: l.recipientEmail,
        type: l.type,
        subject: l.subject,
        preview: l.preview ?? "",
        status: l.status,
        error: l.error ?? "",
        documentId: l.documentId ?? "",
        createdAt: l.createdAt,
      })),
      types,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err: any) {
    console.error("Admin emails GET error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to load emails." },
      { status: 500 },
    );
  }
}
