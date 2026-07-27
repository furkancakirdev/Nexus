const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000;

function assertYear(year) {
  const normalized = Number(year);
  if (!Number.isInteger(normalized)) throw new TypeError("Ledger yılı tam sayı olmalı.");
  return normalized;
}

function cacheResult(state, status, currentTime) {
  return {
    value: state.value,
    ledgerVersion: state.ledgerVersion,
    generatedAt: state.generatedAt,
    cache: {
      status,
      ageMs: Math.max(0, currentTime - state.loadedAt),
      error: state.error?.message || null,
    },
  };
}

/**
 * Yıl bazında tek uçuşlu, stale-while-revalidate ledger önbelleği oluşturur.
 *
 * @param {Object} options
 * @param {(year: number) => Promise<Object|null>} options.loadYear
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxStaleMs]
 * @param {() => number} [options.now]
 */
export function createLedgerService({
  loadYear,
  ttlMs = DEFAULT_TTL_MS,
  maxStaleMs = DEFAULT_MAX_STALE_MS,
  now = Date.now,
} = {}) {
  if (typeof loadYear !== "function") throw new TypeError("loadYear işlevi zorunludur.");
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new TypeError("ttlMs sıfır veya pozitif olmalı.");
  if (!Number.isFinite(maxStaleMs) || maxStaleMs < ttlMs) {
    throw new TypeError("maxStaleMs, ttlMs değerinden küçük olamaz.");
  }

  const states = new Map();
  let versionSequence = 0;

  function stateFor(year) {
    if (!states.has(year)) {
      states.set(year, {
        hasValue: false,
        value: null,
        loadedAt: 0,
        generatedAt: null,
        ledgerVersion: null,
        promise: null,
        error: null,
      });
    }
    return states.get(year);
  }

  function startLoad(year, state) {
    if (state.promise) return state.promise;

    state.promise = Promise.resolve()
      .then(() => loadYear(year))
      .then((value) => {
        const loadedAt = now();
        versionSequence += 1;
        state.hasValue = true;
        state.value = value;
        state.loadedAt = loadedAt;
        state.generatedAt = new Date(loadedAt).toISOString();
        state.ledgerVersion = `${year}:${loadedAt}:${versionSequence}`;
        state.error = null;
        return state;
      })
      .catch((error) => {
        state.error = error instanceof Error ? error : new Error(String(error));
        throw state.error;
      })
      .finally(() => {
        state.promise = null;
      });

    return state.promise;
  }

  async function get(yearValue, { refresh = false } = {}) {
    const year = assertYear(yearValue);
    const state = stateFor(year);

    if (refresh) {
      await startLoad(year, state);
      return cacheResult(state, state.hasValue ? "refresh" : "miss", now());
    }

    if (!state.hasValue) {
      await startLoad(year, state);
      return cacheResult(state, "miss", now());
    }

    const currentTime = now();
    const ageMs = Math.max(0, currentTime - state.loadedAt);
    if (ageMs <= ttlMs) return cacheResult(state, "hit", currentTime);

    if (ageMs <= maxStaleMs) {
      startLoad(year, state).catch(() => {});
      return cacheResult(state, "stale-refreshing", currentTime);
    }

    await startLoad(year, state);
    return cacheResult(state, "refresh", now());
  }

  function invalidate(yearValue) {
    if (yearValue === undefined || yearValue === null) {
      states.clear();
      return;
    }
    states.delete(assertYear(yearValue));
  }

  async function prewarm(yearValues) {
    const years = [...new Set((yearValues || []).map(assertYear))];
    return Promise.all(years.map(async (year) => {
      try {
        const result = await get(year);
        return { year, status: "fulfilled", value: result };
      } catch (reason) {
        return { year, status: "rejected", reason };
      }
    }));
  }

  return { get, invalidate, prewarm };
}
