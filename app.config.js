/**
 * Test APK only: when TEST_APK=1, Android may use plain http so the app can reach the owner's PC on the home Wi-Fi.
 * Normal development and any future production build keep Android's default, which blocks cleartext traffic.
 */
module.exports = ({ config }) => {
  if (process.env.TEST_APK !== '1') return config;
  const plugins = (config.plugins ?? []).filter((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-build-properties');
  return {
    ...config,
    // A test-only application ID, so it can never collide with the future production ID.
    android: { ...config.android, package: 'app.speakstudio.test' },
    plugins: [...plugins, ['expo-build-properties', { android: { usesCleartextTraffic: true } }]],
  };
};
