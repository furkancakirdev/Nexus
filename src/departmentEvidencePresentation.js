export const DOCUMENT_TYPE_LABELS = Object.freeze({
  13: "Teklif",
  14: "Satış siparişi",
  15: "Satış irsaliyesi",
  17: "Satış faturası",
  18: "Satış iadesi",
  64: "Sipariş onay",
  85: "Nihai fatura",
  91: "Perakende satış",
});

const ACTOR_NAMES = Object.freeze({
  FURKAN: "Furkan Çakır",
  BCETINEL: "Burak Çetinel",
  MKARA: "Mehmet Kara",
  OGENCOGLU: "Özlenen Gençoğlu",
  TSEMIZ: "Tuğrul Semiz",
  AERIMLI: "Alperen Erimli",
  NTOKER: "N. Toker",
  BIRCAN: "Bircan Çolak",
  CBELIKIRIK: "Can Belikırık",
  CAN: "Can Belikırık",
  EERDOGAN: "Emre Erdoğan",
  EMRE: "Emre Erdoğan",
});

export function normalizeActorCode(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function actorDisplayName(code, preferredName) {
  const normalized = normalizeActorCode(code);
  if (!normalized) return "Belirsiz aktör";
  if (preferredName && preferredName !== "Belirsiz") return preferredName;
  return ACTOR_NAMES[normalized] || `Tanımsız kullanıcı (${normalized})`;
}

export function documentTypeLabel(documentType) {
  return DOCUMENT_TYPE_LABELS[Number(documentType)] || "Bağlı evrak";
}
