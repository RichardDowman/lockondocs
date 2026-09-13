// One-time backfill: give every existing vault a tailored (default) or generic
// (custom) field set where it does not already have one. Additive and safe to
// re-run; it never overwrites a vault that already has fields.
import { prisma } from "../lib/db";
import {
  getDefaultFieldsFor,
  getGenericFields,
  coerceFieldDefs,
} from "../lib/vault-fields";

async function main() {
  const folders = await prisma.folder.findMany({
    select: { id: true, name: true, isDefault: true, fields: true },
  });
  let updated = 0;
  let skipped = 0;
  for (const f of folders) {
    const existing = coerceFieldDefs(f.fields);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    const fields = f.isDefault ? getDefaultFieldsFor(f.name) : getGenericFields();
    await prisma.folder.update({
      where: { id: f.id },
      data: { fields: fields as any },
    });
    updated++;
  }
  console.log(`Backfill complete. Updated ${updated}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
