export function readableTextColor(color:unknown,isDark:boolean,text:string,muted:string):string|undefined {
  if(!isDark)return undefined;
  if(color==null)return text;
  if(typeof color!=='string')return undefined;
  const c=color.toUpperCase();
  if(['#202230','#22243B','#20213A','#252840','#23263F','#35384C','#000','#000000','BLACK'].includes(c))return text;
  if(/^#[0-3][0-9A-F][0-3][0-9A-F][0-6][0-9A-F]$/.test(c))return text;
  if(['#8589A5','#74788A','#777','#888','#8D90A6'].includes(c))return muted;
  return undefined;
}
