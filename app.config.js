/** Dynamic Expo config — demo builds disable ads via EXPO_PUBLIC_SHOW_GOOGLE_ADS=no */
const appJson = require('./app.json');

const adsEnv = process.env.EXPO_PUBLIC_SHOW_GOOGLE_ADS?.trim().toLowerCase();
const showGoogleAds =
  adsEnv === 'true' || adsEnv === '1' || adsEnv === 'yes'
    ? true
    : adsEnv === 'false' || adsEnv === '0' || adsEnv === 'no'
      ? false
      : appJson.expo.extra?.showGoogleAds !== false;

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    showGoogleAds,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || appJson.expo.extra?.apiBaseUrl,
  },
});
