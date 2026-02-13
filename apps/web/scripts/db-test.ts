import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient()

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
  `;
  console.log(tables.map((t) => t.tablename));
}

main()
  .catch(console.error)
  .finally(async () => prisma.$disconnect());
