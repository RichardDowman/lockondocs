import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_FOLDERS } from "../lib/default-folders";

const prisma = new PrismaClient();

async function ensureUserWithFolders(
  email: string,
  name: string,
  password: string,
  isAdmin: boolean,
  isSuperAdmin: boolean = false,
) {
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, isAdmin, isSuperAdmin },
    create: { email, name, password: hashed, isAdmin, isSuperAdmin },
  });

  const existing = await prisma.folder.count({ where: { userId: user.id } });
  if (existing === 0) {
    await prisma.folder.createMany({
      data: DEFAULT_FOLDERS.map((f) => ({
        userId: user.id,
        name: f.name,
        icon: f.icon,
        isDefault: true,
      })),
    });
  }
  return user;
}

async function main() {
  await ensureUserWithFolders(
    "john@doe.com",
    "John Doe",
    "johndoe123",
    true,
  );
  await ensureUserWithFolders(
    "admin@lockondocs.com",
    "LockonDocs Admin",
    "LockDocsAdmin26!",
    true,
    true,
  );
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
