import React,{useEffect,useRef,useState} from 'react';
import {Alert,Platform,Pressable,View} from 'react-native';
import Constants from 'expo-constants';
import {fetch as expoFetch} from 'expo/fetch';
import {SmoothText as Text} from './smooth-text';
import {useAppAppearance} from './appearance-context';
import {useAppLanguage,translateUI} from './language-context';
import {receiptPackReady,type ReceiptPackConfig,type ReceiptSalesReadiness,type ReceiptStoreProduct} from '../monetization/receipt-pack';
import {loadReceiptStore,purchaseReceiptStore} from '../monetization/receipt-store';
type Session={endpoint:string;guestId:string;token:string};
const raw=Constants.expoConfig?.extra?.receiptPurchases || {};
const config:ReceiptPackConfig={enabled:raw.enabled===true,platform:Platform.OS,apiKey:Platform.OS==='ios'?raw.iosPublicKey:raw.androidPublicKey,productId:Platform.OS==='ios'?raw.iosProductId:raw.androidProductId};
export default function ReceiptPackPurchase({getSession}:{getSession:()=>Promise<Session>}) {
 const {colors}=useAppAppearance();const {language}=useAppLanguage();
 const [product,setProduct]=useState<ReceiptStoreProduct|null>(null);
 const [busy,setBusy]=useState(false);const [pending,setPending]=useState(false);
 const lock=useRef(false);const mounted=useRef(true);const sessionGetter=useRef(getSession);sessionGetter.current=getSession;
 const t=(value:string)=>translateUI(value,language);
 async function prepare() {
  const session=await sessionGetter.current();
  const response=await (Platform.OS==='web'?fetch:expoFetch)(session.endpoint.replace(/\/receipt\/analyze\/?$/i,'/receipt/credits'),{headers:{Authorization:`Bearer ${session.token}`}});
  if(!response.ok)throw new Error('Receipt sales unavailable');
  const readiness=await response.json() as ReceiptSalesReadiness;
  const userId=`receipt:${session.guestId}`;
  if(!receiptPackReady(config,readiness,userId))throw new Error('Receipt sales unavailable');
  return userId;
 }
 useEffect(()=>{mounted.current=true;if(config.enabled)void prepare().then(id=>loadReceiptStore(config,id)).then(p=>{if(mounted.current)setProduct(p);}).catch(()=>{});return()=>{mounted.current=false;};},[]);
 async function buy() {
  if(lock.current||!product||pending)return;
  lock.current=true;setBusy(true);
  try {
   const id=await prepare(); // Recheck server readiness before the native purchase sheet.
   await purchaseReceiptStore(config,id);
   if(mounted.current){setPending(true);Alert.alert(t('구매 확인 중'),t('결제 승인 후 서버에서 10회 이용권을 확인해요. 확인 전에는 다시 구매하지 마세요.'));}
  } catch(error) {
   if(!(error as {userCancelled?:boolean})?.userCancelled&&mounted.current)Alert.alert(t('구매할 수 없어요'),t('스토어 또는 이용권 연결을 확인하지 못했어요. 잠시 후 다시 시도해주세요.'));
  } finally {lock.current=false;if(mounted.current)setBusy(false);}
 }
 return <View style={{marginTop:12,padding:14,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface2}}>
  <Text localize style={{fontSize:16,fontWeight:'900',color:colors.text}}>영수증 AI 10회권</Text>
  <Text localize style={{marginTop:6,fontSize:12,lineHeight:18,color:colors.muted}}>사진 촬영·선택 후 영수증 정보를 자동 입력하는 분석 이용권이에요. 촬영 자체는 무료예요.</Text>
  <Pressable accessibilityRole="button" disabled={!product||busy||pending} onPress={()=>{void buy();}} style={{marginTop:10,minHeight:50,padding:12,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:product?'#5147CE':colors.surface,borderWidth:1,borderColor:colors.border}}>
   <Text style={{fontSize:15,fontWeight:'900',color:product?'#FFFFFF':colors.text}}>{busy?t('스토어 연결 중…'):pending?t('구매 확인 중'):product?`${t('10회권 구매')} · ${product.priceString}`:t('10회권 구매 · 판매 준비 중')}</Text>
  </Pressable>
  {!product&&<Text localize style={{marginTop:8,fontSize:12,lineHeight:18,color:colors.muted}}>10회권 판매를 준비하고 있어요. 준비가 끝나면 여기서 구매할 수 있어요. 현재 결제되지 않아요.</Text>}
 </View>;
}
