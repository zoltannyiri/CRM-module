import "dotenv/config";
import bcrypt from "bcryptjs";

import prisma from "../src/lib/prisma.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const organizationName = process.env.ADMIN_ORGANIZATION_NAME?.trim() || "Saját CRM";

if (!email || !password) {
  throw new Error("Az ADMIN_EMAIL és ADMIN_PASSWORD környezeti változók kötelezőek.");
}

if (password.length < 8) {
  throw new Error("Az admin jelszónak legalább 8 karakter hosszúnak kell lennie.");
}

try {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 12);
  let user;

  if (existingUser) {
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash, role: "ADMIN" },
    });
  } else {
    const organization = await prisma.organization.create({
      data: { name: organizationName },
    });

    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
        organizationId: organization.id,
      },
    });
  }

  console.log(`Admin létrehozva/frissítve: ${user.email}`);
} finally {
  await prisma.$disconnect();
}
