import React,{createContext,useContext,useEffect,useState,useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DICTIONARY} from './translations';
export type AppLanguage='ko'|'en'|'ja'|'zh';
export const LANGUAGES=[['ko','한국어'],['en','English'],['ja','日本語'],['zh','简体中文']] as const;
export const LANGUAGE_KEY='togetrip-language-v1';
export function isLanguage(value:unknown):value is AppLanguage{return LANGUAGES.some(([id])=>id===value)}
export function translateUI(value:string,language:AppLanguage):string {
  if(language==='ko')return value;
  const text=value.trim().replace(/\s+/g,' ');
  const direct=DICTIONARY[text];
  if(direct)return direct[{en:0,ja:1,zh:2}[language]];
  const match=text.match(/^([^가-힣A-Za-z0-9]*)(.*)$/u);
  const entry=match&&DICTIONARY[match[2]];
  return entry?match![1]+entry[{en:0,ja:1,zh:2}[language]]:value;
}
const Context=createContext({language:'ko' as AppLanguage,setLanguage:(_value:AppLanguage)=>{}});
export function LanguageProvider({children}:{children:React.ReactNode}){
  const [language,set]=useState<AppLanguage>('ko');
  const [ready,setReady]=useState(false);
  const changed=useRef(false);
  useEffect(()=>{let active=true;AsyncStorage.getItem(LANGUAGE_KEY).then(value=>{if(active&&!changed.current&&isLanguage(value))set(value)}).catch(()=>{}).finally(()=>{if(active)setReady(true)});return()=>{active=false}},[]);
  useEffect(()=>{if(ready)void AsyncStorage.setItem(LANGUAGE_KEY,language).catch(()=>{})},[language,ready]);
  return <Context.Provider value={{language,setLanguage:(next)=>{changed.current=true;set(next)}}}>{children}</Context.Provider>;
}
export function useAppLanguage(){return useContext(Context)}
