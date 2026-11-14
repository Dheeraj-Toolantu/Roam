import { describe, expect, it } from 'vitest';

import { extensionFor, inferMimeType, parseMp4DurationMs, sniffMimeType } from '../../src/logic/mediaType';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pad = (n: number) => new Array(n).fill(0);

describe('media type detection (Android files without a MIME type)', () => {
  it('sniffs common photo and video formats from their first bytes', () => {
    expect(sniffMimeType(bytes([0xff, 0xd8, 0xff, 0xe0], pad(12)))).toBe('image/jpeg');
    expect(sniffMimeType(bytes([0x89], 'PNG', pad(12)))).toBe('image/png');
    expect(sniffMimeType(bytes('RIFF', pad(4), 'WEBP', pad(4)))).toBe('image/webp');
    expect(sniffMimeType(bytes(u32(24), 'ftypheic', pad(8)))).toBe('image/heic');
    expect(sniffMimeType(bytes(u32(24), 'ftypisom', pad(8)))).toBe('video/mp4');
    expect(sniffMimeType(bytes(u32(24), 'ftypqt  ', pad(8)))).toBe('video/quicktime');
    expect(sniffMimeType(bytes(u32(24), 'ftyp3gp5', pad(8)))).toBe('video/3gpp');
    expect(sniffMimeType(bytes([0x1a, 0x45, 0xdf, 0xa3], pad(12)))).toBe('video/webm');
    expect(sniffMimeType(bytes('%PDF-1.7', pad(8)))).toBeNull();
  });

  it('prefers a specific declared type, then bytes, then the extension', () => {
    expect(inferMimeType('a.bin', 'video/mp4')).toBe('video/mp4');
    expect(inferMimeType('IMG_1.jpg', '')).toBe('image/jpeg');
    expect(inferMimeType('VID_1.MP4', 'application/octet-stream')).toBe('video/mp4');
    expect(inferMimeType('noext', '', bytes([0x89], 'PNG', pad(12)))).toBe('image/png');
    expect(inferMimeType('clip.jpg', '', bytes(u32(24), 'ftypmp42', pad(8)))).toBe('video/mp4'); // bytes beat a wrong name
    expect(inferMimeType('notes.pdf', 'application/pdf')).toBeNull();
    expect(inferMimeType('x', '')).toBeNull();
  });

  it('stores files under a sensible extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('video/quicktime')).toBe('mov');
    expect(extensionFor('video/mp4')).toBe('mp4');
    expect(extensionFor('image/heic')).toBe('heic');
  });
});

describe('MP4/MOV duration from the mvhd box', () => {
  it('reads version 0 and version 1 headers', () => {
    const v0 = bytes(pad(20), u32(108), 'mvhd', [0, 0, 0, 0], u32(0), u32(0), u32(600), u32(600 * 12.5), pad(80));
    expect(parseMp4DurationMs(v0)).toBe(12500);
    const v1 = bytes(pad(8), u32(120), 'mvhd', [1, 0, 0, 0], pad(16), u32(90000), u32(0), u32(90000 * 45), pad(80));
    expect(parseMp4DurationMs(v1)).toBe(45000);
  });
  it('returns null when there is no header', () => {
    expect(parseMp4DurationMs(bytes(pad(200)))).toBeNull();
  });
});
