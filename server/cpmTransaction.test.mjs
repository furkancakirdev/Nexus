import test from "node:test";
import assert from "node:assert/strict";
import { withReadOnlyCpmTransaction } from "./cpmTransaction.mjs";

function fakeTransaction({ queryResults = [], failAt = null } = {}) {
  const events = [];
  let resultIndex = 0;
  const transaction = {
    events,
    async begin(isolationLevel) {
      events.push(["begin", isolationLevel]);
      if (failAt === "begin") throw new Error("begin failed");
    },
    request() {
      events.push(["request"]);
      return {
        async query(query) {
          events.push(["query", query]);
          if (failAt === "query") throw new Error("query failed");
          return queryResults[resultIndex++];
        },
      };
    },
    async rollback() {
      events.push(["rollback"]);
      if (failAt === "rollback") throw new Error("rollback failed");
    },
  };
  return transaction;
}

test("runs every read through one explicit transaction and rolls it back", async () => {
  const transaction = fakeTransaction({ queryResults: [{ rows: [1] }, { rows: [2] }] });
  const calls = [];

  const result = await withReadOnlyCpmTransaction({
    transactionFactory: async () => transaction,
    isolationLevel: "snapshot",
    executeRead: async ({ request, queryId, query }) => {
      calls.push(queryId);
      return request.query(query);
    },
    run: async ({ execute }) => ({
      canonical: await execute({ queryId: "canonical", query: "SELECT canonical" }),
      source: await execute({ queryId: "source", query: "SELECT source" }),
    }),
  });

  assert.deepEqual(result, { canonical: { rows: [1] }, source: { rows: [2] } });
  assert.deepEqual(calls, ["canonical", "source"]);
  assert.deepEqual(transaction.events, [
    ["begin", "snapshot"],
    ["request"],
    ["query", "SELECT canonical"],
    ["query", "SELECT source"],
    ["rollback"],
  ]);
});

test("rolls back when a read or transform fails", async () => {
  const transaction = fakeTransaction({ failAt: "query" });

  await assert.rejects(
    withReadOnlyCpmTransaction({
      transactionFactory: async () => transaction,
      executeRead: ({ request, query }) => request.query(query),
      run: ({ execute }) => execute({ queryId: "source", query: "SELECT source" }),
    }),
    /query failed/,
  );
  assert.deepEqual(transaction.events.at(-1), ["rollback"]);
});

test("does not attempt rollback when begin fails, but still closes the transaction", async () => {
  const transaction = fakeTransaction({ failAt: "begin" });
  transaction.close = async () => transaction.events.push(["close"]);

  await assert.rejects(
    withReadOnlyCpmTransaction({
      transactionFactory: async () => transaction,
      executeRead: async () => {},
      run: async () => {},
    }),
    /begin failed/,
  );
  assert.deepEqual(transaction.events, [["begin", "read committed"], ["close"]]);
});

test("rejects a transaction runner without a read executor", async () => {
  await assert.rejects(
    withReadOnlyCpmTransaction({ transactionFactory: async () => fakeTransaction(), run: async () => {} }),
    /executeRead/,
  );
});
