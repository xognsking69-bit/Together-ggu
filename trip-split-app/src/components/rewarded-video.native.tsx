import {initializeAds} from '../ads/initialize.native';
import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,Platform,Pressable,StatusBar,Text,View} from 'react-native';
import Constants from 'expo-constants';
import {AdsConsent,AdEventType,RewardedAd,RewardedAdEventType,TestIds} from 'react-native-google-mobile-ads';
import {usePremium} from './premium-context';
import {useAppLanguage,translateUI} from './language-context';
import {rewardBannerPause,useBannerPause} from '../ads/banner-pause';
import {rewardedUnit} from '../ads/policy';
export default function RewardedVideo(){
 const {showAds}=usePremium();const {language}=useAppLanguage();const pause=useBannerPause();
 const config=Constants.expoConfig?.extra?.ads||{};
 const unit=config.mode==='test'?TestIds.REWARDED:rewardedUnit(config.mode,Platform.OS,{android:config.androidRewardedId,ios:config.iosRewardedId});
 const [busy,setBusy]=useState(false);const locked=useRef(false);const mounted=useRef(true);const clean=useRef<()=>void>(()=>{});
 const allowed=useRef(false);allowed.current=Boolean(showAds&&!pause.paused);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clean.current();};},[]);
 const t=(s:string)=>translateUI(s,language);
 async function watch(){
  if(locked.current||!unit||!allowed.current)return;
  locked.current=true;setBusy(true);
  let terminal=false;let earned=false;let statusHidden=false;let ad:ReturnType<typeof RewardedAd.createForAdRequest>|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  const unsub:Array<()=>void>=[];
  const finish=()=>{if(terminal)return;terminal=true;if(timer)clearTimeout(timer);unsub.forEach(f=>f());if(statusHidden)StatusBar.setHidden(false);ad?.destroy();locked.current=false;if(mounted.current)setBusy(false);};
  const error=()=>{if(terminal)return;finish();if(mounted.current)Alert.alert(t('광고를 불러오지 못했어요'),t('잠시 후 다시 시도해주세요. 기본 기능은 그대로 사용할 수 있어요.'));};
  clean.current=finish;
  try{
   // Consent is checked before SDK initialization and again immediately before showing.
   try{await AdsConsent.gatherConsent();}catch{}
   if(!mounted.current||terminal||!allowed.current){finish();return;}
   if(!(await AdsConsent.getConsentInfo()).canRequestAds){finish();return;}
   await initializeAds();
   if(!mounted.current||terminal||!allowed.current){finish();return;}
   ad=RewardedAd.createForAdRequest(unit,{requestNonPersonalizedAdsOnly:true});
   unsub.push(ad.addAdEventListener(RewardedAdEventType.LOADED,()=>{void(async()=>{
    if(timer)clearTimeout(timer);
    if(!mounted.current||terminal||!allowed.current){finish();return;}
    if(!(await AdsConsent.getConsentInfo()).canRequestAds){finish();return;}
    if(!mounted.current||terminal||!allowed.current||AppState.currentState!=='active'){finish();return;}
    if(Platform.OS==='ios'){StatusBar.setHidden(true);statusHidden=true;}
    await ad!.show();
   })().catch(error);}));
   unsub.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD,()=>{if(earned||terminal)return;earned=true;void rewardBannerPause();}));
   unsub.push(ad.addAdEventListener(AdEventType.CLOSED,finish));
   unsub.push(ad.addAdEventListener(AdEventType.ERROR,error));
   timer=setTimeout(error,30000);
   ad.load();
  }catch{error();}
 }
 if(!showAds||!unit||!pause.ready)return null;
 return <View style={{padding:16,marginTop:24,borderWidth:1,borderColor:'#94A3B8',borderRadius:16,backgroundColor:'#17233A'}}>
  <Text style={{color:'#F8FAFC',fontWeight:'800'}}>{t('선택형 보상 광고')}</Text>
  <Text style={{color:'#CBD5E1',marginTop:8}}>{t('광고 시청을 완료하면 30분간 배너가 숨겨져요. 영수증 이용권은 지급되지 않아요.')}</Text>
  {pause.paused?<Text style={{color:'#7DD3FC',marginTop:12}}>{t('배너 숨김 보상이 적용 중이에요')}</Text>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>{void watch();}} style={{minHeight:48,padding:12,marginTop:12,backgroundColor:busy?'#475569':'#4F46E5',borderRadius:12}}><Text style={{color:'#FFFFFF',textAlign:'center',fontWeight:'700'}}>{t(busy?'광고 준비 중…':'광고 보고 30분 배너 숨기기')}</Text></Pressable>}
 </View>;
}
