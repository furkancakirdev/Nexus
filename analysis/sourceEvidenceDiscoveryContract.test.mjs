import test from "node:test";
import assert from "node:assert/strict";
import { inspectRows, validateSampleLimit } from "./sourceEvidenceDiscoveryContract.mjs";

test("sampleLimit only accepts integer 1..20", () => {
  for (const value of [null, true, "2", 0, -1, 21, 1.5]) assert.throws(() => validateSampleLimit(value));
  assert.equal(validateSampleLimit(1), 1);
  assert.equal(validateSampleLimit(20), 20);
});

test("identity text and bigint remain exact; null and duplicate are ambiguous", () => {
  const result = inspectRows("STKHAR", [
    { sourceTable: "STKHAR", sourceRecordId: "900719925474099312345", documentType: 82, documentNumber: "A", lineNumber: "1" },
    { sourceTable: "STKHAR", sourceRecordId: "900719925474099312345", documentType: 82, documentNumber: "A", lineNumber: "1" },
    { sourceTable: "STKHAR", sourceRecordId: null, documentType: 82, documentNumber: "B", lineNumber: "2" },
    { sourceTable: "STKHAR", sourceRecordId: 9007199254740993, documentType: 82, documentNumber: "C", lineNumber: "3" },
  ]);
  assert.equal(result.identityCandidates[0].sourceRecordId, "900719925474099312345");
  assert.equal(result.identityCandidates[1].identityState, "ambiguous");
  assert.equal(result.identityCandidates[2].reviewRequiredReason, "null-source-identity");
  assert.equal(result.identityCandidates[3].identityState, "ambiguous");
});

test("missing fields remain unavailable instead of being guessed", () => {
  const result = inspectRows("EVRBAS", [{ sourceRecordId: "1" }]);
  assert.deepEqual(result.unavailableFields, ["company", "eventDate", "documentType", "documentNumber", "documentSequence", "documentGuid"]);
  assert.equal(result.identityCandidates[0].sourceRecordId, "1");
});
