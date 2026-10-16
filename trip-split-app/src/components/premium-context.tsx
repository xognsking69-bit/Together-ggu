import React,{createContext,useContext,useEffect,useState} from 'react';
import {AppState,Platform} from 'react-native';
import Constants from 'expo-constants';
import {createAdRemovalController,readBillingConfig,shouldRenderAds,type BillingState} from '../monetization/ad-removal';
import {createBillingAdapter} from '../monetization/billing-adapter';
const config=readBillingConfig(Constants.expoConfig?.extra?.monetization,Platform.OS);
// Singleton survives provider remounts; disabled config never initializes the SDK.
const controller=createAdRemovalController(config,createBillingAdapter());
const Context=createContext({state:controller.getState(),enabled:config.enabled,showAds:shouldRenderAds(controller.getState()),purchase:controller.purchase,restore:controller.restore,refresh:controller.refresh});
export function PremiumProvider({children}:{children:React.ReactNode}) {
  const [state,setState]=useState<BillingState>(controller.getState());
  useEffect(()=>{
    const unsubscribe=controller.subscribe(setState);
    if(config.enabled) void controller.refresh();
    const listener=config.enabled?AppState.addEventListener('change',next=>{if(next==='active')void controller.refresh();}):null;
    return()=>{unsubscribe();listener?.remove();};
  },[]);
  return <Context.Provider value={{state,enabled:config.enabled,showAds:shouldRenderAds(state),purchase:controller.purchase,restore:controller.restore,refresh:controller.refresh}}>{children}</Context.Provider>;
}
export const usePremium=()=>useContext(Context);
