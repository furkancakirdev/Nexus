import { MODULE_REGISTRY } from "../shared/moduleRegistry.mjs";

export const CLIENT_CAPABILITIES = Object.freeze({
  REPORTING_READ: "reporting:read",
  OPERATIONS_READ: "operations:read",
  APPROVALS_MANAGE: "approvals:manage",
  SETTINGS_MANAGE: "settings:manage",
});

// Envanter araştırması route sözleşmesi: page: "inventory", label: "Stok".
export const NAV_ITEMS = Object.freeze(MODULE_REGISTRY.filter((item) => item.active));

export function resolveRequestedPage(requestedPage, preferredPage = "summary") {
  const availablePages = new Set(NAV_ITEMS.map((item) => item.page));
  if (availablePages.has(requestedPage)) return requestedPage;
  if (availablePages.has(preferredPage)) return preferredPage;
  return NAV_ITEMS[0]?.page || null;
}

export function hasCapability(user, capability) {
  return user?.role === "admin"
    || (Array.isArray(user?.capabilities) && user.capabilities.includes(capability));
}

export function navItemsFor(user) {
  return NAV_ITEMS.filter((item) => hasCapability(user, item.requiredCapability));
}

export function canAccessPage(user, page) {
  return navItemsFor(user).some((item) => item.page === page);
}

export function firstAccessiblePage(user, requestedPage) {
  const visible = navItemsFor(user);
  return visible.find((item) => item.page === requestedPage)?.page || visible[0]?.page || null;
}

export function overviewStateForResponse({ ok, status, payload }) {
  if (!ok) {
    return {
      rows: [],
      eurRateSets: {},
      canonicalMetric: null,
      mode: status === 401 || status === 403 ? "blocked" : "error",
      error: status === 401 || status === 403
        ? "Bu veriyi görme yetkiniz yok."
        : "Yönetici özeti verileri okunamadı.",
    };
  }
  if (!Array.isArray(payload?.rows)) {
    return {
      rows: [],
      eurRateSets: {},
      canonicalMetric: null,
      mode: "empty",
      error: "Yönetici özeti verisi bulunamadı.",
    };
  }
  return {
    rows: payload.rows,
    eurRateSets: payload.eurRateSets || {},
    canonicalMetric: payload.canonicalMetric || null,
    mode: payload.rows.length ? payload.mode || "live" : "empty",
    error: null,
  };
}

export function createIdempotentOpenGuard() {
  let open = false;
  return {
    open() {
      if (open) return false;
      open = true;
      return true;
    },
    close() {
      open = false;
    },
    isOpen() {
      return open;
    },
  };
}

export function sessionViewFor(session) {
  if (session?.status === "authenticated" && session.user) return "app";
  if (session?.status === "unauthenticated") return "login";
  return "loading";
}
