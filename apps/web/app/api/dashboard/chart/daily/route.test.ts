import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

// Without a real Next.js request context, requireUserId() throws → 401.
// Authenticated database paths require a live Prisma connection and are
// exercised by integration/e2e tests.

test("GET /api/dashboard/chart/daily returns 401 without valid session", async () => {
  const res = await GET(
    new Request("http://localhost/api/dashboard/chart/daily", { method: "GET" })
  );
  assert.equal(res.status, 401);
  const json = (await res.json()) as { success: boolean; message: string };
  assert.equal(json.success, false);
  assert.equal(json.message, "UNAUTHORIZED");
});

test("GET /api/dashboard/chart/daily 401 response has correct Content-Type", async () => {
  const res = await GET(
    new Request("http://localhost/api/dashboard/chart/daily", { method: "GET" })
  );
  assert.equal(res.status, 401);
  assert.ok(res.headers.get("content-type")?.startsWith("application/json"));
});
