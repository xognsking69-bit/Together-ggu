import mobileAds,{MaxAdContentRating} from 'react-native-google-mobile-ads';
let initializing:Promise<unknown>|null=null;
/** Call only after UMP permits requests. G limits creatives, not the app's audience declaration. */
export function initializeAds(){
 if(!initializing)initializing=mobileAds().setRequestConfiguration({maxAdContentRating:MaxAdContentRating.G}).then(()=>mobileAds().initialize()).catch(e=>{initializing=null;throw e;});
 return initializing;
}
