import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

import prisma from "../src/lib/prisma.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const organizationName = process.env.ADMIN_ORGANIZATION_NAME?.trim() || "Saját CRM";
const configuredSlug = process.env.ADMIN_ORGANIZATION_SLUG?.trim();

if (!email || !password) {
  throw new Error("Az ADMIN_EMAIL és ADMIN_PASSWORD környezeti változók kötelezőek.");
}

if (password.length < 8) {
  throw new Error("Az admin jelszónak legalább 8 karakter hosszúnak kell lennie.");
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash, firstName: "Admin", lastName: "User" },
    });
    const membership = await transaction.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { id: "asc" },
      include: { organization: true },
    });

    // Reuse the default membership, or explicitly target an organization by slug.
    let organization = configuredSlug
      ? await transaction.organization.findUnique({ where: { slug: configuredSlug } })
      : membership?.organization;

    if (!organization) {
      const baseSlug = organizationName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "organization";
      organization = await transaction.organization.create({
        data: { name: organizationName, slug: configuredSlug || `${baseSlug}-${randomUUID()}` },
      });
    }

    await transaction.organizationMember.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
      update: { role: "OWNER" },
      create: { userId: user.id, organizationId: organization.id, role: "OWNER" },
    });

    return user;
  });

  console.log(`Admin létrehozva/frissítve: ${user.email}`);
} finally {
  await prisma.$disconnect();
}
