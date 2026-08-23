export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";
import { resolveRange, createdAtFilter, toCsv } from "@/lib/admin-range";

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();
    const format = (searchParams.get("format") ?? "").trim();
    const range = resolveRange(searchParams);
    const createdAt = createdAtFilter(range);

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (createdAt) where.createdAt = createdAt;
    if (q) {
      where.OR = [
        { detail: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: format === "csv" ? 5000 : 200,
      include: { user: { select: { email: true } } },
    });

    const mapped = logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail ?? "",
      ip: l.ip ?? "",
      email: l.user?.email ?? "",
      createdAt: l.createdAt,
    }));

    if (format === "csv") {
      const csv = toCsv(
        ["Timestamp", "Action", "User", "Detail", "IP"],
        mapped.map((l) => [
          new Date(l.createdAt).toISOString(),
          l.action,
          l.email,
          l.detail,
          l.ip,
        ]),
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lockondocs-audit-${Date.now()}.csv"`,
        },
      });
    }

    // Distinct action list for the filter dropdown.
    const actionsRaw = await prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });

    return NextResponse.json({
      logs: mapped,
      actions: actionsRaw.map((a) => a.action),
    });
  } catch (err: any) {
    console.error("Admin audit GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }
}
