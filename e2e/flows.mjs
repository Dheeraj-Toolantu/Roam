/**
 * End-to-end test of the ROAM web build against the Firebase emulators.
 * Two users (Dheeraj & Priya) exercise the main BRD user journeys (§19).
 *
 * Expects: emulators running (auth, firestore, functions, storage) and the
 * web build in ./dist (EXPO_PUBLIC_USE_EMULATORS=1). Started by e2e/run.mjs.
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

// Use the project's Playwright if installed, otherwise the machine-wide one.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SHOTS = process.env.E2E_SHOTS || join(ROOT, 'e2e', 'screenshots');
const PORT = 8091;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(SHOTS, { recursive: true });

// ---------- static SPA server ----------
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = join(DIST, url);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ---------- helpers ----------
const results = [];
let failures = 0;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`  ✓ ${name} (${Date.now() - t}ms)`);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').slice(0, 4).join('\n    ')}`);
    throw e;
  }
}
const tid = (page, id) => page.getByTestId(id);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const text = (page, t, opts = {}) => page.getByText(t, { exact: opts.exact }).filter({ visible: true }).first().waitFor({ timeout: opts.timeout ?? 15_000 });

// tiny valid PNG (orange square) for photo uploads
function png() {
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set([249, 115 - y, 22 + x * 2, 255], y * (w * 4 + 1) + 1 + x * 4);
  }
  const crc = (buf) => {
    let c, crc = 0xffffffff;
    for (const b of buf) {
      c = (crc ^ b) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch();
const phone = devices['Pixel 7'];
const BAGA = { latitude: 15.5553, longitude: 73.7517 };
const consoleErrors = [];

async function newUser(label) {
  const context = await browser.newContext({ ...phone, permissions: ['geolocation'], geolocation: BAGA, locale: 'en-IN' });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  // Simulate environments that block browser popups (in-app browsers, embedded previews):
  // the app must use its own in-app dialogs, never window.confirm/alert.
  await page.addInitScript(() => {
    window.confirm = () => false;
    window.alert = () => {};
  });
  page.on('dialog', (d) => {
    consoleErrors.push(`[${label}] pageerror: native ${d.type()} dialog used: ${d.message().slice(0, 80)}`);
    void d.dismiss();
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Download the React DevTools|favicon/.test(m.text())) consoleErrors.push(`[${label}] ${m.text().slice(0, 200)}`);
  });
  return { context, page };
}

async function signUp(page, name, username, email, { fromOnboarding }) {
  await page.goto(BASE + '/');
  if (fromOnboarding) {
    await text(page, 'Turn Your Trips');
    await shot(page, '01-onboarding');
    await tid(page, 'onboarding-skip').click();
  } else {
    await page.goto(BASE + '/signup');
  }
  await tid(page, 'signup-name').waitFor();
  if (fromOnboarding) await shot(page, '02-signup');
  await tid(page, 'signup-name').fill(name);
  await tid(page, 'signup-email').fill(email);
  await tid(page, 'signup-password').fill('roam-pass-2026');
  await tid(page, 'signup-submit').click();
  await tid(page, 'setup-username').waitFor();
  await tid(page, 'setup-username').fill(username);
  await text(page, 'Available');
  await tid(page, 'setup-city').fill('Mumbai');
  if (fromOnboarding) await shot(page, '03-profile-setup');
  await tid(page, 'setup-submit').click();
  await text(page, `Hi ${name.split(' ')[0]}`);
}

let tripId = '';
let inviteCode = '';
try {
  console.log('\nROAM 2.0 – end-to-end (web build × Firebase emulators)\n');
  const A = await newUser('dheeraj');
  const B = await newUser('priya');
  const a = A.page;
  const b = B.page;
  globalThis.__pages = { dheeraj: a, priya: b };
  const run = Date.now().toString(36);

  await step('AC-001 Registration: onboarding → sign up → profile setup → home', async () => {
    await signUp(a, 'Dheeraj Vishwakarma', `dheeraj${run}`.slice(0, 20), `dheeraj.${run}@roam.test`, { fromOnboarding: true });
    await shot(a, '04-home');
  });

  await step('Live location: current location is detected automatically after sign-in', async () => {
    await a.getByTestId('location-label').filter({ visible: true }).first().waitFor();
    await a.waitForFunction(() => /Goa/.test(document.querySelector('[data-testid="location-label"]')?.textContent ?? ''), null, { timeout: 20_000 });
    await text(a, 'LIVE');
  });

  await step('Google Maps: Live Map renders a Google map that follows the live position', async () => {
    await tid(a, 'qa-live-map').click();
    await a.locator('[data-testid="google-map"] .gm-style').first().waitFor({ timeout: 30_000 });
    await a.waitForFunction(() => /Goa/.test(document.querySelector('[data-testid="current-place"]')?.textContent ?? ''), null, { timeout: 20_000 });
    const before = await tid(a, 'current-coords').textContent();
    await A.context.setGeolocation({ latitude: 15.5440, longitude: 73.7553, accuracy: 8 }); // move to Calangute
    await a.waitForFunction((b) => document.querySelector('[data-testid="current-coords"]')?.textContent !== b, before, { timeout: 15_000 });
    const after = await tid(a, 'current-coords').textContent();
    if (!after.startsWith('15.544')) throw new Error(`live position did not update: ${after}`);
    await a.waitForTimeout(1500);
    await shot(a, '04b-live-map');
    await A.context.setGeolocation(BAGA);
    await a.goto(BASE + '/');
  });

  await step('Bottom tab bar: tapping each tab navigates (real touch taps)', async () => {
    await a.goto(BASE + '/');
    await a.getByTestId('tab-explore').first().waitFor();
    const errorsBefore = consoleErrors.filter((e) => e.includes('pageerror')).length;
    for (const [tab, path] of [['explore', '/explore'], ['journeys', '/journeys'], ['crew', '/crew'], ['profile', '/profile'], ['index', '/'], ['capture', '/capture']]) {
      await a.getByTestId(`tab-${tab}`).filter({ visible: true }).first().tap();
      await a.waitForURL((u) => new URL(u).pathname === path, { timeout: 10_000 }).catch(() => {
        throw new Error(`tab-${tab} did not navigate to ${path} (at ${a.url()})`);
      });
    }
    if (consoleErrors.filter((e) => e.includes('pageerror')).length > errorsBefore) throw new Error('page error while tapping tabs');
    await a.getByTestId('tab-index').filter({ visible: true }).first().tap();
  });

  await step('Login/logout persists account', async () => {
    await signUp(b, 'Priya Sharma', `priya${run}`.slice(0, 20), `priya.${run}@roam.test`, { fromOnboarding: false });
  });

  await step('AC-002/003 Start journey with location permission; GPS points recorded and city detected', async () => {
    await tid(a, 'qa-start').click();
    await a.waitForFunction(() => /Starting from .*Goa/.test(document.querySelector('[data-testid="start-location"]')?.textContent ?? ''), null, { timeout: 15_000 });
    await tid(a, 'bg-unsupported').filter({ visible: true }).first().waitFor(); // web: explains background needs the mobile app
    await tid(a, 'journey-title').fill('Goa Trip 2026');
    await shot(a, '05-start-journey');
    await tid(a, 'start-journey').click();
    await text(a, 'Recording');
    await text(a, 'Recording while ROAM is open.');
    await a.locator('[data-testid="journey-map"] [data-testid="google-map"] .gm-style').first().waitFor({ timeout: 30_000 });
    // Simulate a ride south along the coast from Baga: ~150 m per fix every ~0.7 s.
    // (Bigger jumps would be rejected by the tracker's implausible-speed filter.)
    for (let i = 1; i <= 10; i++) {
      await A.context.setGeolocation({ latitude: BAGA.latitude - i * 0.00135, longitude: BAGA.longitude + i * 0.0002, accuracy: 10 });
      await a.waitForTimeout(700);
    }
    // city detected from GPS (header shows the city, title moves to the subtitle)
    await a.waitForFunction(() => /\b[1-9]\.\d km|\b0\.[1-9] km/.test(document.body.innerText), null, { timeout: 20_000 }).catch(async () => {
      throw new Error(`distance not recorded: ${(await a.innerText('body')).match(/[\d.]+ km/)?.[0]}`);
    });
    await a.getByText('Goa', { exact: true }).filter({ visible: true }).first().waitFor();
  });

  await step('AC-004 Manual activity appears on the timeline', async () => {
    await a.getByText('+ Add activity').click();
    await tid(a, 'activity-title').fill('Fort Aguada');
    await tid(a, 'activity-save').click();
    await text(a, 'Fort Aguada');
  });

  await step('AC-005 Capture: upload a photo to the active journey and share publicly', async () => {
    await tid(a, 'journey-capture').filter({ visible: true }).first().click();
    await tid(a, 'capture-caption').filter({ visible: true }).first().waitFor();
    const [chooser] = await Promise.all([a.waitForEvent('filechooser'), tid(a, 'capture-upload').filter({ visible: true }).first().click()]);
    await chooser.setFiles({ name: 'baga.png', mimeType: 'image/png', buffer: png() });
    await tid(a, 'use-current-place').filter({ visible: true }).first().waitFor();
    await tid(a, 'capture-caption').filter({ visible: true }).first().fill('Sunset at Baga Beach 🌅');
    await tid(a, 'capture-place').filter({ visible: true }).first().fill('Baga Beach');
    await tid(a, 'vis-public').filter({ visible: true }).first().click();
    await tid(a, 'capture-save').filter({ visible: true }).first().click();
    await a.waitForURL(/journey\//, { timeout: 30_000 });
    await text(a, 'Baga Beach');
    await shot(a, '06-active-journey');
  });

  await step('AC-002 Pause, resume and end the journey', async () => {
    await a.getByLabel('Pause journey').click();
    await text(a, 'Journey paused');
    await a.getByLabel('Resume journey').click();
    await text(a, 'Journey active');
    await a.getByLabel('End journey').filter({ visible: true }).first().click();
    await tid(a, 'dialog-title').filter({ visible: true }).first().waitFor();
    await tid(a, 'dialog-confirm').filter({ visible: true }).first().click();
    // Trip over → the cinematic story opens automatically
    await tid(a, 'trip-complete-banner').filter({ visible: true }).first().waitFor();
    await a.goBack();
    await text(a, 'Completed');
    await tid(a, 'make-magic').filter({ visible: true }).first().waitFor();
    await shot(a, '07-journey-completed');
  });

  await step('AC-006 ROAM Magic: cinematic video plays all scenes and can be saved', async () => {
    await tid(a, 'make-magic').click();
    await text(a, '1/7 · Earth Introduction');
    await shot(a, '08-magic-earth');
    await a.getByLabel('Jump to Journey Route').click();
    await text(a, '4/7 · Journey Route');
    await a.getByLabel('Jump to Memories').click();
    await text(a, '5/7 · Memories');
    await a.waitForTimeout(1200);
    await shot(a, '09-magic-memories');
    await a.getByLabel('Jump to Journey Summary').click();
    await text(a, 'Journey Summary');
    await tid(a, 'magic-save').click();
    await text(a, 'Saved ✓');
  });

  await step('Cinematic story video: trip photos + route + music rendered to a shareable 9:16 video', async () => {
    await tid(a, 'export-reel').filter({ visible: true }).first().click();
    await tid(a, 'music-sunset').filter({ visible: true }).first().click();
    await tid(a, 'create-story-video').filter({ visible: true }).first().click();
    await tid(a, 'story-progress').filter({ visible: true }).first().waitFor();
    const video = a.getByTestId('story-video').filter({ visible: true }).first();
    await video.waitFor({ timeout: 120_000 });
    const info = await video.evaluate(async (el) => {
      const v = el;
      v.muted = true;
      if (v.readyState < 1) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
      // MediaRecorder output may not declare a duration until scanned: seek far to force it
      if (!isFinite(v.duration)) {
        v.currentTime = 1e6;
        await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      }
      const frames = [];
      const cv = document.createElement('canvas');
      cv.width = 180;
      cv.height = 320;
      const cx = cv.getContext('2d');
      let bright = 0;
      for (const t of [1.5, 5, 10, 16, 24, 28.5]) {
        v.currentTime = Math.min(t, (isFinite(v.duration) ? v.duration : 30) - 0.2);
        await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
        cx.drawImage(v, 0, 0, 180, 320);
        const d = cx.getImageData(0, 0, 180, 320).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        bright = Math.max(bright, sum / (d.length / 4) / 3);
        frames.push(cv.toDataURL('image/jpeg', 0.8));
      }
      // play a moment to confirm the audio track decodes
      v.currentTime = 2;
      await v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      v.pause();
      return {
        w: v.videoWidth, h: v.videoHeight, duration: v.duration, bright, frames,
        audioBytes: v.webkitAudioDecodedByteCount ?? -1,
        mime: el.dataset.mime, bytes: Number(el.dataset.bytes), hasAudio: el.dataset.hasAudio,
      };
    });
    console.log(`    video: ${info.mime} ${info.w}x${info.h} ${info.duration.toFixed(1)}s ${(info.bytes / 1024).toFixed(0)}KB audioDecoded=${info.audioBytes}B`);
    if (info.w !== 720 || info.h !== 1280) throw new Error(`bad size ${info.w}x${info.h}`);
    if (!(info.duration > 27 && info.duration < 33)) throw new Error(`bad duration ${info.duration}`);
    if (info.bytes < 100_000) throw new Error(`video too small: ${info.bytes}`);
    if (info.hasAudio !== '1' || !(info.audioBytes > 0)) throw new Error(`no music in video (audioDecoded=${info.audioBytes})`);
    if (info.bright < 20) throw new Error('video frames are black');
    // save sampled frames for visual review
    const { writeFileSync } = await import('node:fs');
    info.frames.forEach((f, i) => writeFileSync(join(SHOTS, `story-frame-${i}.jpg`), Buffer.from(f.split(',')[1], 'base64')));
    await shot(a, '09b-story-video-ready');
    const [dl] = await Promise.all([a.waitForEvent('download'), tid(a, 'download-story').filter({ visible: true }).first().click()]);
    if (!/^roam-goa-trip-2026\.(mp4|webm)$/.test(dl.suggestedFilename())) throw new Error(`bad file name ${dl.suggestedFilename()}`);
  });

  await step('AC-009 Create a crew trip with a budget', async () => {
    await a.goto(BASE + '/crew');
    await tid(a, 'new-trip').click();
    await tid(a, 'trip-name').fill('Goa Trip 2026');
    await tid(a, 'trip-destination').fill('Goa');
    await tid(a, 'trip-start').fill('2026-11-20');
    await tid(a, 'trip-end').fill('2026-11-24');
    await tid(a, 'trip-budget').fill('8000');
    await tid(a, 'create-trip').click();
    await a.waitForURL(/\/trip\/(?!create$|join$)[^/?]+$/);
    tripId = a.url().split('/trip/')[1];
    await tid(a, 'tile-invite').click();
    await tid(a, 'invite-code').waitFor();
    inviteCode = (await tid(a, 'invite-code').textContent()).trim();
    if (!/^[A-Z0-9]{8}$/.test(inviteCode)) throw new Error(`bad invite code ${inviteCode}`);
  });

  await step('AC-009 Friend joins with the invite code', async () => {
    await b.goto(`${BASE}/trip/join?code=${inviteCode}`);
    await tid(b, 'join-submit').click();
    await tid(b, 'trip-title').waitFor();
    await text(b, '2 members');
  });

  await step('Crew live location: opt-in sharing is visible to crew members on the Google map, and stops when turned off', async () => {
    await b.getByRole('tab', { name: 'Map' }).filter({ visible: true }).first().click();
    await b.locator('[data-testid="crew-map"] .gm-style').first().waitFor({ timeout: 30_000 });
    await text(b, 'Nobody is sharing live location in this trip yet.');
    await tid(b, 'toggle-share-live').filter({ visible: true }).first().click();
    await text(b, 'Sharing');
    await a.goto(`${BASE}/trip/${tripId}`);
    await a.getByRole('tab', { name: 'Map' }).filter({ visible: true }).first().click();
    await a.locator('[data-testid="crew-map"] .gm-style').first().waitFor({ timeout: 30_000 });
    await text(a, /Live · /);
    await a.getByText('Priya Sharma', { exact: true }).filter({ visible: true }).first().waitFor();
    await a.waitForTimeout(1500);
    await shot(a, '10b-crew-live-map');
    await a.goto(BASE + '/live-map');
    await text(a, 'Crew live now');
    await a.locator('[data-testid^="crew-live-"]').filter({ visible: true }).first().waitFor();
    await a.goto(BASE + '/notifications');
    await text(a, /Priya Sharma is sharing live location/);
    // Priya stops sharing → disappears for Dheeraj
    await tid(b, 'toggle-share-live').filter({ visible: true }).first().click();
    await a.goto(`${BASE}/trip/${tripId}`);
    await a.getByRole('tab', { name: 'Map' }).filter({ visible: true }).first().click();
    await text(a, 'Nobody is sharing live location in this trip yet.');
    await b.goto(`${BASE}/trip/${tripId}`);
  });

  await step('AC-010/011 Shared moment appears on the group timeline and notifies members', async () => {
    await tid(b, 'add-moment').click();
    await tid(b, 'moment-text').fill('Beach volleyball at Calangute 🏐');
    await tid(b, 'moment-share').click();
    await text(b, 'Beach volleyball at Calangute');
    await a.goto(`${BASE}/trip/${tripId}`);
    await text(a, 'Beach volleyball at Calangute');
    await text(a, 'Shared by Priya Sharma');
    await shot(a, '10-crew-dashboard');
    await a.goto(BASE + '/notifications');
    await text(a, /Priya Sharma shared a moment in Goa Trip 2026/);
  });

  await step('AC-013 Both members add expenses (equal split)', async () => {
    await b.goto(`${BASE}/trip/${tripId}/add-expense`);
    await tid(b, 'expense-title').fill('Hotel (2 nights)');
    await tid(b, 'expense-amount').fill('2500');
    await tid(b, 'save-expense').click();
    await text(b, 'Hotel (2 nights)');
    await a.goto(`${BASE}/trip/${tripId}/split`);
    await tid(a, 'add-expense').click();
    await tid(a, 'expense-title').fill('Dinner @ Thalassa');
    await tid(a, 'expense-amount').fill('5000');
    await shot(a, '11-add-expense');
    await tid(a, 'save-expense').click();
    await text(a, 'Dinner @ Thalassa');
  });

  await step('AC-014 Balances calculated correctly; budget alert shown; server verifies', async () => {
    const expect = async (id, v) => {
      await a.waitForFunction(([i, val]) => document.querySelector(`[data-testid="${i}"]`)?.textContent === val, [id, v], { timeout: 15_000 }).catch(async () => {
        throw new Error(`${id} expected ${v} got ${await tid(a, id).textContent()}`);
      });
    };
    await expect('sum-total', '₹7,500');
    await expect('sum-share', '₹3,750');
    await expect('sum-paid', '₹5,000');
    await expect('sum-balance', '₹1,250');
    await text(a, 'You Will Receive');
    await text(a, '94% used'); // 7,500 of 8,000 budget, alert at 80%
    // Cloud Function marks expenses verified (no "Verifying" pills left)
    await a.waitForFunction(() => !document.body.innerText.includes('Verifying'), null, { timeout: 20_000 });
    await shot(a, '12-split-dashboard');
  });

  await step('AC-015 Settlement: payer records, receiver confirms, balances clear', async () => {
    await b.goto(`${BASE}/trip/${tripId}/settle`);
    await text(b, '₹1,250');
    await tid(b, 'record-payment').click();
    await text(b, /waiting for/i);
    await a.goto(`${BASE}/trip/${tripId}/settle`);
    await tid(a, 'confirm-payment').click();
    await tid(a, 'all-settled').waitFor();
    await shot(a, '13-settled');
    await a.goto(`${BASE}/trip/${tripId}/split`);
    await a.waitForFunction(() => document.querySelector('[data-testid="sum-balance"]')?.textContent === '₹0');
  });

  await step('AC-007 Social: friend sees public post in feed, likes it; author is notified', async () => {
    await b.goto(BASE + '/');
    await text(b, 'Sunset at Baga Beach');
    const like = b.locator('[data-testid^="like-"]').filter({ visible: true }).first();
    await like.click();
    await b.waitForTimeout(800);
    await shot(b, '14-feed');
    await a.goto(BASE + '/notifications');
    await text(a, 'Priya Sharma liked your post');
  });

  await step('Follow a traveller by username (Explore search)', async () => {
    await a.goto(BASE + '/explore');
    await tid(a, 'explore-search').fill(`@priya${run}`.slice(0, 21));
    await tid(a, 'search-user').click();
    await a.locator('[data-testid^="traveller-"]').filter({ visible: true }).first().click();
    await a.waitForURL(/\/user\//);
    await tid(a, 'follow-button').filter({ visible: true }).first().click();
    await text(a, 'Following');
    await b.goto(BASE + '/notifications');
    await text(b, 'Dheeraj Vishwakarma started following you');
  });

  await step('AC-008 Explore, Live World, City page and Memory Map render', async () => {
    await a.goto(BASE + '/explore');
    await text(a, 'Trending Destinations');
    await shot(a, '15-explore');
    await a.getByText('Live World').first().click();
    await tid(a, 'live-total').waitFor();
    await a.goto(BASE + '/city/goa');
    await text(a, 'Sunset at Baga Beach');
    await a.goto(BASE + '/memory-map');
    await text(a, 'Goa');
  });

  await step('Travel Passport shows stats and unlocked achievements', async () => {
    await a.goto(BASE + '/passport');
    await tid(a, 'passport-achievement-first-journey').waitFor();
    await text(a, 'First Journey');
    await shot(a, '16-passport');
  });

  await step('AC-017 Privacy: a non-member cannot open the trip', async () => {
    const C = await newUser('eve');
    await signUp(C.page, 'Eve Outsider', `eve${run}`.slice(0, 20), `eve.${run}@roam.test`, { fromOnboarding: false });
    await C.page.goto(`${BASE}/trip/${tripId}`);
    await text(C.page, 'Trip not available');
    await C.page.goto(`${BASE}/trip/${tripId}/split`);
    await text(C.page, 'Trip not available');
    await C.page.goto(`${BASE}/trip/${tripId}/settle`);
    await text(C.page, 'Trip not available');
    await C.context.close();
  });

  await step('Sign out returns to login', async () => {
    await b.goto(BASE + '/profile');
    await tid(b, 'sign-out').filter({ visible: true }).first().click();
    await tid(b, 'dialog-confirm').filter({ visible: true }).first().click(); // in-app confirmation sheet
    await tid(b, 'login-email').waitFor();
  });
} catch {
  // failure already logged – dump what each user was looking at
  for (const [label, pg] of Object.entries(globalThis.__pages ?? {})) {
    try {
      await pg.screenshot({ path: join(SHOTS, `FAILED-${label}.png`) });
      console.log(`\n[${label}] ${pg.url()}\n` + (await pg.innerText('body')).replace(/\n+/g, ' | ').slice(0, 700));
    } catch {}
  }
} finally {
  await browser.close();
  server.close();
  const real = consoleErrors.filter((e) => !/permission-denied|Missing or insufficient permissions|ERR_|404|Failed to load resource|Google Maps JavaScript API/i.test(e));
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  if (real.length) console.log(`\nBrowser errors (${real.length}):\n` + real.slice(0, 15).join('\n'));
  console.log(`Screenshots: ${SHOTS}`);
  process.exit(failures || real.some((e) => e.includes('pageerror')) ? 1 : 0);
}
