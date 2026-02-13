import "dotenv/config";
import { prisma } from "@floweypay/db";

async function main() {
  const result = await prisma.$queryRaw<{ now: Date }[]>`select now() as now`;
  console.log("[db-smoke] connected OK:", result[0]?.now);

  const payments = await prisma.payments.count();
  const products = await prisma.products.count();
  const users = await prisma.users.count();

  console.log("[db-smoke] counts:", { users, products, payments });
}

main()
  .catch((e) => {
    console.error("[db-smoke] FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
