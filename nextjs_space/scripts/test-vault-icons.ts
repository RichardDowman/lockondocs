// Preview-only fixture. No existing user records or cloud files are modified.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import { DEFAULT_FOLDERS } from "../lib/default-folders";
import { VAULT_ICON_LIBRARY } from "../lib/vault-icon-library";

let userId: string | undefined;
async function main() {
  if (DEFAULT_FOLDERS.length !== 10 || VAULT_ICON_LIBRARY.length !== 40 || new Set(VAULT_ICON_LIBRARY.map((i) => i.id)).size !== 40) throw new Error("Unexpected catalog size");
  const user = await prisma.user.create({ data: { email: `icon-test-${randomBytes(12).toString("hex")}@example.invalid`, name: "Icon test", password: await bcrypt.hash(randomBytes(24).toString("base64url"), 12), autoLockMinutes: 0, folders: { create: DEFAULT_FOLDERS.map((f) => ({ ...f, isDefault: true })) } } });
  userId = user.id;
  const session = await encode({ token: { id: user.id, email: user.email }, secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600 });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", ["scripts/test-vault-icons.py"], { stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.end(JSON.stringify({ session }));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Icon browser check failed")));
  });
  const folders = await prisma.folder.findMany({ where: { userId }, select: { name: true, icon: true, isDefault: true } });
  if (folders.length !== 11 || folders.filter((f) => f.isDefault).length !== 10 || !folders.some((f) => !f.isDefault && f.name === "Pet records" && f.icon === "library-27")) throw new Error("Folder persistence mismatch");
  for (const expected of DEFAULT_FOLDERS) if (!folders.some((f) => f.isDefault && f.name === expected.name && f.icon === expected.icon)) throw new Error("Default changed");
  console.log("PASS: selected custom icon persisted; all 10 defaults retain their original names and icons.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "Icon check failed"); process.exitCode = 1; }).finally(async () => {
  if (userId) await prisma.user.deleteMany({ where: { id: userId, email: { startsWith: "icon-test-", endsWith: "@example.invalid" } } });
  await prisma.$disconnect();
  console.log("Disposable icon fixture cleaned up.");
});
