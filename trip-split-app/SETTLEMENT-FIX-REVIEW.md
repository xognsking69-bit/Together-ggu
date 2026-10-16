# Custom-share settlement correction (source review, not released)

Base: main 0c3f9b96e404fb01b1d1768fe83581c556ce7072.

## Fixed
- `computeBalances` previously ignored `Expense.customShares`: 100 KRW split 80/20 was calculated as 50/50. It now honors KRW custom amounts.
- Fractional currency conversion uses largest-remainder rounding to preserve the rounded expense total; equal-split behavior is retained.
- Duplicate participant IDs are deduplicated before allocation.
- Invalid/mismatched custom amounts or missing people block settlement and sharing. The app does not report these trips as settled or crash while calculating them.
- Save validates the new/edited expense before persisting it.
- The edit form exposes an explicit, confirmed equal-split reset for stale custom shares. Only saving the expense persists this change.
- New guidance is translated for Korean, English, Japanese and simplified Chinese.

## Additional findings (not fixed in this patch)
1. **Date correctness:** `today()` in `src/app/index.tsx` uses UTC (`toISOString().slice(0,10)`), so local Korean times 00:00–08:59 can select yesterday. Review calendar and notification date helpers together before changing this.
2. **Historical attribution on companion removal:** `removePerson` rewrites that person's payer to the current user and removes their custom share after confirmation. This can alter historical paid amounts and invalidate custom totals. Prefer archiving used people or a reviewed explicit reassignment flow. This patch blocks invalid settlement instead of reallocating money silently.
3. **Custom-share editing:** new custom amounts are not assignable through the current receipt UI. Existing values can be preserved or explicitly reset; a complete itemized split editor is separate work.
4. **Receipt lifecycle:** removing an image from UI state is not verified file deletion; URI backups do not guarantee long-term retention of the image. Review storage/expiry/deletion separately before marketing receipt storage.
5. **Release operations:** last Android screenshots show production 3.28.24(44), with 3.28.28(48) reused from the existing library in a draft. Production submission was not verified. This code patch is not included in build 48 or iOS build 50.

## Validation
- Node 24 native TypeScript execution: 19 new settlement tests (custom/equal splits, currency fractions, missing people, invalid values, transfer conservation and immutability).
- Existing invite and receipt-worker tests plus these tests: 55 passing at initial verification.
- TypeScript no-emit verification passed.
- Expo export for iOS, Android and web passed. This verifies bundling, not native signing, store upload, or device behavior. Existing warnings remain for a root-level ad config key and web notification listeners.
- Native UI/physical iPhone and Android testing not performed. Required before a store release: valid custom split, invalid-data warning, cancel/save equal-split reset, editing participants/amounts, reopen persistence, dark mode, language switching, and shared-trip synchronization.

## Delivery boundary
This is a source correction on a separate branch. No production merge, deployment, paid API call, native store upload, or user-data modification was performed. Version identifiers remain 3.28.28/iOS50/Android48 because no release build is created. A future release must use a new matching visible/package version and unused native build numbers; already uploaded binaries are immutable.
