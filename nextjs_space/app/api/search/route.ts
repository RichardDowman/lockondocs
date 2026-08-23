export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

// GET /api/search?q=term&sort=date_desc|date_asc|name_asc|name_desc&folderId=optional
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const sort = (searchParams.get("sort") ?? "date_desc").trim();
    const folderId = (searchParams.get("folderId") ?? "").trim();

    let orderBy: any = { createdAt: "desc" };
    if (sort === "date_asc") orderBy = { createdAt: "asc" };
    else if (sort === "name_asc") orderBy = { name: "asc" };
    else if (sort === "name_desc") orderBy = { name: "desc" };

    const where: any = { userId };
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }
    if (folderId) {
      where.folderId = folderId;
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy,
      take: 100,
      include: { folder: { select: { id: true, name: true } } },
    });

    const docs = await Promise.all(
      (documents ?? []).map(async (d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        folderId: d?.folder?.id ?? "",
        folderName: d?.folder?.name ?? "",
        createdAt: d.createdAt,
        url: await getFileUrl(d.cloudStoragePath, d.mimeType, d.isPublic),
      })),
    );

    return NextResponse.json({ documents: docs });
  } catch (err: any) {
    console.error("Search GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
