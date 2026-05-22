-- AlterTable: add brute-force attempt counter to login_codes
ALTER TABLE "login_codes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
