export const AD_PAUSE_MS=30*60*1000;
export function pauseDeadline(saved:unknown,now:number):number {
  const n=Number(saved);
  return Number.isFinite(n)&&n>now&&n<=now+AD_PAUSE_MS ? n : 0;
}
export function bannerPlacement(tab:string,expenseView:string):boolean {
  return ['home','schedule','companions','manage','settle','game'].includes(tab)||(tab==='expense'&&expenseView==='list');
}
export function rewardedUnit(mode:unknown,platform:string,ids:{android?:string|null;ios?:string|null}):string|null {
  const id=platform==='android'?ids.android:platform==='ios'?ids.ios:null;
  return mode==='live'&&typeof id==='string'&&/^ca-app-pub-\d{16}\/\d{10}$/.test(id)?id:null;
}
