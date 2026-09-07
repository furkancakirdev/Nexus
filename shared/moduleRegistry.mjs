/** Marlin Nexus'ta canlı/pilot görünürlüğü için ortak modül sözleşmesi. */
export const MODULE_REGISTRY = Object.freeze([
  Object.freeze({ page: "summary", label: "Genel Bakış", requiredCapability: "reporting:read", active: true }),
  Object.freeze({ page: "sales", label: "Satış Analizi", requiredCapability: "reporting:read", active: true }),
  Object.freeze({ page: "departments", label: "Departman Analizi", requiredCapability: "reporting:read", active: true }),
  Object.freeze({ page: "audit", label: "Denetim", requiredCapability: "reporting:read", active: true }),
  Object.freeze({ page: "inventory", label: "Stok", requiredCapability: "operations:read", active: true }),
  Object.freeze({ page: "ledger", label: "Havuz", requiredCapability: "reporting:read", active: true }),
  Object.freeze({ page: "settings", label: "Ayarlar", requiredCapability: "settings:manage", active: true }),
]);

export function modulesForCapabilities(capabilities = []) {
  const allowed = new Set(Array.isArray(capabilities) ? capabilities : []);
  return MODULE_REGISTRY.filter((module) => module.active && allowed.has(module.requiredCapability));
}
