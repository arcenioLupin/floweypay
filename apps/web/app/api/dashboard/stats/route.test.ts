import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

// The route depends on next/headers (via requireUserId → cookies()).
// Without a real Next.js request context, requireUserId() throws → 401.
// Authenticated paths and aggregation logic are covered by the stats endpoint
// and the existing payments/helpers unit tests.

test("GET /api/dashboard/stats returns 401 without valid session", async () => {
  const res = await GET(
    new Request("http://localhost/api/dashboard/stats", { method: "GET" })
  );
  assert.equal(res.status, 401);
  const json = (await res.json()) as { success: boolean; message: string };
  assert.equal(json.success, false);
  assert.equal(json.message, "UNAUTHORIZED");
});

test("GET /api/dashboard/stats 401 response has correct Content-Type", async () => {
  const res = await GET(
    new Request("http://localhost/api/dashboard/stats", { method: "GET" })
  );
  assert.equal(res.status, 401);
  assert.ok(res.headers.get("content-type")?.startsWith("application/json"));
});
