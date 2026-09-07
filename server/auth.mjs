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

export function createAuth({ secret = process.env.NEXUS_SESSION_SECRET, username = process.env.NEXUS_ADMIN_USERNAME || "yonetici", passwordHash = process.env.NEXUS_ADMIN_PASSWORD_SHA256, role = "admin", identityProvider, publicOrigin = process.env.NEXUS_PUBLIC_ORIGIN || "" } = {}) {
  if (!secret) throw new Error("NEXUS_SESSION_SECRET zorunludur.");
  const provider = identityProvider || (
    username && passwordHash
      ? { authenticate: ({ username: candidate, password }) => {
        const hash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
        return candidate === username && safeEqual(hash, passwordHash)
          ? { username, displayName: "Yönetici", role }
          : null;
      } }
      : null
  );
  if (!provider || typeof provider.authenticate !== "function") {
    throw new Error("Kimlik sağlayıcı yapılandırılmalıdır.");
  }
  const sessionName = "nexus_session"; const csrfName = "nexus_csrf";
  const cookie = (name, value, httpOnly, secure, maxAge = null) => `${name}=${encodeURIComponent(value)}; Path=/;${httpOnly ? " HttpOnly;" : ""} SameSite=Strict${secure ? " Secure;" : ""}${maxAge == null ? "" : ` Max-Age=${maxAge};`}`;
  const csrfMatches = (request) => Boolean(cookieValue(request, csrfName) && cookieValue(request, csrfName) === request.headers["x-csrf-token"]);
  const originMatches = (request) => !publicOrigin || request.headers.origin === publicOrigin;
  const read = (request) => {
    const [payload, signature] = cookieValue(request, sessionName).split(".");
    if (!payload || !safeEqual(signature, sign(payload, secret))) return null;
    try { const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); return value.exp > Date.now() ? value : null; } catch { return null; }
  };
  const finishLogin = (request, response, identity) => {
    if (!identity || !identity.username || !identity.role) return response.status(401).json({ error: "Kullanıcı adı veya parola hatalı." });
    const capabilities = capabilitiesForRole(identity.role);
    const payload = Buffer.from(JSON.stringify({ username: identity.username, displayName: identity.displayName || identity.username, role: identity.role, capabilities, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
    const csrf = crypto.randomBytes(24).toString("base64url"); const secure = request.secure || request.headers["x-forwarded-proto"] === "https";
    response.setHeader("Set-Cookie", [cookie(sessionName, `${payload}.${sign(payload, secret)}`, true, secure, 8 * 60 * 60), cookie(csrfName, csrf, false, secure, 8 * 60 * 60)]);
    return response.json({ username: identity.username, displayName: identity.displayName || identity.username, role: identity.role, capabilities, csrfToken: csrf });
  };
  const login = (request, response) => {
    const candidate = String(request.body?.username || "").trim().toLocaleLowerCase("tr-TR");
    const result = provider.authenticate({ username: candidate, password: String(request.body?.password || "") });
    if (result && typeof result.then === "function") {
      return result.then((identity) => identity
        ? finishLogin(request, response, identity)
        : response.status(401).json({ error: "Kullanıcı adı veya parola hatalı." }));
    }
    return result
      ? finishLogin(request, response, result)
      : response.status(401).json({ error: "Kullanıcı adı veya parola hatalı." });
  };
  const middleware = (request, response, next) => {
    if (request.path === "/api/session/login") return next();
    const user = read(request); if (!user) return response.status(401).json({ error: "Oturum gerekli." });
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && (!csrfMatches(request) || !originMatches(request))) return response.status(403).json({ error: "CSRF veya Origin doğrulaması başarısız." });
    request.user = user; request.nexusUser = user; return next();
  };
  const logout = (_request, response) => response.setHeader("Set-Cookie", clearCookies()).json({ loggedOut: true });
  const clearCookies = (secure = false) => [cookie(sessionName, "", true, secure, 0), cookie(csrfName, "", false, secure, 0)];
  return { login, logout, read, middleware, sessionName, csrfName, csrfMatches, originMatches, clearCookies };
}
