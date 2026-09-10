import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  capabilitiesForRole,
  authorizeCapability,
} from "./capabilities.mjs";
import { normalizeSettings } from "../shared/settingsPolicy.mjs";

test("unknown roles default deny and capability lists are defensive copies", () => {
  assert.deepEqual(capabilitiesForRole("unknown"), []);
  const capabilities = capabilitiesForRole("admin");
  capabilities.pop();
  assert.deepEqual(capabilitiesForRole("admin"), [
    CAPABILITIES.REPORTING_READ,
    CAPABILITIES.OPERATIONS_READ,
    CAPABILITIES.APPROVALS_MANAGE,
    CAPABILITIES.SETTINGS_MANAGE,
  ]);
});

test("authorization middleware rejects missing capability without a principal", () => {
  let statusCode;
  let body;
  authorizeCapability(CAPABILITIES.SETTINGS_MANAGE)(
    { user: { role: "unknown", capabilities: [] } },
    {
      status(code) { statusCode = code; return this; },
      json(value) { body = value; return this; },
    },
    () => assert.fail("unauthorized request must not call next"),
  );
  assert.equal(statusCode, 403);
  assert.deepEqual(body, { error: "Bu işlem için yetki gerekli." });
});

test("settings normalization rejects duplicate policies, invalid ranges, and control characters", () => {
  assert.throws(
    () => normalizeSettings({
      manualMarginPolicies: [
        { id: "m1", productCode: "P-1", marginPct: 10, year: 2026, reason: "missing-purchase-or-opening-cost", status: "pending" },
        { id: "m2", productCode: "P-1", marginPct: 20, year: 2026, reason: "missing-purchase-or-opening-cost", status: "approved" },
      ],
    }),
    /Aynı ürün ve yıl/,
  );
  assert.throws(() => normalizeSettings({ reserveRate: 101 }), /arasında olmalı/);
  assert.throws(() => normalizeSettings({
    manualMarginPolicies: [{
      id: "m3",
      productCode: "P-2",
      marginPct: 10,
      year: 2026,
      reason: "missing-purchase-or-opening-cost",
      reference: "",
      note: "bad\u0000value",
      status: "pending",
    }],
  }), /geçerli uzunlukta metin/);
});
