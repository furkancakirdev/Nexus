function readBoolean(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  return String(value).trim().toLowerCase() !== "false";
}

export function buildCpmConnectionConfig({ credentials = {}, environment = process.env } = {}) {
  return {
    server: environment.CPM_SQL_SERVER || "192.168.12.17",
    database: environment.CPM_SQL_DATABASE || "Marlin_Uyg",
    user: credentials.user,
    password: credentials.password,
    connectionTimeout: 8_000,
    requestTimeout: 90_000,
    options: {
      instanceName: environment.CPM_SQL_INSTANCE || "MARLINSQL",
      encrypt: readBoolean(environment.CPM_SQL_ENCRYPT, true),
      trustServerCertificate: readBoolean(environment.CPM_SQL_TRUST_SERVER_CERTIFICATE, false),
      readOnlyIntent: true,
      appName: "Marlin Nexus ReadOnly",
    },
    pool: { min: 0, max: 4, idleTimeoutMillis: 10_000 },
  };
}
