import test from "node:test";
import assert from "node:assert/strict";
import { cpmMovementCandidateSql, dvzharRateCandidateSql, stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stkkrtPriceCandidateSql, stksymDevirSampleSql, stksymDevirSummarySql, stksymStkhArMatchSummarySql } from "./inventoryOpeningResearchSql.mjs";

test("inventory opening research SQL is bounded, parameterized, and read-only", () => {
  for (const query of [stkhArType81SampleSql, stkhArType81SummarySql, stkhArType82SampleSql, stkhArType82SummarySql, stksymDevirSampleSql, stksymDevirSummarySql, stksymStkhArMatchSummarySql]) {
    assert.match(query, /SELECT/i);
    assert.doesNotMatch(query, /OPENJSON|STRING_AGG|UPDATE|DELETE|INSERT|MERGE|EXEC/i);
    assert.match(query, /@company/);
    assert.match(query, /@startDate/);
    assert.match(query, /@endDate/);
  }
  assert.match(stkhArType82SampleSql, /TOP\s*\(@sampleLimit\)/i);
  assert.match(stkhArType82SampleSql, /EVRAKTIP\s*=\s*@documentType/i);
  assert.match(stkhArType82SummarySql, /COUNT_BIG\(\*\)\s+AS\s+\[rowCount\]/i);
  assert.match(stkhArType81SampleSql, /EVRAKTIP\s*=\s*@documentType81/i);
  assert.match(stkhArType81SummarySql, /EVRAKTIP\s*=\s*@documentType81/i);
  assert.match(stksymDevirSampleSql, /MKOD4\s*=\s*@sourceKind/i);
  assert.match(stksymDevirSummarySql, /COUNT_BIG\(\*\)\s+AS\s+\[rowCount\]/i);
  assert.match(stksymStkhArMatchSummarySql, /WITH\s+sym\s+AS/i);
  assert.match(stksymStkhArMatchSummarySql, /h\.productCode\s*=\s*s\.productCode/i);
  assert.match(stksymStkhArMatchSummarySql, /h\.depotCode\s*=\s*s\.depotCode/i);
  assert.match(stksymStkhArMatchSummarySql, /h\.GIRISCIKIS\s+directionCode/i);
  assert.match(stksymStkhArMatchSummarySql, /@sourceKind/i);
});

