import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";
import { clearRateLimitStoreForTests } from "@/lib/security/rateLimit";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/wallet/onboard/validate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

// The handler depends on next/headers cookies(), which has no session in tests,
// so authenticated flows are covered by the pure unit tests. Here we verify the
// pre-auth security gates (origin, body size) and the unauthenticated path.

test("validate: rejects a cross-origin request with 403", async () => {
  clearRateLimitStoreForTests();
  const res = await POST(post("{}", { origin: "http://evil.example" }));
  assert.equal(res.status, 403);
});

test("validate: rejects an oversized body with 400 before auth", async () => {
  clearRateLimitStoreForTests();
  const huge = JSON.stringify({ walletMaterial: "x".repeat(20_000), network: "MAINNET" });
  const res = await POST(post(huge));
  assert.equal(res.status, 400);
  const json = (await res.json()) as { message: string };
  assert.equal(json.message, "WALLET_INPUT_INVALID");
});
