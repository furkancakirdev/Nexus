import crypto from "node:crypto";

const CORRELATION_HEADER = "x-correlation-id";
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function correlationId(request) {
  const supplied = String(request.headers?.[CORRELATION_HEADER] || "").trim();
  return SAFE_ID.test(supplied) ? supplied : crypto.randomUUID();
}

export function logDiagnostic(level, event, { request, error, correlation } = {}) {
  const payload = {
    event,
    correlationId: correlation || request?.correlationId || null,
    method: request?.method,
    path: request?.path,
    status: request?.res?.statusCode >= 400 ? request.res.statusCode : (error ? 500 : request?.res?.statusCode),
    errorType: error?.name || (error ? typeof error : undefined),
  };
  const logger = level === "warn" ? console.warn : console.error;
  logger(JSON.stringify(payload));
}

export function errorResponse(response, { status = 500, code = "INTERNAL_ERROR", correlationId: id } = {}) {
  return response.status(status).json({ error: { code, message: "Beklenmeyen bir sunucu hatası oluştu.", correlationId: id || null } });
}

export function installDiagnostics(app) {
  app.use((request, response, next) => {
    const id = correlationId(request);
    request.correlationId = id;
    response.setHeader("X-Correlation-Id", id);
    next();
  });
}

export function installErrorHandler(app) {
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    logDiagnostic("error", "unhandled-request-error", { request, error });
    if (request.path.startsWith("/api/")) return errorResponse(response, { correlationId: request.correlationId });
    return response.status(500).send("Beklenmeyen bir sunucu hatası oluştu.");
  });
}
