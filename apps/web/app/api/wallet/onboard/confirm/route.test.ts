import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";
import { clearRateLimitStoreForTests } from "@/lib/security/rateLimit";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/wallet/onboard/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("confirm: rejects a cross-origin request with 403", async () => {
  clearRateLimitStoreForTests();
  const res = await POST(post("{}", { origin: "http://evil.example" }));
  assert.equal(res.status, 403);
});

test("confirm: rejects an oversized body with 400 before auth", async () => {
  clearRateLimitStoreForTests();
  const huge = JSON.stringify({
    confirmationToken: "t".repeat(20_000),
    confirmedAddress0: "bc1qx",
  });
  const res = await POST(post(huge));
  assert.equal(res.status, 400);
});
