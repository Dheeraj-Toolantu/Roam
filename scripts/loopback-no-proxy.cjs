/**
 * firebase-tools routes *every* request through HTTPS_PROXY when it is set and
 * ignores NO_PROXY, including emulator-to-emulator calls on 127.0.0.1. In
 * environments with a mandatory egress proxy that breaks the Functions
 * emulator (trigger registration is rejected by the proxy).
 *
 * This preload restores standard NO_PROXY semantics for loopback hosts only:
 * requests to localhost / 127.0.0.1 / ::1 go direct, everything else still uses
 * the configured proxy. It is a no-op when no proxy is configured.
 *
 * Used via NODE_OPTIONS="--require ./scripts/loopback-no-proxy.cjs" in the
 * emulator npm scripts.
 */
const path = require('path');

if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const patch = (undici) => {
    if (!undici || !undici.ProxyAgent || undici.ProxyAgent.__roamLoopbackPatched) return;
    const Original = undici.ProxyAgent;
    const direct = new undici.Agent();
    class LoopbackAwareProxyAgent extends Original {
      dispatch(opts, handler) {
        try {
          const host = new URL(opts.origin).hostname;
          if (LOOPBACK.has(host)) return direct.dispatch(opts, handler);
        } catch {
          /* fall through to proxy */
        }
        return super.dispatch(opts, handler);
      }
    }
    LoopbackAwareProxyAgent.__roamLoopbackPatched = true;
    try {
      undici.ProxyAgent = LoopbackAwareProxyAgent;
    } catch {
      /* read-only export; leave as-is */
    }
  };
  for (const base of [process.cwd(), path.join(process.cwd(), 'node_modules', 'firebase-tools')]) {
    try {
      patch(require(require.resolve('undici', { paths: [base] })));
    } catch {
      /* undici not resolvable from here */
    }
  }
}
