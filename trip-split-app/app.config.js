const { expo } = require('./app.json');

const TEST_APP_IDS = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
};
const APP_ID_PATTERN = /^ca-app-pub-\d{16}~\d{10}$/;
const UNIT_ID_PATTERN = /^ca-app-pub-\d{16}\/\d{10}$/;

module.exports = () => {
  const mode = process.env.TOGETRIP_ADS_MODE || 'off';
  if (!['off', 'test', 'live'].includes(mode)) {
    throw new Error('TOGETRIP_ADS_MODE must be off, test, or live.');
  }
  const ids = mode === 'live' ? {
    android: process.env.TOGETRIP_ADMOB_ANDROID_APP_ID,
    ios: process.env.TOGETRIP_ADMOB_IOS_APP_ID,
  } : TEST_APP_IDS;
  const units = mode === 'live' ? {
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
  } : {};
  if (mode === 'live' && (
    !APP_ID_PATTERN.test(ids.android || '') || !APP_ID_PATTERN.test(ids.ios || '') ||
    !UNIT_ID_PATTERN.test(units.android || '') || !UNIT_ID_PATTERN.test(units.ios || '')
  )) {
    throw new Error('Live ads require valid Android/iOS AdMob App IDs and banner ad unit IDs.');
  }

  return {
    ...expo,
    plugins: [
      ...expo.plugins,
      ['react-native-google-mobile-ads', {
        androidAppId: ids.android,
        iosAppId: ids.ios,
        delayAppMeasurementInit: true,
        ...(mode === 'live' ? {
          userTrackingUsageDescription: 'Togetrip은 맞춤형 광고 제공을 위해 광고 식별자를 사용할 수 있습니다.',
        } : {}),
      }],
    ],
    extra: {
      ...expo.extra,
      ads: {
        mode,
        androidBannerId: units.android || null,
        iosBannerId: units.ios || null,
      },
    },
  };
};
