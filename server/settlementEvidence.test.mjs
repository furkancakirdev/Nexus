import test from "node:test";
import assert from "node:assert/strict";
import { buildSettlementEvidence } from "./settlementEvidence.mjs";

const invoice = { documentType: 17, documentNo: "F-1", accountCode: "C-1", netAmount: 100 };

test("cari hesaba işlenen fatura tahsil edilmiş sayılmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    currentAccountPostings: [{ invoiceKey: "17|F-1|C-1", rowCount: 1 }],
  });

  assert.equal(result.rows[0].invoicePostedToCurrentAccount, true);
  assert.equal(result.rows[0].settlementStatus, "unverified");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
  assert.equal(result.summary.confirmedSettlementAmount, null);
});

test("cari kayıt sayacı null, boş metin ve boolean değerleri örtük biçimde sayıya çevirmez", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    currentAccountPostings: [
      { invoiceKey: "17|F-1|C-1", rowCount: null },
      { invoiceKey: "17|F-1|C-1", rowCount: "" },
      { invoiceKey: "17|F-1|C-1", rowCount: true },
      { invoiceKey: "17|F-1|C-1", rowCount: "2" },
    ],
  });

  assert.equal(result.rows[0].currentAccountPostingCount, 5);
});

test("tam anahtarlı fakat anlamı doğrulanmamış tahsilat adayı kesinleşmez", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 100,
      referenceExact: true,
      directionVerified: false,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].candidateSettlementAmount, 100);
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("tam belge anahtarı ve tutar/yön kanıtı varsa tahsilat kesinleşebilir", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "TRY" }],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      movementId: "M-1",
      amount: 100,
      currencyCode: "TRY",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "confirmed");
  assert.equal(result.rows[0].confirmedSettlementAmount, 100);
  assert.equal(result.summary.confirmedSettlementAmount, 100);
});

test("yalnız tarih/tutar benzerliği fatura eşleşmesi üretmez", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    unlinkedCandidates: [{ source: "BNKHAR", amount: 100, date: "2026-01-01" }],
  });

  assert.equal(result.rows[0].settlementStatus, "unverified");
  assert.equal(result.summary.unlinkedCandidateCount, 1);
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("null, boş metin, boolean ve geçersiz tutar confirmed olmaz", () => {
  for (const amount of [null, "", true, "not-a-number", "0x64", "1e2", ["100"], { valueOf: () => 100 }]) {
    const result = buildSettlementEvidence({
      invoices: [invoice],
      settlementCandidates: [{
        invoiceKey: "17|F-1|C-1",
        amount,
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      }],
    });

    assert.notEqual(result.rows[0].settlementStatus, "confirmed");
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  }
});

