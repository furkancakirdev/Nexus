const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfToken() {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("nexus_csrf="))
    ?.slice("nexus_csrf=".length) || "";
}

/** Nexus API çağrılarını oturum ve CSRF sözleşmesiyle merkezileştirir. */
export async function apiFetch(input, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (MUTATING_METHODS.has(method)) headers.set("X-CSRF-Token", csrfToken());
  return fetch(input, {
    ...options,
    method,
    headers,
    credentials: options.credentials || "same-origin",
  });
}
