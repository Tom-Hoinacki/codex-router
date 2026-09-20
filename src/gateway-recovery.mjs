import { sleep } from "./upstream-retry.mjs";

function refused(error) {
  for (let depth = 0; error && depth < 8; depth++, error = error.cause) {
    if (error.code === "ECONNREFUSED") return true;
  }
  return false;
}

// Only a refused local connect is replayable here: no request reached the
// gateway. Never retry an HTTP error, a reset, or an already-started stream.
export async function fetchWithGatewayRecovery(url, init, {
  fetchImpl = fetch, probeFetch = fetch, healthUrl, budgetMs = 180_000, pollMs = 500,
  log = (message) => console.error(message),
} = {}) {
  const deadline = Date.now() + budgetMs;
  let announced = false;
  for (;;) {
    init.signal?.throwIfAborted();
    try { return await fetchImpl(url, init); }
    catch (error) {
      if (!refused(error) || Date.now() >= deadline || init.signal?.aborted) throw error;
      if (!announced) {
        log("[codex-router] gateway connection refused; waiting for local readiness before delivery");
        announced = true;
      }
      for (;;) {
        await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())), init.signal);
        init.signal?.throwIfAborted();
        if (Date.now() >= deadline) throw error;
        try {
          const timeout = AbortSignal.timeout(Math.max(1, Math.min(2_000, deadline - Date.now())));
          const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
          const probe = await probeFetch(healthUrl, { signal });
          await probe.body?.cancel();
          if (probe.ok) break;
        } catch { /* the supervisor is still replacing the gateway */ }
      }
    }
  }
}
