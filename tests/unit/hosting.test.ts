/**
 * Guards the Firebase Hosting config against excluding parts of the web build.
 * (A `**​/node_modules/**` ignore once dropped every icon font from the live site.)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { minimatch } from 'minimatch';

const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;

// Paths the Expo web export produces that must be served
const REQUIRED = [
  'index.html',
  '_expo/static/js/web/entry-abc123.js',
  'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.6148e7019854f3bde85b633cb88f3c25.ttf',
  'assets/node_modules/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png',
  'favicon.ico',
];

describe('firebase.json hosting', () => {
  it('serves every file of the web build (fonts under assets/node_modules included)', () => {
    for (const path of REQUIRED) {
      const ignored = (hosting.ignore as string[]).some((g) => minimatch(path, g, { dot: true }) || minimatch(path, g.replace(/^\*\*\//, ''), { dot: true }));
      expect(ignored, `${path} would be excluded from hosting`).toBe(false);
    }
  });
  it('rewrites app routes to index.html (SPA)', () => {
    expect(hosting.rewrites).toContainEqual({ source: '**', destination: '/index.html' });
  });
});
