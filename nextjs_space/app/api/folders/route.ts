export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGenericFields, coerceFieldDefs } from "@/lib/vault-fields";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const folders = await prisma.folder.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { documents: true } } },
    });

    const result = (folders ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      icon: f.icon,
      isDefault: f.isDefault,
      fields: coerceFieldDefs(f.fields),
      documentCount: f?._count?.documents ?? 0,
      createdAt: f.createdAt,
    }));

    return NextResponse.json({ folders: result });
  } catch (err: any) {
    console.error("Folders GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load vaults." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").toString().trim();
    const icon = (body?.icon ?? "folder").toString().trim() || "folder";

    if (!name) {
      return NextResponse.json({ error: "Vault name is required." }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ error: "Vault name is too long." }, { status: 400 });
    }

    // Custom vaults start with a sensible generic field set which the owner can
    // fully customise later with the field builder.
    const folder = await prisma.folder.create({
      data: { userId, name, icon, isDefault: false, fields: getGenericFields() as any },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (err: any) {
    console.error("Folders POST error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to create vault." }, { status: 500 });
  }
}
