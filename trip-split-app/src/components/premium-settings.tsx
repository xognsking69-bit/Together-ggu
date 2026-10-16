import React from 'react';
import AppHelp from './app-help';
import {View,Pressable} from 'react-native';
import {SmoothText as Text} from './smooth-text';
import {useAppAppearance} from './appearance-context';
import {usePremium} from './premium-context';
export default function PremiumSettings(){
  const {enabled,state,purchase,restore,refresh}=usePremium();
  const {colors}=useAppAppearance();
  if(!enabled)return null;
  const button={padding:14,minHeight:48,borderRadius:14,backgroundColor:colors.surface2,marginTop:10};
  const purchaseAllowed=state.status==='ready'&&!state.busy&&!state.adFree&&Boolean(state.product)&&state.notice!=='pending';
  return <View style={{padding:20,borderRadius:24,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,marginBottom:14}}>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12}}><Text localize style={{fontSize:20,fontWeight:"900",color:colors.text,flex:1}}>광고 제거</Text><AppHelp topic="광고 제거"/></View>
    <Text localize style={{color:colors.muted,marginTop:10}}>1회 구매로 앱 배너 광고를 제거해요. 영수증 AI 이용권은 포함되지 않아요.</Text>
    <Text localize style={{color:colors.text,marginTop:10}}>{state.adFree?'광고 제거가 적용되어 있어요.':state.busy?'구매 정보를 확인하는 중…':state.status==='error'?'구매 정보를 확인하지 못했어요. 다시 확인하거나 구매를 복원해주세요.':!state.product?'판매 가능한 상품을 불러오지 못했어요. 잠시 후 다시 확인해주세요.':'기본 정산 기능은 계속 무료로 사용할 수 있어요.'}</Text>
    {!state.adFree&&state.product&&<>
      <Text style={{color:colors.text,fontWeight:'900',marginTop:12}}>{state.product.product.priceString}</Text>
      <Pressable accessibilityRole="button" disabled={!purchaseAllowed} onPress={()=>{void purchase();}} style={[button,{opacity:purchaseAllowed?1:.45}]}><Text localize style={{color:colors.text,fontWeight:'800'}}>광고 제거 구매</Text></Pressable>
    </>}
    {state.notice==='pending'&&<Text localize style={{color:colors.text,marginTop:10}}>구매 상태를 확인 중이에요. 다시 결제하지 말고 구매 복원을 이용해주세요.</Text>}
    {state.notice==='restored'&&<Text localize style={{color:colors.text,marginTop:10}}>구매를 복원했어요.</Text>}
    {state.notice==='not-found'&&<Text localize style={{color:colors.text,marginTop:10}}>현재 스토어 계정에서 복원할 광고 제거 구매를 찾지 못했어요.</Text>}
    <Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>{void restore();}} style={button}><Text localize style={{color:colors.text,fontWeight:'800'}}>구매 복원</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>{void refresh();}} style={button}><Text localize style={{color:colors.text}}>구매 정보 다시 확인</Text></Pressable>
  </View>;
}
