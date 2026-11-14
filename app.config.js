/**
 * Extends app.json with Google Maps keys from the environment so no key is committed.
 *
 *   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY        – used by web (Maps JS API) and as default for native
 *   GOOGLE_MAPS_ANDROID_API_KEY (optional) – Maps SDK for Android key (restricted to the package)
 *   GOOGLE_MAPS_IOS_API_KEY     (optional) – Maps SDK for iOS key (restricted to the bundle id)
 */
module.exports = ({ config }) => {
  const shared = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || shared;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY || shared;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: androidKey || undefined, iosGoogleMapsApiKey: iosKey || undefined }],
    ],
    extra: { ...(config.extra ?? {}), googleMapsIos: !!iosKey },
  };
};
