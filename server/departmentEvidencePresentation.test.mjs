import assert from "node:assert/strict";
import test from "node:test";

import {
  actorDisplayName,
  documentTypeLabel,
} from "../src/departmentEvidencePresentation.js";
import { DEFAULT_IDENTITIES } from "./ownershipResolver.mjs";

test("CPM satış zinciri belge türlerini doğru adlandırır", () => {
  assert.equal(documentTypeLabel(13), "Teklif");
  assert.equal(documentTypeLabel(14), "Satış siparişi");
  assert.equal(documentTypeLabel(15), "Satış irsaliyesi");
  assert.equal(documentTypeLabel(17), "Satış faturası");
  assert.equal(documentTypeLabel(18), "Satış iadesi");
  assert.equal(documentTypeLabel(64), "Sipariş onay");
  assert.equal(documentTypeLabel(85), "Nihai fatura");
  assert.equal(documentTypeLabel(91), "Perakende satış");
  assert.equal(documentTypeLabel(999), "Bağlı evrak");
});

test("ticari ve muhasebe aktörlerini tam isimle gösterir", () => {
  assert.equal(actorDisplayName("CAN"), "Can Belikırık");
  assert.equal(actorDisplayName("CBELIKIRIK"), "Can Belikırık");
  assert.equal(actorDisplayName("EMRE"), "Emre Erdoğan");
  assert.equal(actorDisplayName("EERDOGAN"), "Emre Erdoğan");
  assert.equal(actorDisplayName("BIRCAN"), "Bircan Çolak");
  assert.equal(actorDisplayName("bilinmeyen"), "Tanımsız kullanıcı (BILINMEYEN)");
  assert.equal(actorDisplayName(""), "Belirsiz aktör");
});

test("arayüzdeki bilinen aktör isimleri sunucu kimlik kaydıyla aynı kalır", () => {
  for (const [code, identity] of Object.entries(DEFAULT_IDENTITIES)) {
    assert.equal(actorDisplayName(code), identity.name, code);
  }
});
