import { describe, expect, it } from 'vitest';

import { formatClipLength, MAX_VIDEO_MS, normalizePickerDurationMs, videoLengthError } from '../../src/logic/media';

describe('video upload limit (30 seconds)', () => {
  it('normalises picker durations: seconds on web, ms on native, null when unknown', () => {
    expect(normalizePickerDurationMs(12.5, 'web')).toBe(12_500);
    expect(normalizePickerDurationMs(12_500, 'ios')).toBe(12_500);
    expect(normalizePickerDurationMs(12_500, 'android')).toBe(12_500);
    expect(normalizePickerDurationMs(0, 'web')).toBeNull(); // web picker reports 0 when it can't read
    expect(normalizePickerDurationMs(Infinity, 'web')).toBeNull();
    expect(normalizePickerDurationMs(null, 'ios')).toBeNull();
  });

  it('accepts clips up to 30 s (with a small rounding allowance)', () => {
    expect(videoLengthError(5_000)).toBeNull();
    expect(videoLengthError(MAX_VIDEO_MS)).toBeNull();
    expect(videoLengthError(30_030)).toBeNull(); // "30 s" clips are often 30.03 s
  });

  it('rejects longer clips, unknown lengths and oversized files with a clear message', () => {
    expect(videoLengthError(31_000)).toMatch(/0:31 long.*up to 30 seconds/);
    expect(videoLengthError(45_000)).toMatch(/0:45/);
    expect(videoLengthError(null)).toMatch(/couldn't read this video's length/);
    expect(videoLengthError(10_000, 150 * 1024 * 1024)).toMatch(/too large/);
  });

  it('formats clip lengths', () => {
    expect(formatClipLength(5_000)).toBe('0:05');
    expect(formatClipLength(90_000)).toBe('1:30');
  });
});
