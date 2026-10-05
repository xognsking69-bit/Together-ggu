import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    let active = true;');
const end = source.indexOf('  }, [invitePayload]);', start);
const effect = source.slice(start, end)
  .replace('(payload?: string)', '(payload)')
  .replace('(url?: string | null)', '(url)');
const payload = JSON.stringify({ code: 'TESTROOM', token: 'test-token', name: '새 여행' });
function setup(invitePayload) {
  const updates = [];
  let resolveInitial, initialCalls = 0, listener, removed = false;
  const context = {
    invitePayload,
    Linking: {
      getInitialURL: () => { initialCalls++; return new Promise(resolve => { resolveInitial = resolve; }); },
      parse: url => { const u = new URL(url); return { hostname: u.hostname, path: u.pathname.slice(1), queryParams: Object.fromEntries(u.searchParams) }; },
      addEventListener: (_, fn) => { listener = fn; return { remove: () => { removed = true; } }; },
    },
    setSharedInviteText: v => updates.push(v), setTab: () => {},
    setOpenManageSection: () => {}, setSharedStatusText: () => {},
  };
  const cleanup = vm.runInNewContext('(function(){' + effect + '})()', context);
  return { updates, cleanup, get initialCalls() { return initialCalls; }, get removed() { return removed; }, resolve: url => resolveInitial(url), emit: url => listener({ url }) };
}
const url = 'tripsplitapp://invite?payload=' + encodeURIComponent(payload);
test('current route invite opens existing manual join flow without re-reading startup URL', () => {
  const s = setup(payload);
  assert.equal(s.initialCalls, 0);
  assert.deepEqual(JSON.parse(decodeURIComponent(s.updates[0].split(':')[1])), JSON.parse(payload));
});
test('cold start invite and subsequent links are accepted', async () => {
  const s = setup(); s.resolve(url); await Promise.resolve();
  assert.equal(s.updates.length, 1); s.emit(url); assert.equal(s.updates.length, 2);
});
test('malformed payload and unrelated link cannot populate an invite', () => {
  for (const p of ['not-json', 'null', '{}', '{"code":1,"token":true}']) assert.equal(setup(p).updates.length, 0);
  const s = setup(payload); s.emit('tripsplitapp://explore?payload=' + encodeURIComponent(payload)); assert.equal(s.updates.length, 1);
});
test('stale startup callback cannot overwrite a newer route after cleanup', async () => {
  const old = setup(); old.cleanup(); old.resolve(url); await Promise.resolve();
  assert.equal(old.updates.length, 0); assert.equal(old.removed, true);
});
test('invite route redirects its payload to the single home route', () => {
  const route = readFileSync(new URL('../src/app/invite.tsx', import.meta.url), 'utf8');
  assert.match(route, /pathname: "\/", params: \{ payload: value \}/);
});