test("kısmi ödeme confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 40,
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].candidateSettlementAmount, 40);
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("fazla ödeme confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 120,
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("sıfır tutarlı ve ödeme kanıtsız fatura confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, documentNo: "F-ZERO", netAmount: 0 }],
  });

  assert.equal(result.rows[0].settlementStatus, "unverified");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("ters kayıt confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 100,
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
      isReversal: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

for (const [orderLabel, candidates] of [
  ["ödeme önce", [
    { movementId: "M-PAYMENT", amount: 100, isReversal: false },
    { movementId: "M-REVERSAL", amount: 100, isReversal: true },
  ]],
  ["reversal önce", [
    { movementId: "M-REVERSAL", amount: 100, isReversal: true },
    { movementId: "M-PAYMENT", amount: 100, isReversal: false },
  ]],
]) {
  test(`aynı fatura için ödeme ve ayrı reversal her iki sırada da kesinleşmez (${orderLabel})`, () => {
    const result = buildSettlementEvidence({
      invoices: [{ ...invoice, currencyCode: "TRY" }],
      settlementCandidates: candidates.map((candidate) => ({
        invoiceKey: "17|F-1|C-1",
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
        ...candidate,
      })),
    });

    assert.equal(result.rows[0].settlementStatus, "candidate");
    assert.equal(result.rows[0].verifiedSettlementReferenceCount, 1);
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  });
}

test("farklı para birimi confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "TRY" }],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 100,
      currencyCode: "EUR",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("desteklenmeyen aynı para birimi confirmed olmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "XYZ" }],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      movementId: "M-XYZ",
      amount: 100,
      currencyCode: "XYZ",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
  assert.equal(result.summary.confirmedSettlementAmount, null);
});

test("iki boş para birimi aynı kabul edilmez", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 100,
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("hareket kimliği olmayan aday dizi konumuyla doğrulanmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      amount: 100,
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].exactSettlementReferenceCount, 1);
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("kimliksiz farklı hareketler sessizce tek harekete birleştirilmez", () => {
  const result = buildSettlementEvidence({
    invoices: [invoice],
    settlementCandidates: [
      {
        invoiceKey: "17|F-1|C-1",
        amount: 60,
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-1|C-1",
        amount: 40,
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
    ],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].exactSettlementReferenceCount, 2);
  assert.equal(result.rows[0].candidateSettlementAmount, 100);
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
});

test("aynı hareket CARHAR ve EVRHAR referanslarıyla iki kez sayılmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "TRY" }],
    settlementCandidates: [
      {
        invoiceKey: "17|F-1|C-1",
        sourceTable: "CARHAR",
        movementId: "M-1",
        amount: 100,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-1|C-1",
        sourceTable: "EVRHAR",
        movementId: "M-1",
        amount: 100,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
    ],
  });

  assert.equal(result.rows[0].exactSettlementReferenceCount, 1);
  assert.equal(result.rows[0].settlementStatus, "confirmed");
  assert.equal(result.rows[0].confirmedSettlementAmount, 100);
});

for (const amountVerified of [false, undefined]) {
  test(`aynı hareket grubunda amountVerified ${amountVerified === undefined ? "eksik" : "false"} ise kesinleşmez`, () => {
    const first = {
      invoiceKey: "17|F-1|C-1",
      movementId: "M-AMOUNT-EVIDENCE",
      amount: 100,
      currencyCode: "TRY",
      referenceExact: true,
      directionVerified: true,
      ...(amountVerified === undefined ? {} : { amountVerified }),
    };
    const result = buildSettlementEvidence({
      invoices: [{ ...invoice, currencyCode: "TRY" }],
      settlementCandidates: [first, { ...first }],
    });

    assert.equal(result.rows[0].settlementStatus, "candidate");
    assert.equal(result.rows[0].verifiedSettlementReferenceCount, 0);
    assert.equal(result.rows[0].candidateSettlementAmount, null);
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  });
}

const contradictoryCandidate = {
  invoiceKey: "17|F-1|C-1",
  movementId: "M-CONFLICT",
  amount: 100,
  currencyCode: "TRY",
  referenceExact: true,
  directionVerified: true,
  amountVerified: true,
};

const contradictionCases = [
  ["para birimi", { currencyCode: "EUR" }, { currencyCode: "TRY" }, null],
  ["ters kayıt durumu", { isReversal: true }, { isReversal: false }, null],
  ["tam referans kanıtı", { referenceExact: true }, { referenceExact: false }, null],
  ["yön kanıtı", { directionVerified: true }, { directionVerified: false }, null],
  ["tutar kanıtı", { amount: 100 }, { amount: 90 }, null],
];

for (const [label, firstChange, secondChange, expectedCandidateAmount] of contradictionCases) {
  for (const [orderLabel, first, second] of [
    ["ilk satır A", firstChange, secondChange],
    ["ilk satır B", secondChange, firstChange],
  ]) {
    test(`aynı hareket kimliğinde ${label} çelişkisi ${orderLabel} olsa da kesinleşmez`, () => {
      const result = buildSettlementEvidence({
        invoices: [{ ...invoice, currencyCode: "TRY" }],
        settlementCandidates: [
          { ...contradictoryCandidate, ...first },
          { ...contradictoryCandidate, ...second },
        ],
      });

      assert.equal(result.rows[0].settlementStatus, "candidate");
      assert.equal(result.rows[0].verifiedSettlementReferenceCount, 0);
      assert.equal(result.rows[0].candidateSettlementAmount, expectedCandidateAmount);
      assert.equal(result.rows[0].confirmedSettlementAmount, null);
    });
  }
}

