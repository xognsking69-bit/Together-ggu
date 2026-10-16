# Togetrip 3.28.29 — source release candidate

| Item | Prepared value |
|---|---|
| App / package / visible fallback | 3.28.29 |
| Planned iOS build number | 51 |
| Planned Android version code | 49 |
| Existing app | Togetrip (same App Store/Play Store identities) |
| Review | https://github.com/xognsking69-bit/Together-ggu/pull/4 |

## Included changes
- Correct custom allocations and currency rounding; direct allocation editing; invalid-data warning instead of a false settled result.
- Local calendar dates, DST-safe day counts and historical companion deletion protection.
- Newly picked native receipt images are copied into the app documents folder, leaving the original untouched. Photo copy failure blocks attachment, and the expense cannot be saved while copying.
- State writes are serialized. Unused managed receipt copies are released only after metadata storage succeeds and no saved/queued expense or active draft references them. Cleanup failures are retryable.
- Corrupt JSON/read failures block startup persistence instead of overwriting the stored data with a new empty trip. Saving failures show a retry action.
- JSON backup excludes receipt image bytes and device-local paths. Web photo attachment remains temporary and is not persisted with expenses.
- New guidance supports Korean, English, Japanese and simplified Chinese.

## Validation / limits
92 automated tests, TypeScript no-emit and platform JS exports are checked before the candidate is finalized. Native filesystem APIs are type-checked; file deletion ordering is tested using an injected fake remover/writer, not on a phone. The cloud browser could not reach the local QA server (connection refused); interactive browser QA was not completed. No physical device or emulator is available here.

Required native acceptance checks:
1. On both platforms, select/capture a test receipt, save an expense, restart the app and confirm the image can be read.
2. Edit an 80/20 split, save/reopen, and confirm a 20 transfer. Check invalid sums, equal-split reset, currency conversion and participant changes.
3. Detach/re-save and delete a test expense; ensure only the unused app copy is removed, the gallery original remains, and another expense using the same copy is preserved.
4. Simulate low storage/write failure and verify no referenced photo is removed and retry succeeds. Cancel an in-progress photo selection and switch trips; no attachment should leak into another form.
5. Check Korean midnight dates, future reminders, dark mode, all 4 languages, help, layout and shared-trip sync.

The initial implementation does not scan for crash-orphaned files on every launch. An interruption while copying or before first persistence can leave an unreferenced app file. Failed cleanup remains retryable within the session. Existing pre-upgrade cache photos are not bulk migrated. There is no image-inclusive portable backup, server-side deletion guarantee, or secure byte-erasure guarantee. A reinstall may remove app-local photos; retain originals separately.

## Delivery
The source ZIP is not an APK/AAB/IPA and cannot be installed as a store update. No signed native build, store upload, main merge or production deployment was performed. Before a native build, confirm that 51/49 remain unused in the respective services. Release only after acceptance checks; keep current live ads configuration and existing app identifiers.

## Reproduce local checks
Use Node 24 and the existing project directory:

```sh
npm ci
npm test
npx tsc --noEmit
npx expo export --platform all
```
