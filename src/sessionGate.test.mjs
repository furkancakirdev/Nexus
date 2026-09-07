import test from "node:test";
import assert from "node:assert/strict";
import { sessionViewFor } from "./sessionGate.js";

test("unauthenticated session renders login instead of the financial app", () => {
  assert.equal(sessionViewFor({ status: "unauthenticated", user: null }), "login");
});

test("session loading does not render demo or live financial data", () => {
  assert.equal(sessionViewFor({ status: "loading", user: null }), "loading");
});

test("authenticated session renders the application", () => {
  assert.equal(sessionViewFor({ status: "authenticated", user: { username: "yonetici" } }), "app");
});
