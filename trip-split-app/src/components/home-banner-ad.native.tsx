import {useAppLanguage,translateUI} from './language-context';
import {usePremium} from './premium-context';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, Pressable, Text, Alert } from 'react-native';
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
  const {showAds}=usePremium();
  return showAds ? <AdSupportedBanner/> : <AdPrivacySettings/>;
}
function AdPrivacySettings() {
  const {language}=useAppLanguage();
  async function openPrivacy() {
    try {
      const info=await AdsConsent.getConsentInfo();
      if(info.privacyOptionsRequirementStatus===AdsConsentPrivacyOptionsRequirementStatus.REQUIRED) await AdsConsent.showPrivacyOptionsForm();
      else Alert.alert(translateUI("광고 개인정보 설정",language),translateUI("현재 변경할 광고 개인정보 설정이 없어요.",language));
    } catch { Alert.alert(translateUI("광고 개인정보 설정",language),translateUI("개인정보 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",language)); }
  }
  return <Pressable accessibilityRole="button" onPress={()=>{void openPrivacy();}} style={{padding:12,alignSelf:'center'}}><Text style={{color:'#208AEF'}}>{translateUI("광고 개인정보 설정",language)}</Text></Pressable>;
}
function AdSupportedBanner() {
  const {language}=useAppLanguage();
  const mountedRef=useRef(true);
  const [canShow, setCanShow] = useState(false);
  const [privacyRequired, setPrivacyRequired] = useState(false);
  const [adRevision, setAdRevision] = useState(0);

  useEffect(() => {
    if (!enabled || !unitId) return;
    let mounted = true;
    mountedRef.current=true;
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
        if (!mounted) return;
        await mobileAds().initialize();
        if (mounted) setCanShow(true);
      } catch (error) {
        console.warn('Unable to prepare ads:', error);
      }
    }
    prepare();
    return () => { mounted = false; mountedRef.current=false; };
  }, []);

  async function changePrivacyOptions() {
    try {
      const consent = await AdsConsent.showPrivacyOptionsForm();
      if(!mountedRef.current)return;
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
          <Text style={{ color: '#208AEF' }}>{translateUI("광고 개인정보 설정",language)}</Text>
        </Pressable>
      )}
    </View>
  );
}
