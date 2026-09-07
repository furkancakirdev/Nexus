import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { applyApiAuthBoundary } from "./authBoundary.mjs";

test("üretim auth sınırı giriş sayfasını açık tutup sonraki API rotalarını korur", async (t) => {
  const app = express();
  app.post("/api/session/login", (_request, response) => response.sendStatus(204));
  applyApiAuthBoundary(app, {
    required: true,
    middleware: (_request, response) => response.sendStatus(401),
  });
  app.get("/api/private", (_request, response) => response.sendStatus(204));
  app.get("/", (_request, response) => response.type("html").send("Nexus login"));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const root = await fetch(`http://127.0.0.1:${port}/`);
  const privateApi = await fetch(`http://127.0.0.1:${port}/api/private`);
  const login = await fetch(`http://127.0.0.1:${port}/api/session/login`, { method: "POST" });

  assert.equal(root.status, 200);
  assert.equal(await root.text(), "Nexus login");
  assert.equal(privateApi.status, 401);
  assert.equal(login.status, 204);
});
