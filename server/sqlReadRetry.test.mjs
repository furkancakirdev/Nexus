import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const retryModule = await import("./sqlReadRetry.mjs").catch(() => ({}));
const executeSqlReadWithDeadlockRetry = retryModule.executeSqlReadWithDeadlockRetry;

test("SQL Server 1205 deadlock hatasını sınırlı gecikmeyle yeniden dener", async () => {
  assert.equal(typeof executeSqlReadWithDeadlockRetry, "function");
  const delays = [];
  let attempts = 0;

  const result = await executeSqlReadWithDeadlockRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("deadlock victim");
      error.number = 1205;
      throw error;
    }
    return "ok";
  }, {
    sleep: async (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 500]);
});

test("deadlock dışındaki SQL hatasını yeniden denemez", async () => {
  assert.equal(typeof executeSqlReadWithDeadlockRetry, "function");
  let attempts = 0;
  const sourceError = Object.assign(new Error("syntax error"), { number: 102 });

  await assert.rejects(
    executeSqlReadWithDeadlockRetry(async () => {
      attempts += 1;
      throw sourceError;
    }),
    (error) => error === sourceError,
  );
  assert.equal(attempts, 1);
});

test("iç hata bilgisindeki 1205 kodunu tanır ve üç denemeden sonra özgün hatayı korur", async () => {
  assert.equal(typeof executeSqlReadWithDeadlockRetry, "function");
  let attempts = 0;
  const sourceError = Object.assign(new Error("request failed"), {
    originalError: { info: { number: 1205 } },
  });

  await assert.rejects(
    executeSqlReadWithDeadlockRetry(async () => {
      attempts += 1;
      throw sourceError;
    }, {
      sleep: async () => {},
    }),
    (error) => error === sourceError,
  );
  assert.equal(attempts, 3);
});

test("birleşik nihai fatura SQL okuması deadlock korumasını kullanır", async () => {
  const serverSource = await readFile(new URL("./index.mjs", import.meta.url), "utf8");

  assert.match(
    serverSource,
    /import \{ executeSqlReadWithDeadlockRetry \} from "\.\/sqlReadRetry\.mjs";/,
  );
  assert.match(
    serverSource,
    /const result = await executeSqlReadWithDeadlockRetry\(\(\) => pool\.request\(\)[\s\S]*?\.query\(finalInvoiceLedgerSql\)\);/,
  );
});
