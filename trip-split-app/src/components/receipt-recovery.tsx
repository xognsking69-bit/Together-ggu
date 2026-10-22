import React,{useState,useRef} from 'react';
import {Alert,Platform,Pressable,TextInput,View} from 'react-native';

import * as SecureStore from 'expo-secure-store';
import {writeGuestSession,receiptFetch} from '../receipt-session';
import {SmoothText as Text} from './smooth-text';
import {useAppLanguage,translateUI} from './language-context';
import {useAppAppearance} from './appearance-context';
type Session={endpoint:string;guestId:string;token:string};
export default function ReceiptRecovery({getSession,onChange}:{getSession:()=>Promise<Session>;onChange:()=>void}) {
 const {language}=useAppLanguage();const t=(v:string)=>translateUI(v,language);
 const {colors}=useAppAppearance();const [code,setCode]=useState('');const [restore,setRestore]=useState('');const [busy,setBusy]=useState(false);
 const request=receiptFetch;const lock=useRef(false);
 async function act(action:'create'|'confirm'|'restore') {
  if(busy||lock.current||Platform.OS==='web')return;lock.current=true;setBusy(true);
  try {
   const s=await getSession();
   if(action==='create') {const existing=await SecureStore.getItemAsync('receipt-recovery:'+s.guestId);if(existing){setCode(existing);return;}}
   const response=await request(s.endpoint.replace(/\/receipt\/analyze\/?$/i,'/receipt/recovery/'+action),{method:'POST',headers:{Authorization:`Bearer ${s.token}`,'Content-Type':'application/json'},body:JSON.stringify(action==='restore'?{code:restore.trim()}:{})});
   if(!response.ok)throw new Error('복구 정보를 확인하지 못했어요. 코드와 연결 상태를 확인해주세요.');
   const data=await response.json();
   if(action==='create') {
    if(!/^[0-9a-f]{64}$/.test(data?.code))throw new Error('복구코드를 확인하지 못했어요.');
    await SecureStore.setItemAsync('receipt-recovery:'+s.guestId,data.code);setCode(data.code);
   } else if(action==='restore') {
    if(!data?.guestId||!data.token||!Number.isFinite(data.expiresAt))throw new Error('복구 정보를 확인하지 못했어요.');
    await writeGuestSession(JSON.stringify(data));setRestore('');setCode('');
    Alert.alert('이용권 계정 복구 완료','여행 기록은 변경하지 않았어요. 앱을 완전히 종료한 후 다시 열어 이용권을 확인해주세요.');
   } else {setCode('');onChange();Alert.alert('복구코드 저장 확인','구매 준비 상태를 다시 확인해요.');}
  }catch(error){Alert.alert('이용권 복구',(error as Error).message);}
  finally{lock.current=false;setBusy(false);}
 }
 const button=(title:string,action:'create'|'confirm'|'restore')=><Pressable disabled={busy} onPress={()=>{void act(action);}} style={{padding:12,minHeight:48,borderRadius:12,borderWidth:1,borderColor:colors.border,marginTop:8}}><Text localize style={{color:colors.text,fontWeight:'800'}}>{title}</Text></Pressable>;
 return <View style={{marginTop:12}}>
  <Text localize style={{color:colors.text,fontWeight:'800'}}>이용권 복구코드</Text>
  <Text localize style={{color:colors.muted,fontSize:12,lineHeight:18,marginTop:5}}>구매 전에 복구코드를 안전한 곳에 저장해주세요. 재설치·다른 휴대폰에서 이용권 계정을 되찾을 때 필요해요. 다른 사람에게 공유하지 마세요.</Text>
  {button('복구코드 발급·다시 보기','create')}
  {!!code&&<><Text selectable style={{color:colors.text,fontSize:14,paddingVertical:12}}>{code}</Text><Text localize style={{color:colors.muted,fontSize:12}}>코드를 길게 눌러 복사한 뒤 앱 밖의 안전한 곳에 보관해주세요.</Text>{button('복구코드를 따로 저장했어요','confirm')}</>}
  <TextInput accessibilityLabel="이용권 복구코드 입력" value={restore} onChangeText={setRestore} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder={t("저장해둔 복구코드 입력")} placeholderTextColor={colors.muted} style={{color:colors.text,backgroundColor:colors.input,borderWidth:1,borderColor:colors.border,padding:12,borderRadius:12,marginTop:12}}/>
  {button('기존 이용권 계정 복구','restore')}
 </View>;
}