test("yinelenen fatura anahtarı tek ekonomik satır olarak tutulur", () => {
  const result = buildSettlementEvidence({
    invoices: [
      { ...invoice, currencyCode: "TRY" },
      { ...invoice, currencyCode: "TRY" },
    ],
    settlementCandidates: [{
      invoiceKey: "17|F-1|C-1",
      movementId: "M-1",
      amount: 100,
      currencyCode: "TRY",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    }],
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.summary.invoiceCount, 1);
  assert.equal(result.summary.confirmedSettlementAmount, 100);
  assert.equal(result.financialStatus, "blocked");
});

for (const [label, first, second] of [
  ["tutar", { netAmount: 100 }, { netAmount: 90 }],
  ["para birimi", { currencyCode: "TRY" }, { currencyCode: "EUR" }],
]) {
  for (const [orderLabel, duplicateInvoices] of [
    ["ilk satır A", [first, second]],
    ["ilk satır B", [second, first]],
  ]) {
    test(`çakışan yinelenen fatura ${label} kanıtı ${orderLabel} olsa da kesinleşmez`, () => {
      const result = buildSettlementEvidence({
        invoices: duplicateInvoices.map((change) => ({ ...invoice, ...change })),
        settlementCandidates: [{
          invoiceKey: "17|F-1|C-1",
          movementId: "M-DUPLICATE-INVOICE",
          amount: 100,
          currencyCode: "TRY",
          referenceExact: true,
          directionVerified: true,
          amountVerified: true,
        }],
      });

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].settlementStatus, "candidate");
      assert.equal(result.rows[0].verifiedSettlementReferenceCount, 0);
      assert.equal(result.rows[0].confirmedSettlementAmount, null);
      assert.equal(result.summary.confirmedSettlementAmount, null);
    });
  }
}

for (const [orderLabel, candidates] of [
  ["ilk fatura önce", [
    { invoiceKey: "17|F-1|C-1", movementId: "M-CROSS-INVOICE", amount: 100, currencyCode: "TRY", referenceExact: true, directionVerified: true, amountVerified: true },
    { invoiceKey: "17|F-2|C-2", movementId: "M-CROSS-INVOICE", amount: 100, currencyCode: "TRY", referenceExact: true, directionVerified: true, amountVerified: true },
  ]],
  ["ikinci fatura önce", [
    { invoiceKey: "17|F-2|C-2", movementId: "M-CROSS-INVOICE", amount: 100, currencyCode: "TRY", referenceExact: true, directionVerified: true, amountVerified: true },
    { invoiceKey: "17|F-1|C-1", movementId: "M-CROSS-INVOICE", amount: 100, currencyCode: "TRY", referenceExact: true, directionVerified: true, amountVerified: true },
  ]],
]) {
  test(`aynı hareket farklı kesin fatura referanslarında iki kez sayılmaz (${orderLabel})`, () => {
    const result = buildSettlementEvidence({
      invoices: [
        { ...invoice, currencyCode: "TRY" },
        { ...invoice, documentNo: "F-2", accountCode: "C-2", currencyCode: "TRY" },
      ],
      settlementCandidates: candidates,
    });

    assert.deepEqual(result.rows.map((row) => row.settlementStatus), ["candidate", "candidate"]);
    assert.deepEqual(result.rows.map((row) => row.verifiedSettlementReferenceCount), [0, 0]);
    assert.equal(result.summary.confirmedInvoiceCount, 0);
    assert.equal(result.summary.confirmedSettlementAmount, null);
  });
}

const permutations = (values) => values.length === 0
  ? [[]]
  : values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((rest) => [value, ...rest]));

