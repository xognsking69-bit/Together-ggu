import {useEffect,useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AD_PAUSE_MS,pauseDeadline} from './policy';
const KEY='togetrip-banner-pause-until-v1';
let until=-1;
let loading:Promise<void>|null=null;
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(f=>f());
function load(){if(!loading)loading=AsyncStorage.getItem(KEY).then(v=>{until=pauseDeadline(v,Date.now());emit();}).catch(()=>{until=0;emit();});return loading;}
export function useBannerPause(){
  const value=useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>until,()=>-1);
  useEffect(()=>{void load();const sub=AppState.addEventListener('change',s=>{if(s==='active'&&until>0&&Date.now()>=until){until=0;emit();}});return()=>sub.remove();},[]);
  useEffect(()=>{if(value<=0)return;const timer=setTimeout(()=>{until=0;emit();},Math.max(0,value-Date.now()));return()=>clearTimeout(timer);},[value]);
  return {ready:value>=0,paused:value>Date.now()};
}
export async function rewardBannerPause(){
  await load();
  until=Date.now()+AD_PAUSE_MS;emit();
  // An earned reward applies in memory even if local persistence is unavailable.
  await AsyncStorage.setItem(KEY,String(until)).catch(()=>{});
}
