import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import mobileAds, { AdsConsent, BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

type AdConfig = {
  mode?: 'off' | 'test' | 'live';
  androidBannerId?: string | null;
  iosBannerId?: string | null;
};

const config = (Constants.expoConfig?.extra?.ads || {}) as AdConfig;
const enabled = config.mode === 'test' || config.mode === 'live';
const unitId = config.mode === 'test'
  ? TestIds.BANNER
  : Platform.OS === 'android' ? config.androidBannerId : config.iosBannerId;

export default function HomeBannerAd() {
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    if (!enabled || !unitId) return;
    let mounted = true;
    async function prepare() {
      try {
        // UMP checks the user's region and displays the configured consent form if required.
        await AdsConsent.gatherConsent();
        const consent = await AdsConsent.getConsentInfo();
        if (!consent.canRequestAds) return;
        await mobileAds().initialize();
        if (mounted) setCanShow(true);
      } catch (error) {
        console.warn('Unable to prepare ads:', error);
      }
    }
    prepare();
    return () => { mounted = false; };
  }, []);

  if (!canShow || !unitId) return null;
  return (
    <View style={{ alignItems: 'center', marginVertical: 14 }}>
      <BannerAd unitId={unitId} size={BannerAdSize.BANNER} />
    </View>
  );
}
