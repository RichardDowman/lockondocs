// Preview-only browser validation. Credentials stay in memory and are passed over stdin.
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { jsPDF } from "jspdf";
import { prisma } from "../lib/db";
import { generatePresignedUploadUrl, deleteFile } from "../lib/s3";

const paths: string[] = [];
let userId: string | undefined;
async function main() {
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({ data: { email: `sharing-ui-${randomBytes(10).toString("hex")}@example.invalid`, password: await bcrypt.hash(password, 12), name: "Sharing browser test", emailVerified: new Date(), autoLockMinutes: 0 } });
  userId = user.id;
  const folder = await prisma.folder.create({ data: { userId: user.id, name: "Sharing browser test" } });
  const png = execFileSync("python3", ["-c", "from PIL import Image,ImageDraw; import sys; im=Image.new('RGB',(600,800),'white'); d=ImageDraw.Draw(im); d.rectangle((30,30,570,770),outline='black',width=3); d.text((60,100),'LockonDocs sharing test - no personal data',fill='black'); im.save(sys.stdout.buffer,format='PNG')"]);
  const pdf = new jsPDF(); pdf.text("LockonDocs sharing test - no personal data", 10, 20);
  async function makeDoc(bytes: Buffer, mimeType: string, ext: string) {
    const upload = await generatePresignedUploadUrl(`${user.id}-sharing-test-${randomBytes(8).toString("hex")}.${ext}`, mimeType, false);
    paths.push(upload.cloud_storage_path);
    const res = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType, "x-amz-server-side-encryption": "AES256" }, body: new Uint8Array(bytes) });
    if (!res.ok) throw new Error("Fixture upload failed");
    return prisma.document.create({ data: { userId: user.id, folderId: folder.id, name: `Private test ${ext}`, metadata: { confidential: "PRIVATE METADATA NOT FOR RECIPIENT" }, cloudStoragePath: upload.cloud_storage_path, mimeType, fileSize: bytes.length } });
  }
  const image = await makeDoc(png, "image/png", "png");
  const pdfDoc = await makeDoc(Buffer.from(pdf.output("arraybuffer")), "application/pdf", "pdf");
  const session = await encode({ token: { id: user.id, email: user.email }, secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600 });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", [process.argv.includes("--passwords") ? "scripts/test-share-passwords-browser.py" : "scripts/test-sharing-browser.py"], { stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.end(JSON.stringify({ session, password, imageId: image.id, pdfId: pdfDoc.id }));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Browser validation failed")));
  });
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Browser validation failed"); process.exitCode = 1; }).finally(async () => {
  for (const path of paths) await deleteFile(path);
  if (userId) {
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId, email: { endsWith: "@example.invalid" } } });
  }
  console.log("Disposable browser fixtures cleaned up.");
  await prisma.$disconnect();
});
