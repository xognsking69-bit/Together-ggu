import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/ads/policy.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}});
const {AD_PAUSE_MS,pauseDeadline,bannerPlacement,rewardedUnit}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
test('banner excluded from expense entry, unknown tabs and active form modes',()=>{
 assert.equal(bannerPlacement('expense','add'),false);assert.equal(bannerPlacement('expense','edit'),false);assert.equal(bannerPlacement('unknown','list'),false);assert.equal(bannerPlacement('expense','list'),true);
 for(const tab of ['home','schedule','companions','manage','settle','game'])assert.equal(bannerPlacement(tab,'add'),true);
});
test('earned banner pause lasts thirty minutes; expired and invalid saved dates cannot hide forever',()=>{
 const now=10000;assert.equal(AD_PAUSE_MS,1800000);assert.equal(pauseDeadline(now+AD_PAUSE_MS,now),now+AD_PAUSE_MS);
 for(const v of [null,undefined,NaN,Infinity,'bad',now-1,now,now+AD_PAUSE_MS+1])assert.equal(pauseDeadline(v,now),0);
});
test('live rewarded never falls back to banner or test identifiers',()=>{
 const ids={android:'ca-app-pub-1234567890123456/1234567890',ios:'ca-app-pub-9876543210987654/9876543210'};
 assert.equal(rewardedUnit('live','android',ids),ids.android);assert.equal(rewardedUnit('live','ios',ids),ids.ios);
 for(const [mode,p,units] of [['off','ios',ids],['test','ios',ids],['live','web',ids],['live','ios',{}],['live','ios',{ios:'banner'}]])assert.equal(rewardedUnit(mode,p,units),null);
});
