import test from "node:test";
import assert from "node:assert/strict";
import { createAuth } from "./auth.mjs";

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    body: {},
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

test("auth issues session and csrf cookies for the configured admin", () => {
  const auth = createAuth({ secret: "test", username: "admin", passwordHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" });
  const res = response();
  auth.login(request({ body: { username: "ADMIN", password: "test" }, headers: { "x-forwarded-proto": "https" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Set-Cookie"].length, 2);
  assert.ok(res.headers["Set-Cookie"][0].includes("HttpOnly"));
  assert.ok(res.headers["Set-Cookie"].every((value) => value.includes("Secure")));
  assert.ok(res.body.csrfToken);
});

test("auth rejects invalid credentials without revealing which field failed", () => {
  const auth = createAuth({ secret: "test", username: "admin", passwordHash: "invalid" });
  const res = response();
  auth.login(request({ body: { username: "admin", password: "wrong" } }), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Kullanıcı adı veya parola hatalı." });
  assert.equal(res.headers["Set-Cookie"], undefined);
});

test("auth throttles repeated failures and resets the counter after success", () => {
  let clock = 1000;
  let authenticated = false;
  const auth = createAuth({
    secret: "test",
    identityProvider: { authenticate: () => authenticated ? { username: "admin", role: "admin" } : null },
    now: () => clock,
    maxLoginAttempts: 2,
    loginWindowMs: 100,
    lockoutMs: 200,
  });
  for (let i = 0; i < 2; i += 1) {
    const res = response();
    auth.login(request({ body: { username: "admin", password: "wrong" } }), res);
    assert.equal(res.statusCode, 401);
  }
  const limited = response();
  auth.login(request({ body: { username: "admin", password: "wrong" } }), limited);
  assert.equal(limited.statusCode, 429);
  clock += 201;
  authenticated = true;
  const success = response();
  auth.login(request({ body: { username: "admin", password: "correct" } }), success);
  assert.equal(success.statusCode, 200);
  authenticated = false;
  const afterReset = response();
  auth.login(request({ body: { username: "admin", password: "wrong" } }), afterReset);
  assert.equal(afterReset.statusCode, 401);
});

test("auth converts identity-provider failures to a stable service error", () => {
  const auth = createAuth({ secret: "test", identityProvider: { authenticate: () => { throw new Error("internal provider detail"); } } });
  const res = response();
  auth.login(request({ body: { username: "admin", password: "test" } }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "Kimlik doğrulama şu anda kullanılamıyor." });
});

test("expired sessions and invalid signatures are rejected", () => {
  let clock = 1000;
  const auth = createAuth({ secret: "test", username: "admin", passwordHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", now: () => clock });
  const loginResponse = response();
  auth.login(request({ body: { username: "admin", password: "test" } }), loginResponse);
  const sessionCookie = loginResponse.headers["Set-Cookie"][0].split(";", 1)[0];
  const authenticated = request({ headers: { cookie: sessionCookie } });
  assert.equal(auth.read(authenticated).username, "admin");
  clock += 8 * 60 * 60 * 1000 + 1;
  assert.equal(auth.read(authenticated), null);
  assert.equal(auth.read(request({ headers: { cookie: `${sessionCookie}tampered` } })), null);
});

test("logout clears both cookies with secure attributes when forwarded over HTTPS", () => {
  const auth = createAuth({ secret: "test", identityProvider: { authenticate: () => ({ username: "admin", role: "admin" }) } });
  const res = response();
  auth.logout(request({ secure: true }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { loggedOut: true });
  assert.equal(res.headers["Set-Cookie"].length, 2);
  assert.ok(res.headers["Set-Cookie"].every((value) => value.includes("Max-Age=0") && value.includes("Secure")));
});

test("mutating requests require matching csrf and configured origin", () => {
  const auth = createAuth({ secret: "test", identityProvider: { authenticate: () => ({ username: "admin", role: "admin" }) }, publicOrigin: "https://nexus.test" });
  const loginResponse = response();
  auth.login(request({ body: { username: "admin", password: "test" } }), loginResponse);
  const cookies = loginResponse.headers["Set-Cookie"].map((value) => value.split(";", 1)[0]).join("; ");
  const csrf = loginResponse.body.csrfToken;
  const next = () => {};
  const denied = response();
  auth.middleware(request({ method: "POST", headers: { cookie: cookies, origin: "https://evil.test" } }), denied, next);
  assert.equal(denied.statusCode, 403);
  const allowed = response();
  auth.middleware(request({ method: "POST", headers: { cookie: cookies, origin: "https://nexus.test", "x-csrf-token": csrf } }), allowed, next);
  assert.equal(allowed.statusCode, 200);
});
