import React,{createContext,useContext,useEffect,useMemo,useState} from "react";
import {Appearance,useColorScheme} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
export type AppearanceMode="system"|"light"|"dark";
const KEY="trip-split-appearance-mode-v1";
const light={background:"#F7F8FC",surface:"#FFFFFF",surface2:"#F4F5F9",input:"#FFFFFF",text:"#202230",muted:"#74788A",border:"#E5E7EF",nav:"#FFFFFF",overlay:"rgba(0,0,0,0.38)",dangerSurface:"#FFF2F3",dangerBorder:"#FFD2D7"};
const dark={background:"#0D1825",surface:"#142233",surface2:"#1A2A3D",input:"#172638",text:"#F5F7FB",muted:"#AAB5C4",border:"#2A3D53",nav:"#122031",overlay:"rgba(0,0,0,0.68)",dangerSurface:"#351D25",dangerBorder:"#693443"};
type Ctx={mode:AppearanceMode;setMode:(mode:AppearanceMode)=>void;isDark:boolean;colors:typeof light};
const Context=createContext<Ctx>({mode:"system",setMode:()=>{},isDark:false,colors:light});
export function AppearanceProvider({children}:{children:React.ReactNode}){const system=useColorScheme();const[mode,setModeState]=useState<AppearanceMode>("system");useEffect(()=>{AsyncStorage.getItem(KEY).then(v=>{if(v==="system"||v==="light"||v==="dark")setModeState(v)}).catch(()=>{})},[]);const setMode=(next:AppearanceMode)=>{setModeState(next);void AsyncStorage.setItem(KEY,next)};const isDark=mode==="dark"||(mode==="system"&&(system??Appearance.getColorScheme())==="dark");const value=useMemo(()=>({mode,setMode,isDark,colors:isDark?dark:light}),[mode,isDark]);return <Context.Provider value={value}>{children}</Context.Provider>}
export function useAppAppearance(){return useContext(Context)}