test("CPM hareket aday sorgusu WAC kaynağı için sabit alanları ve belge türlerini taşır", () => {
  assert.match(cpmMovementCandidateSql, /SELECT/i);
  assert.doesNotMatch(cpmMovementCandidateSql, /OPENJSON|STRING_AGG|UPDATE|DELETE|INSERT|MERGE|EXEC/i);
  for (const field of ["h.ID id", "h.MALKOD productCode", "h.EVRAKTARIH movementDate", "h.EVRAKTIP documentType", "h.MIKTAR", "h.TUTAR", "h.ISKONTO", "h.BIRIMFIYAT", "h.FIYATDOVIZCINS", "h.FIYATDOVIZKUR", "h.DOVIZCINS", "h.DOVIZKUR", "transactionCurrency", "transactionCurrencyRate", "h.DEPOKOD depotCode", "h.EVRAKNO documentNumber", "h.SIRANO lineNumber", "h.SONKAYNAKEVRAKTIP sourceDocumentType", "h.SONKAYNAKEVRAKNO sourceDocumentNumber", "h.SONKAYNAKSIRANO sourceLineNumber", "quantity", "grossAmount", "discountAmount", "unitPrice", "currency", "currencyRate"]) {
    assert.match(cpmMovementCandidateSql, new RegExp(field.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(cpmMovementCandidateSql, /NULLIF\(LTRIM\(RTRIM\(h\.DOVIZCINS\)\), ''\) currency/i);
  assert.doesNotMatch(cpmMovementCandidateSql, /ISNULL\(h\.DOVIZKUR, 1\).*currencyRate/i);
  for (const parameter of ["@company", "@movementStartDate", "@endDate", "@openingDocumentType", "@purchaseDocumentType", "@purchase609DocumentType", "@sale17DocumentType", "@sale85DocumentType", "@sale91DocumentType", "@returnDocumentType"]) {
    assert.match(cpmMovementCandidateSql, new RegExp(parameter.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i"));
  }
  assert.match(cpmMovementCandidateSql, /EVRAKTIP\s+IN\s*\(/i);
});

test("DVZHAR kur aday sorgusu banka, tarih, döviz ve kur tipini parametreler", () => {
  assert.match(dvzharRateCandidateSql, /SELECT/i);
  assert.doesNotMatch(dvzharRateCandidateSql, /OPENJSON|UPDATE|DELETE|INSERT|MERGE|EXEC/i);
  for (const field of ["h.ID", "h.BANKA", "h.DOVIZTIP", "h.DOVIZTARIH", "h.DOVIZCINS", "h.DOVIZKUR"]) assert.match(dvzharRateCandidateSql, new RegExp(field, "i"));
  for (const parameter of ["@bankCode", "@rateType0", "@rateType1", "@startDate", "@endDate"]) assert.match(dvzharRateCandidateSql, new RegExp(parameter.replace("@", "\\@"), "i"));
  assert.match(dvzharRateCandidateSql, /BNKKRT/i);
  assert.match(dvzharRateCandidateSql, /BANKAAD\s+bankName/i);
});

test("tarihsel fiyat aday sorgusu aktif ve denetim kaynaklarını KDV hariç taşır", () => {
  assert.match(stkkrtPriceCandidateSql, /SELECT/i);
  assert.doesNotMatch(stkkrtPriceCandidateSql, /\bOPENJSON\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bMERGE\b|\bEXEC(?:UTE)?\b/i);
  for (const field of ["FYTKRT", "MIRFYTKRT", "f.STOKKOD", "s.MKOD2", "f.FIYAT", "f.DOVIZCINS", "f.KDVDH", "m.UPDATESTATUS", "m.CHANGEDATE", "validUntil"]) assert.match(stkkrtPriceCandidateSql, new RegExp(field, "i"));
  for (const parameter of ["@company", "@startDate", "@endDate"]) assert.match(stkkrtPriceCandidateSql, new RegExp(parameter.replace("@", "\\@"), "i"));
});

test("tarihsel fiyat adayı aktif kart ve değişiklik geçmişini KDV hariç olarak dönemler", () => {
  assert.match(stkkrtPriceCandidateSql, /FYTKRT/i);
  assert.match(stkkrtPriceCandidateSql, /MIRFYTKRT/i);
  assert.match(stkkrtPriceCandidateSql, /UPDATESTATUS\s*=\s*0/i);
  assert.match(stkkrtPriceCandidateSql, /KDVDH\s*=\s*0/i);
  assert.match(stkkrtPriceCandidateSql, /validUntil/i);
  assert.match(stkkrtPriceCandidateSql, /@startDate/i);
  assert.match(stkkrtPriceCandidateSql, /@endDate/i);
});

test("açılış sorgusu eksik maliyet, para birimi ve kaynak satırını sıfıra zorlamaz", () => {
  for (const field of ["unitCost", "priceCurrency", "transactionCurrency", "costSourceCode", "costSourceLine", "sourceDocumentType", "sourceDocumentNumber", "sourceLineNumber"]) {
    assert.match(stkhArType82SampleSql, new RegExp(field, "i"));
  }
  assert.match(stkhArType82SampleSql, /NULLIF\(CAST\(h\.BIRIMFIYAT\s+AS\s+decimal/i);
  assert.match(stkhArType82SampleSql, /NULLIF\(LTRIM\(RTRIM\(h\.FIYATDOVIZCINS\)/i);
  assert.match(stkhArType82SummarySql, /positiveUnitCostCount/i);
  assert.match(stkhArType82SummarySql, /zeroOrMissingUnitCostCount/i);
  assert.match(stkhArType82SummarySql, /costLineagePresentCount/i);
  assert.doesNotMatch(stkhArType82SampleSql, /ISNULL\(h\.BIRIMFIYAT,\s*0\)/i);
  assert.doesNotMatch(stkhArType82SampleSql, /ISNULL\(h\.FIYATDOVIZKUR,\s*1\)/i);
});
