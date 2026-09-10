import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHrRouter } from "./router.mjs";

test("HR routes deny access when no capability policy is injected", async (t) => {
  const app = express();
  app.use("/api/hr", createHrRouter());
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hr/employees`);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "FORBIDDEN", message: "Bu işlem için yetki gerekli." } });
});

test("HR approval rejects an actor that differs from the session principal", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/hr", createHrRouter({
    requireCapability: () => (request, _response, next) => {
      request.nexusUser = { username: "session-user" };
      next();
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hr/leaves/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: "leave-unknown", approverId: "other-user" }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "ACTOR_MISMATCH", message: "Onaylayan kullanıcı oturum kullanıcısıyla eşleşmiyor." } });
});