for (const [orderLabel, amounts] of [
  ["ilk satır 100", [100, 100.0000000006, 99.9999999994]],
  ["ilk satır 100.0000000006", [100.0000000006, 99.9999999994, 100]],
]) {
  test("aynı hareket tutar aralığı toleransı aşınca kesinleşmez (" + orderLabel + ")", () => {
    const result = buildSettlementEvidence({
      invoices: [{ ...invoice, currencyCode: "TRY" }],
      settlementCandidates: amounts.map((amount) => ({
        invoiceKey: "17|F-1|C-1",
        movementId: "M-RANGE-CONFLICT",
        amount,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      })),
    });

    assert.equal(result.rows[0].settlementStatus, "candidate");
    assert.equal(result.rows[0].candidateSettlementAmount, null);
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  });
}

for (const amounts of permutations([100, 100.0000000006, 99.9999999994])) {
  test("aynı hareket tutar çelişkisi tüm permütasyonlarda kesinleşmez (" + amounts.join(",") + ")", () => {
    const result = buildSettlementEvidence({
      invoices: [{ ...invoice, currencyCode: "TRY" }],
      settlementCandidates: amounts.map((amount) => ({
        invoiceKey: "17|F-1|C-1",
        movementId: "M-RANGE-CONFLICT-PERMUTATION",
        amount,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      })),
    });

    assert.equal(result.rows[0].settlementStatus, "candidate");
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  });
}

for (const [label, badCopy] of [
  ["eksik fatura referansı", {
    invoiceKey: undefined,
    documentKey: undefined,
  }],
  ["çakışan fatura referansı", { invoiceKey: "17|F-2|C-2" }],
  ["ters kayıt", { isReversal: true }],
  ["çakışan para birimi", { currencyCode: "EUR" }],
  ["çakışan tutar kanıtı", { amount: 90 }],
]) {
  test("tam hareket kümesindeki " + label + " kopya her ilgili faturayı bloke eder", () => {
    const result = buildSettlementEvidence({
      invoices: [
        { ...invoice, currencyCode: "TRY" },
        { ...invoice, documentNo: "F-2", accountCode: "C-2", currencyCode: "TRY" },
      ],
      settlementCandidates: [
        {
          invoiceKey: "17|F-1|C-1",
          movementId: "M-GLOBAL-" + label,
          amount: 100,
          currencyCode: "TRY",
          referenceExact: true,
          directionVerified: true,
          amountVerified: true,
        },
        {
          invoiceKey: "17|F-1|C-1",
          movementId: "M-GLOBAL-" + label,
          amount: 100,
          currencyCode: "TRY",
          referenceExact: true,
          directionVerified: true,
          amountVerified: true,
          ...badCopy,
        },
      ],
    });

    assert.deepEqual(
      result.rows.map((row) => row.settlementStatus),
      label === "çakışan fatura referansı" ? ["candidate", "candidate"] : ["candidate", "unverified"],
    );
    assert.equal(result.rows[0].verifiedSettlementReferenceCount, 0);
    assert.equal(result.rows[0].confirmedSettlementAmount, null);
  });
}

test("onaylanan TRY ve EUR tutarları tek karma sayı olarak toplanmaz", () => {
  const result = buildSettlementEvidence({
    invoices: [
      { ...invoice, currencyCode: "TRY" },
      { ...invoice, documentNo: "F-2", accountCode: "C-2", currencyCode: "EUR" },
    ],
    settlementCandidates: [
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-TRY",
        amount: 100,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-2|C-2",
        movementId: "M-EUR",
        amount: 100,
        currencyCode: "EUR",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
    ],
  });

  assert.equal(result.summary.confirmedInvoiceCount, 2);
  assert.equal(result.summary.confirmedSettlementAmount, null);
  assert.deepEqual(result.summary.confirmedSettlementByCurrency, { EUR: 100, TRY: 100 });
});

