/**
 * Salt-okunur CPM kanıt okumalarını tek bir transaction kapsamına alır.
 *
 * Bu yardımcı commit sunmaz. Okuma başarılı olsa bile transaction rollback ile
 * kapatılır; amaç yalnızca aynı bağlantı/snapshot içindeki sonuçları birlikte
 * değerlendirmektir.
 */
export async function withReadOnlyCpmTransaction({
  transactionFactory,
  executeRead,
  run,
  isolationLevel = "read committed",
} = {}) {
  if (typeof transactionFactory !== "function") {
    throw new TypeError("transactionFactory gerekli.");
  }
  if (typeof executeRead !== "function") {
    throw new TypeError("executeRead gerekli.");
  }
  if (typeof run !== "function") {
    throw new TypeError("run gerekli.");
  }

  const transaction = await transactionFactory();
  if (!transaction || typeof transaction.begin !== "function"
    || typeof transaction.request !== "function") {
    throw new TypeError("Geçerli bir CPM transaction nesnesi gerekli.");
  }

  let began = false;
  try {
    await transaction.begin(isolationLevel);
    began = true;
    const request = transaction.request();
    return await run({
      request,
      execute: ({ queryId, query }) => executeRead({ request, queryId, query }),
    });
  } finally {
    if (began && typeof transaction.rollback === "function") {
      try {
        await transaction.rollback();
      } catch {
        // Asıl okuma/transform hatasını cleanup hatasıyla gölgeleme.
      }
    }
    if (typeof transaction.close === "function") await transaction.close();
  }
}
