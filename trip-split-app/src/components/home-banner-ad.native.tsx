import { useEffect, useState } from 'react';
import { Platform, View, Pressable, Text } from 'react-native';
import Constants from 'expo-constants';
import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

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
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const [adRevision, setAdRevision] = useState(0);

  useEffect(() => {
    if (!enabled || !unitId) return;
    let mounted = true;
    async function prepare() {
      try {
        // UMP checks the user's region and displays the configured consent form if required.
        try {
          await AdsConsent.gatherConsent();
        } catch (error) {
          // A previous valid consent decision can still permit ads after an update failure.
          console.warn('Unable to refresh advertising consent:', error);
        }
        const consent = await AdsConsent.getConsentInfo();
        if (mounted) setPrivacyRequired(consent.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED);
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

  async function changePrivacyOptions() {
    try {
      const consent = await AdsConsent.showPrivacyOptionsForm();
      setCanShow(false);
      setPrivacyRequired(consent.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED);
      if (consent.canRequestAds) {
        await mobileAds().initialize();
        setAdRevision(value => value + 1);
        setCanShow(true);
      }
    } catch (error) {
      console.warn('Unable to update advertising consent:', error);
    }
  }

  if (!unitId || (!canShow && !privacyRequired)) return null;
  return (
    <View style={{ alignItems: 'center', marginVertical: 14 }}>
      {canShow && <BannerAd key={adRevision} unitId={unitId} size={BannerAdSize.BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />}
      {privacyRequired && (
        <Pressable accessibilityRole="button" onPress={changePrivacyOptions} style={{ padding: 12 }}>
          <Text style={{ color: '#208AEF' }}>광고 개인정보 설정</Text>
        </Pressable>
      )}
    </View>
  );
}
