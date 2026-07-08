// @ts-nocheck -- seed script is executed with tsx and Prisma's nested upsert input is easier to keep as generated runtime data.
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PREBUILT_ASSESSMENT_TEMPLATES, buildPrebuiltTemplateCreateData, buildPrebuiltTemplateUpdateData } from "../src/modules/templates/prebuilt-templates";

const prisma = new PrismaClient();

const SEED_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000101";
const SEED_OWNER_ID = "00000000-0000-4000-8000-000000000102";
const SEED_OWNER_EMAIL = "prebuilt-template-owner@evalora.local";

async function main() {
  const ownerContext = await ensureSeedOwner();
  const seededTitles: string[] = [];

  for (const template of PREBUILT_ASSESSMENT_TEMPLATES) {
    await prisma.assessmentTemplate.upsert({
      where: { id: template.id },
      update: buildPrebuiltTemplateUpdateData(template, ownerContext),
      create: buildPrebuiltTemplateCreateData(template, ownerContext),
    });
    seededTitles.push(template.title);
  }

  console.log(
    JSON.stringify(
      {
        seededTemplates: seededTitles.length,
        titles: seededTitles,
        organizationId: ownerContext.organizationId,
      },
      null,
      2,
    ),
  );
}

async function ensureSeedOwner() {
  const organization = await prisma.organization.upsert({
    where: { id: SEED_ORGANIZATION_ID },
    update: { name: "Evalora Demo Organization" },
    create: { id: SEED_ORGANIZATION_ID, name: "Evalora Demo Organization" },
  });

  const existingOwner = await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existingOwner) {
    const owner = await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        name: "Evalora Prebuilt Template Owner",
        role: "ORGANIZATION",
        organizationId: organization.id,
      },
    });
    return { createdById: owner.id, organizationId: organization.id };
  }

  const passwordHash = await bcrypt.hash(randomUUID(), 12);
  const owner = await prisma.user.upsert({
    where: { id: SEED_OWNER_ID },
    update: {
      name: "Evalora Prebuilt Template Owner",
      email: SEED_OWNER_EMAIL,
      role: "ORGANIZATION",
      organizationId: organization.id,
    },
    create: {
      id: SEED_OWNER_ID,
      name: "Evalora Prebuilt Template Owner",
      email: SEED_OWNER_EMAIL,
      passwordHash,
      role: "ORGANIZATION",
      organizationId: organization.id,
    },
  });

  return { createdById: owner.id, organizationId: organization.id };
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Prebuilt template seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
