import test from "node:test";
import assert from "node:assert/strict";
import { enforceSameOrigin } from "./origin";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/wallet/onboard/validate", {
    method: "POST",
    headers,
  });
}

test("enforceSameOrigin: allows missing Origin in non-production (dev/test)", () => {
  // No FLOWEYPAY_APP_ORIGIN configured + no Origin header => dev fallback.
  assert.equal(enforceSameOrigin(req({})), null);
});

test("enforceSameOrigin: rejects a cross-origin request", () => {
  const res = enforceSameOrigin(req({ origin: "http://evil.example" }));
  assert.ok(res);
  assert.equal(res?.status, 403);
});

test("enforceSameOrigin: allows a same-origin request", () => {
  const res = enforceSameOrigin(req({ origin: "http://localhost" }));
  assert.equal(res, null);
});

test("enforceSameOrigin: honors FLOWEYPAY_APP_ORIGIN allowlist", () => {
  const prev = process.env.FLOWEYPAY_APP_ORIGIN;
  process.env.FLOWEYPAY_APP_ORIGIN = "https://pay.flowey.app, https://app.flowey.app";
  try {
    assert.equal(enforceSameOrigin(req({ origin: "https://pay.flowey.app" })), null);
    const bad = enforceSameOrigin(req({ origin: "http://localhost" }));
    assert.equal(bad?.status, 403);
  } finally {
    if (prev === undefined) delete process.env.FLOWEYPAY_APP_ORIGIN;
    else process.env.FLOWEYPAY_APP_ORIGIN = prev;
  }
});

test("enforceSameOrigin: rejects cross-site via Sec-Fetch-Site when Origin absent", () => {
  const res = enforceSameOrigin(req({ "sec-fetch-site": "cross-site" }));
  assert.equal(res?.status, 403);
});

test("enforceSameOrigin: allows same-origin via Sec-Fetch-Site", () => {
  assert.equal(enforceSameOrigin(req({ "sec-fetch-site": "same-origin" })), null);
});
