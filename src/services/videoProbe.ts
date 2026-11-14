/** Native: expo-image-picker already reports video duration (ms) on iOS/Android. */
export async function probeVideoDurationMs(_uri: string): Promise<number | null> {
  return null;
}
