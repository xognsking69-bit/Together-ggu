import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchInviteStores} from './patch-invite-stores.mjs';
const fixture=`const IOS_STORE_URL="https://apps.apple.com/kr/app/togetrip/id6814849927";
const ANDROID_STORE_URL="";
if(IOS_STORE_URL){const a=document.getElementById('iosBtn');a.href=IOS_STORE_URL;a.classList.remove('hidden')}
if(ANDROID_STORE_URL){const a=document.getElementById('androidBtn');a.href=ANDROID_STORE_URL;a.classList.remove('hidden')}`;
for(const [label,ua,touch,expected] of [['Android','Mozilla Android',0,['androidBtn']],['iPhone','Mozilla iPhone',5,['iosBtn']],['iPad desktop','Mozilla Macintosh',5,['iosBtn']],['PC','Mozilla Windows',0,['iosBtn','androidBtn']]])test(label+' gets the appropriate store',()=>{
 const visible=[],links={};vm.runInNewContext(patchInviteStores(fixture),{navigator:{userAgent:ua,maxTouchPoints:touch},document:{getElementById:id=>({set href(url){links[id]=url},classList:{remove:()=>visible.push(id)}})}});
 assert.deepEqual(visible,expected);if(expected.includes('androidBtn'))assert.equal(links.androidBtn,'https://play.google.com/store/apps/details?id=com.togetrip.app');
});
test('unexpected source fails closed',()=>assert.throws(()=>patchInviteStores('export default {}')));
