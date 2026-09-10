import crypto from "node:crypto";
import { capabilitiesForRole } from "./capabilities.mjs";

function cookieValue(request, name) {
  const item = String(request.headers.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(value, secret) { return crypto.createHmac("sha256", secret).update(value).digest("base64url"); }

export function createAuth({ secret = process.env.NEXUS_SESSION_SECRET, username = process.env.NEXUS_ADMIN_USERNAME || "yonetici", passwordHash = process.env.NEXUS_ADMIN_PASSWORD_SHA256, role = "admin", identityProvider, publicOrigin = process.env.NEXUS_PUBLIC_ORIGIN || "", now = () => Date.now(), maxLoginAttempts = 5, loginWindowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000 } = {}) {
  if (!secret) throw new Error("NEXUS_SESSION_SECRET zorunludur.");
  const configuredUsername = String(username).trim().toLowerCase();
  const provider = identityProvider || (
    configuredUsername && passwordHash
      ? { authenticate: ({ username: candidate, password }) => {
        const hash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
        return candidate === configuredUsername && safeEqual(hash, passwordHash)
          ? { username: configuredUsername, displayName: "Yönetici", role }
          : null;
      } }
      : null
  );
  if (!provider || typeof provider.authenticate !== "function") {
    throw new Error("Kimlik sağlayıcı yapılandırılmalıdır.");
  }
  const sessionName = "nexus_session"; const csrfName = "nexus_csrf";
  const loginAttempts = new Map();
  const cookie = (name, value, httpOnly, secure, maxAge = null) => `${name}=${encodeURIComponent(value)}; Path=/;${httpOnly ? " HttpOnly;" : ""} SameSite=Strict${secure ? " Secure;" : ""}${maxAge == null ? "" : ` Max-Age=${maxAge};`}`;
  const csrfMatches = (request) => Boolean(cookieValue(request, csrfName) && cookieValue(request, csrfName) === request.headers["x-csrf-token"]);
  const originMatches = (request) => !publicOrigin || request.headers.origin === publicOrigin;
  const read = (request) => {
    const [payload, signature] = cookieValue(request, sessionName).split(".");
    if (!payload || !safeEqual(signature, sign(payload, secret))) return null;
    try { const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return value.exp > now() ? value : null; } catch { return null; }
  };
  const finishLogin = (request, response, identity) => {
    if (!identity || !identity.username || !identity.role) return response.status(401).json({ error: "Kullanıcı adı veya parola hatalı." });
    const capabilities = capabilitiesForRole(identity.role);
    const payload = Buffer.from(JSON.stringify({ username: identity.username, displayName: identity.displayName || identity.username, role: identity.role, capabilities, exp: now() + 8 * 60 * 60 * 1000 })).toString("base64url");
    const csrf = crypto.randomBytes(24).toString("base64url"); const secure = request.secure || request.headers["x-forwarded-proto"] === "https";
    response.setHeader("Set-Cookie", [cookie(sessionName, `${payload}.${sign(payload, secret)}`, true, secure, 8 * 60 * 60), cookie(csrfName, csrf, false, secure, 8 * 60 * 60)]);
    return response.json({ username: identity.username, displayName: identity.displayName || identity.username, role: identity.role, capabilities, csrfToken: csrf });
  };
  const loginKey = (request, candidate) => `${request.ip || request.socket?.remoteAddress || "unknown"}:${candidate}`;
  const pruneLoginAttempts = (timestamp) => {
    for (const [key, attempt] of loginAttempts) {
      if (timestamp - attempt.firstAttemptAt > loginWindowMs && timestamp - attempt.lastFailureAt > lockoutMs) loginAttempts.delete(key);
    }
  };
  const failedLogin = (response, key, timestamp) => {
    const attempt = loginAttempts.get(key) || { count: 0, firstAttemptAt: timestamp, lastFailureAt: timestamp };
    if (timestamp - attempt.firstAttemptAt > loginWindowMs) {
      attempt.count = 0;
      attempt.firstAttemptAt = timestamp;
    }
    attempt.count += 1;
    attempt.lastFailureAt = timestamp;
    loginAttempts.set(key, attempt);
    if (attempt.count > maxLoginAttempts) return response.status(429).json({ error: "Çok fazla başarısız giriş denemesi. Daha sonra tekrar deneyin." });
    return response.status(401).json({ error: "Kullanıcı adı veya parola hatalı." });
  };
  const login = (request, response) => {
    const candidate = String(request.body?.username || "").trim().toLowerCase();
    const timestamp = now();
    pruneLoginAttempts(timestamp);
    const key = loginKey(request, candidate);
    const existing = loginAttempts.get(key);
    if (existing && existing.count > maxLoginAttempts && timestamp - existing.lastFailureAt <= lockoutMs) {
      return response.status(429).json({ error: "Çok fazla başarısız giriş denemesi. Daha sonra tekrar deneyin." });
    }
    let result;
    try {
      result = provider.authenticate({ username: candidate, password: String(request.body?.password || "") });
    } catch {
      return response.status(503).json({ error: "Kimlik doğrulama şu anda kullanılamıyor." });
    }
    const complete = (identity) => {
      if (!identity) return failedLogin(response, key, timestamp);
      loginAttempts.delete(key);
      return finishLogin(request, response, identity);
    };
    if (result && typeof result.then === "function") {
      return result.then(complete).catch(() => response.status(503).json({ error: "Kimlik doğrulama şu anda kullanılamıyor." }));
    }
    return complete(result);
  };
  const middleware = (request, response, next) => {
    if (request.path === "/api/session/login") return next();
    const user = read(request); if (!user) return response.status(401).json({ error: "Oturum gerekli." });
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && (!csrfMatches(request) || !originMatches(request))) return response.status(403).json({ error: "CSRF veya Origin doğrulaması başarısız." });
    request.user = user; request.nexusUser = user; return next();
  };
  const logout = (request, response) => {
    const secure = request.secure || request.headers["x-forwarded-proto"] === "https";
    return response.setHeader("Set-Cookie", clearCookies(secure)).json({ loggedOut: true });
  };
  const clearCookies = (secure = false) => [cookie(sessionName, "", true, secure, 0), cookie(csrfName, "", false, secure, 0)];
  return { login, logout, read, middleware, sessionName, csrfName, csrfMatches, originMatches, clearCookies };
}
