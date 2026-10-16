import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
test('app, package, lock and visible fallback share the release version',()=>{
 const app=read('../app.json').expo, pkg=read('../package.json'),lock=read('../package-lock.json');
 assert.equal(app.version,pkg.version);assert.equal(app.version,lock.version);assert.equal(app.version,lock.packages[''].version);
 assert.ok(fs.readFileSync(new URL('../src/app/index.tsx',import.meta.url),'utf8').includes(`Constants.expoConfig?.version || "${app.version}"`));
});
test('release retains existing app identities and explicit native counters',()=>{
 const app=read('../app.json').expo;assert.equal(app.ios.bundleIdentifier,'com.susysisu.togetrip.ios');assert.equal(app.android.package,'com.togetrip.app');assert.equal(app.extra.eas.projectId,'5f41c7f8-ceba-461a-9d74-d421967a7caa');assert.ok(Number.isInteger(app.android.versionCode)&&app.android.versionCode>0);assert.match(app.ios.buildNumber,/^[1-9]\d*$/);
});
