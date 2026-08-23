export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";
import { prisma } from "@/lib/db";
import { isAllowedUploadType, MAX_UPLOAD_BYTES } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const fileName = (body?.fileName ?? "scan.jpg").toString();
    const contentType = (body?.contentType ?? "image/jpeg").toString();
    const fileSize = Number(body?.fileSize ?? 0) || 0;

    // Server-side validation: reject unsupported types and oversized files.
    if (!isAllowedUploadType(contentType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload an image or PDF." },
        { status: 400 },
      );
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File is too large. The maximum size is 25 MB." },
        { status: 400 },
      );
    }

    // Enforce the user's storage quota before issuing an upload URL.
    if (fileSize > 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { storageUsed: true, storageLimit: true },
      });
      if (user) {
        const projected = BigInt(user.storageUsed ?? BigInt(0)) + BigInt(fileSize);
        if (projected > BigInt(user.storageLimit ?? BigInt(0))) {
          return NextResponse.json(
            { error: "Storage limit reached. Please free up space and try again." },
            { status: 413 },
          );
        }
      }
    }

    // Documents are personal and sensitive: always private (signed URLs).
    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      `${userId}-${fileName}`,
      contentType,
      false,
    );

    return NextResponse.json({ uploadUrl, cloud_storage_path });
  } catch (err: any) {
    console.error("Presigned upload error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to prepare upload." },
      { status: 500 },
    );
  }
}
