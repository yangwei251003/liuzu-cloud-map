import assert from "node:assert/strict";
import test from "node:test";
import { evaluateVisitorAuthCapability } from "../src/lib/server/visitor-identity-capability.ts";
import {
  clearedVisitorSessionCookie,
  clientNetworkAddress,
  readVisitorAuthJson,
  sameOriginWriteError,
  visitorSessionCookie,
  visitorSessionTokenFromRequest,
} from "../src/lib/server/visitor-identity-http.ts";

test("visitor auth fails closed without every required runtime capability", () => {
  assert.deepEqual(evaluateVisitorAuthCapability({}), { state: "DISABLED", reason: "DATABASE_NOT_CONFIGURED" });
  assert.deepEqual(evaluateVisitorAuthCapability({ DATABASE_URL: "postgres://db" }), { state: "DISABLED", reason: "FEATURE_NOT_ENABLED" });
  assert.deepEqual(
    evaluateVisitorAuthCapability({ DATABASE_URL: "postgres://db", VISITOR_AUTH_ENABLED: "1" }),
    { state: "DISABLED", reason: "SECURITY_CONFIGURATION_MISSING" },
  );
  assert.deepEqual(
    evaluateVisitorAuthCapability({
      DATABASE_URL: "postgres://db",
      VISITOR_AUTH_ENABLED: "1",
      VISITOR_AUTH_RATE_LIMIT_PEPPER: "p".repeat(32),
    }),
    { state: "ENABLED" },
  );
});

test("session cookies are HttpOnly, Lax, site-wide, 30-day and Secure in production", () => {
  const cookie = visitorSessionCookie("A".repeat(43), "2026-09-14T00:00:00.000Z", true);
  assert.match(cookie, /^liuzu_visitor_session=A{43};/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=2592000/);
  assert.match(cookie, /Secure/);
  const cleared = clearedVisitorSessionCookie(true);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Secure/);
});

test("write requests require a same-origin Origin or, only when it is absent, a same-origin Referer", () => {
  const same = new Request("https://tour.example/api/v1/auth/login", { headers: { origin: "https://tour.example" } });
  const cross = new Request("https://tour.example/api/v1/auth/login", { headers: { origin: "https://attacker.example" } });
  const absent = new Request("https://tour.example/api/v1/auth/login");
  const sameReferer = new Request("https://tour.example/api/v1/auth/login", { headers: { referer: "https://tour.example/guide/ask" } });
  const crossReferer = new Request("https://tour.example/api/v1/auth/login", { headers: { referer: "https://attacker.example/forged-form" } });
  const nullOriginWithReferer = new Request("https://tour.example/api/v1/auth/login", { headers: { origin: "null", referer: "https://tour.example/guide/ask" } });
  const emptyOriginWithReferer = new Request("https://tour.example/api/v1/auth/login", { headers: { origin: "", referer: "https://tour.example/guide/ask" } });
  const localAlias = new Request("http://localhost:3212/api/ai-guide", { headers: { origin: "http://127.0.0.1:3212" } });
  const reverseLocalAlias = new Request("http://127.0.0.1:3212/api/ai-guide", { headers: { origin: "http://localhost:3212" } });
  const localRefererAlias = new Request("http://localhost:3212/api/ai-guide", { headers: { referer: "http://127.0.0.1:3212/guide/ask" } });
  const wrongLocalPort = new Request("http://localhost:3212/api/ai-guide", { headers: { origin: "http://127.0.0.1:3213" } });
  assert.equal(sameOriginWriteError(same), null);
  assert.equal(sameOriginWriteError(sameReferer), null);
  assert.equal(sameOriginWriteError(localAlias), null);
  assert.equal(sameOriginWriteError(reverseLocalAlias), null);
  assert.equal(sameOriginWriteError(localRefererAlias), null);
  assert.equal(sameOriginWriteError(cross).status, 403);
  assert.equal(sameOriginWriteError(crossReferer).status, 403);
  assert.equal(sameOriginWriteError(nullOriginWithReferer).status, 403);
  assert.equal(sameOriginWriteError(emptyOriginWithReferer).status, 403);
  assert.equal(sameOriginWriteError(wrongLocalPort).status, 403);
  assert.equal(sameOriginWriteError(absent).status, 403);
});

test("cookie parsing rejects ambiguity and client network addresses are only transient inputs", () => {
  const token = "B".repeat(43);
  assert.equal(visitorSessionTokenFromRequest(new Request("https://tour.example", { headers: { cookie: `x=1; liuzu_visitor_session=${token}` } })), token);
  assert.equal(
    visitorSessionTokenFromRequest(new Request("https://tour.example", { headers: { cookie: `liuzu_visitor_session=${token}; liuzu_visitor_session=${token}` } })),
    null,
  );
  assert.equal(clientNetworkAddress(new Request("https://tour.example", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
});

test("auth JSON uses a strict bounded reader", async () => {
  const accepted = await readVisitorAuthJson(new Request("https://tour.example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenicAreaId: "liuzu-town", handle: "guest", passphrase: "long-password" }),
  }));
  assert.equal(accepted.ok, true);
  const oversized = await readVisitorAuthJson(new Request("https://tour.example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(5_000) }),
  }));
  assert.equal(oversized.ok, false);
  assert.equal(oversized.response.status, 413);
});
