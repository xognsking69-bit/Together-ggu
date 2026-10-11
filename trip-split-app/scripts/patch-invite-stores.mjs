// Patch the existing Cloudflare Worker source; do not replace its API/auth handlers.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function patchInviteStores(source){
 const old='const ANDROID_STORE_URL="";';
 const ios="if(IOS_STORE_URL){const a=document.getElementById('iosBtn');a.href=IOS_STORE_URL;a.classList.remove('hidden')}";
 const android="if(ANDROID_STORE_URL){const a=document.getElementById('androidBtn');a.href=ANDROID_STORE_URL;a.classList.remove('hidden')}";
 for(const marker of [old,ios,android])if(source.split(marker).length!==2)throw Error('Worker source differs from the inspected invite page; inspect before patching.');
 return source.replace(old,'const ANDROID_STORE_URL="https://play.google.com/store/apps/details?id=com.togetrip.app";\nconst isAndroid=/Android/i.test(navigator.userAgent);\nconst isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);')
 .replace('if(IOS_STORE_URL){const a=', 'if(IOS_STORE_URL&&!isAndroid){const a=')
 .replace('if(ANDROID_STORE_URL){const a=', 'if(ANDROID_STORE_URL&&!isIOS){const a=')
 .replace('Trip Split 공동 여행 초대','Togetrip 공동 여행 초대')
 .replace('>Trip Split</h1>','>Togetrip</h1>')
 .replace('>Trip Split에서 열기</a>','>Togetrip에서 열기</a>')
 .replace('앱스토어 출시 후에는 다운로드 버튼이 자동으로 활성화되도록 준비되어 있어요.','앱이 없다면 기기에 맞는 스토어에서 설치한 뒤 이 초대 링크를 다시 열어 주세요.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output||input===output)throw Error('Usage: node patch-invite-stores.mjs existing-worker.js patched-worker.js');
 writeFileSync(output,patchInviteStores(readFileSync(input,'utf8')));
}
