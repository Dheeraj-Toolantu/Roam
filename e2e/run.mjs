/**
 * Builds the web app against the emulators (if needed) and runs the E2E flows
 * inside `firebase emulators:exec` so every run starts from an empty backend.
 *
 *   npm run test:e2e            # build + run
 *   E2E_SKIP_BUILD=1 npm run test:e2e
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const sh = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

if (!process.env.E2E_SKIP_BUILD || !existsSync(`${root}/dist/index.html`)) {
  sh('npx expo export --platform web --clear', { EXPO_PUBLIC_USE_EMULATORS: '1', EXPO_OFFLINE: '1' });
}
sh('npm --prefix functions run build');
sh(`npx firebase emulators:exec --project demo-roam --only auth,firestore,functions,storage "node e2e/flows.mjs"`, {
  NODE_OPTIONS: `--require ${root}scripts/loopback-no-proxy.cjs`,
});
