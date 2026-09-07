import test from "node:test";
import assert from "node:assert/strict";
import { createAuth } from "./auth.mjs";

test("auth issues session and csrf cookies for the configured admin", () => {
  const auth = createAuth({ secret: "test", username: "admin", passwordHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" });
  const response = { headers: {}, statusCode: 200, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  auth.login({ body: { username: "admin", password: "test" }, headers: {} }, response);
  assert.equal(response.statusCode, 200); assert.equal(response.headers["Set-Cookie"].length, 2); assert.ok(response.body.csrfToken);
});
