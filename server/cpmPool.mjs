import { readFile } from "node:fs/promises";
import sql from "mssql";
import { buildCpmConnectionConfig } from "./cpmConnectionConfig.mjs";

async function readCredentials(environment) {
  if (environment.CPM_SQL_USER && environment.CPM_SQL_PASSWORD) {
    return { user: environment.CPM_SQL_USER, password: environment.CPM_SQL_PASSWORD };
  }
  if (!environment.CPM_CREDENTIAL_FILE) return null;
  const raw = await readFile(environment.CPM_CREDENTIAL_FILE, "utf8");
  const [user, password] = raw.split(/\r?\n/).map((value) => value.trim());
  if (!user || !password) throw new Error("Kimlik bilgisi dosyası iki dolu satır içermeli.");
  return { user, password };
}

/** Infrastructure adapter for lazy, retryable CPM SQL pool access. */
export function createCpmPoolProvider({ environment = process.env, connect = sql.connect } = {}) {
  let poolPromise;
  return {
    async getPool() {
      if (poolPromise) return poolPromise;
      const credentials = await readCredentials(environment);
      if (!credentials) return null;
      poolPromise = connect(buildCpmConnectionConfig({ credentials, environment })).catch((error) => {
        poolPromise = undefined;
        throw error;
      });
      return poolPromise;
    },
  };
}
