const MAX_PATH_LENGTH = 120;

function safePath(value) {
  const path = String(value || "unknown").split("?")[0];
  return path.length > MAX_PATH_LENGTH ? path.slice(0, MAX_PATH_LENGTH) : path;
}

export function createObservability({ now = () => Date.now() } = {}) {
  const startedAt = now();
  const requestCounts = new Map();
  const latency = [];
  const authFailures = { total: 0 };
  const dependencyFailures = { cpm: 0 };

  function increment(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  return {
    startedAt,
    recordRequest({ method, path, status, durationMs }) {
      const route = `${String(method || "GET").toUpperCase()} ${safePath(path)}`;
      increment(requestCounts, `${route} ${status}`);
      latency.push(Number.isFinite(durationMs) ? durationMs : 0);
      if (latency.length > 1000) latency.shift();
      if (status === 401 || status === 403) authFailures.total += 1;
    },
    recordDependencyFailure(name = "cpm") {
      if (name === "cpm") dependencyFailures.cpm += 1;
    },
    snapshot({ cpm = {} } = {}) {
      return {
        uptimeSeconds: Math.max(0, Math.floor((now() - startedAt) / 1000)),
        requests: Object.fromEntries(requestCounts),
        authFailures: { total: authFailures.total },
        dependencyFailures: { ...dependencyFailures },
        cpm: {
          configured: cpm.configured === true,
          connected: cpm.connected === true,
          readOnly: cpm.readOnly === true,
        },
        latencyMs: {
          samples: latency.length,
          max: latency.length ? Math.max(...latency) : 0,
        },
      };
    },
  };
}

export function installObservability(app, metrics) {
  app.use((request, response, next) => {
    const started = process.hrtime.bigint();
    response.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      metrics.recordRequest({
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs,
      });
    });
    next();
  });
}