test("büyük ve küçük ödeme toplamı giriş sırasından bağımsızdır", () => {
  const payments = [100000000, 0.01, 0.01];
  const build = (amounts) => buildSettlementEvidence({
    invoices: [{ ...invoice, netAmount: 100000000.02, currencyCode: "TRY" }],
    settlementCandidates: amounts.map((amount, index) => ({
      invoiceKey: "17|F-1|C-1",
      movementId: `M-LARGE-${index}`,
      amount,
      currencyCode: "TRY",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    })),
  });

  const results = [payments, [...payments].reverse(), [payments[1], payments[0], payments[2]]]
    .map(build);
  assert.deepEqual(
    results.map((result) => [
      result.rows[0].candidateSettlementAmount,
      result.rows[0].confirmedSettlementAmount,
      result.rows[0].settlementStatus,
    ]),
    results.map(() => [100000000.02, 100000000.02, "confirmed"]),
  );
});

test("aday TRY ve EUR tutarlarını karma sayıya dönüştürmez", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "TRY" }],
    settlementCandidates: [
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-CANDIDATE-TRY",
        amount: 60,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: false,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-CANDIDATE-EUR",
        amount: 40,
        currencyCode: "EUR",
        referenceExact: true,
        directionVerified: false,
        amountVerified: true,
      },
    ],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].candidateSettlementAmount, null);
  assert.deepEqual(result.rows[0].candidateSettlementByCurrency, { EUR: 40, TRY: 60 });
});

test("aynı faturadaki doğrulanmış karma para birimi kesinleşmez", () => {
  const result = buildSettlementEvidence({
    invoices: [{ ...invoice, currencyCode: "TRY" }],
    settlementCandidates: [
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-MIXED-TRY",
        amount: 100,
        currencyCode: "TRY",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-MIXED-EUR",
        amount: 100,
        currencyCode: "EUR",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
    ],
  });

  assert.equal(result.rows[0].settlementStatus, "candidate");
  assert.equal(result.rows[0].confirmedSettlementAmount, null);
  assert.equal(result.rows[0].candidateSettlementAmount, null);
  assert.deepEqual(result.rows[0].candidateSettlementByCurrency, { EUR: 100, TRY: 100 });
});

test("geçerli TRY hareketi belirsiz EUR kopyasıyla birlikte kesinleşmez", () => {
  const validTry = {
    invoiceKey: "17|F-1|C-1",
    movementId: "M-VALID-TRY",
    amount: 100,
    currencyCode: "TRY",
    referenceExact: true,
    directionVerified: true,
    amountVerified: true,
  };
  const ambiguousEurCases = [
    {
      invoiceKey: "17|F-1|C-1",
      movementId: "M-AMBIGUOUS-EUR-AMOUNT",
      amount: "not-a-number",
      currencyCode: "EUR",
      referenceExact: true,
      directionVerified: true,
      amountVerified: true,
    },
    {
      invoiceKey: "17|F-1|C-1",
      movementId: "M-AMBIGUOUS-EUR-EVIDENCE",
      amount: 100,
      currencyCode: "EUR",
      referenceExact: true,
      directionVerified: true,
      amountVerified: false,
    },
    [
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-AMBIGUOUS-EUR-DUPLICATE",
        amount: 100,
        currencyCode: "EUR",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
      {
        invoiceKey: "17|F-1|C-1",
        movementId: "M-AMBIGUOUS-EUR-DUPLICATE",
        amount: 101,
        currencyCode: "EUR",
        referenceExact: true,
        directionVerified: true,
        amountVerified: true,
      },
    ],
  ];

  for (const ambiguous of ambiguousEurCases) {
    const candidates = Array.isArray(ambiguous) ? [validTry, ...ambiguous] : [validTry, ambiguous];
    for (const ordered of [candidates, [...candidates].reverse()]) {
      const result = buildSettlementEvidence({
        invoices: [{ ...invoice, currencyCode: "TRY" }],
        settlementCandidates: ordered,
      });

      assert.equal(result.rows[0].settlementStatus, "candidate");
      assert.equal(result.rows[0].confirmedSettlementAmount, null);
      assert.equal(result.rows[0].candidateSettlementAmount, null);
    }
  }
});
