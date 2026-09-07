import test from "node:test";
import assert from "node:assert/strict";
import { buildCpmConnectionConfig } from "./cpmConnectionConfig.mjs";

test("CPM SQL encryption setting follows the explicit environment value", () => {
  const config = buildCpmConnectionConfig({
    credentials: { user: "sa", password: "not-used-in-assertion" },
    environment: {
      CPM_SQL_SERVER: "192.168.12.17",
      CPM_SQL_INSTANCE: "MARLINSQL",
      CPM_SQL_DATABASE: "Marlin_Uyg",
      CPM_SQL_ENCRYPT: "false",
      CPM_SQL_TRUST_SERVER_CERTIFICATE: "false",
    },
  });

  assert.equal(config.options.encrypt, false);
  assert.equal(config.options.trustServerCertificate, false);
  assert.equal(config.options.instanceName, "MARLINSQL");
  assert.equal(config.server, "192.168.12.17");
  assert.equal(config.database, "Marlin_Uyg");
});

test("CPM SQL encryption remains enabled when the setting is absent or true", () => {
  assert.equal(buildCpmConnectionConfig({ credentials: {}, environment: {} }).options.encrypt, true);
  assert.equal(buildCpmConnectionConfig({ credentials: {}, environment: { CPM_SQL_ENCRYPT: "true" } }).options.encrypt, true);
});
