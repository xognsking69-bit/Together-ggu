# Settlement and travel data corrections (source review, not released)

Base: main 0c3f9b96e404fb01b1d1768fe83581c556ce7072. Proposed changes are on PR #4.

## Corrected behavior
- Saved custom KRW shares are honored instead of being split equally. Fractional currency conversion uses largest-remainder rounding to preserve the rounded total.
- Duplicate participant IDs cannot lose a share. Invalid shares or missing people block settlement and sharing, rather than reporting a false zero balance. Saves validate expenses before updating state.
- Individual share amounts can be entered and edited in the selected expense currency. Blank/negative/nonfinite amounts are rejected; the sum must match the expense total. A confirmed reset to equal splitting applies only when the expense is saved.
- Removing a receipt attachment no longer clears independent custom share amounts.
- Calendar defaults use the device's local date, including Korean midnight. Calendar duration compares calendar components to avoid DST 23/25-hour errors. Impossible dates are rejected; reminder scheduling retains local event time and rejects rollover dates.
- A person referenced as payer, participant or custom-share key cannot be removed. No past expenses or payment ownership are rewritten. The pure state transformation rechecks the latest trip snapshot. Unused people remain removable.
- JSON backups omit device-specific receipt paths and explicitly mark receipt images as excluded. Expense amounts, analyses and allocations remain included. The source state is not mutated.
- Missing receipt photos show a reselect notice and disable analysis. Detaching a photo is labeled accurately; it is not represented as deleting the original or server data.
- Newly selected native receipt photos are copied to an app-owned documents directory. Original photos are never moved/deleted. Serialized metadata writes protect referenced copies; retryable cleanup runs after successful storage. Failed data loading no longer silently creates and persists an empty replacement trip.
- Added guidance is translated for Korean, English, Japanese and simplified Chinese.

## Validation
- 116 automated tests pass: 19 settlement, 21 travel data, 14 receipt lifecycle, 2 release identity 36 existing invite/worker tests, 20 dormant monetization tests and 4 unreadable-receipt regressions.
- New tests cover Korean/US date boundaries, year rollover, leap days, DST duration, historical payer/participant protection, unused person deletion, fresh-snapshot rechecks, custom amount parsing, rounding conservation and portable backup immutability.
- TypeScript no-emit and iOS/Android/web Expo exports passed.
- Exporting verifies JS bundling, not native signing or device behavior. Existing root-level ads configuration and web notification warnings are not resolved by this patch.

## Remaining work / limitations
1. Physical iPhone/Android UI QA: custom editor typing, cancel/save, dark mode, 4 languages, reopen persistence, shared-trip synchronization, missing image/reselection, and notification scheduling.
2. Receipt originals are not included in portable backups. New native selections use managed copies, but older cache photos are not bulk migrated. Native copy/delete behavior remains physically untested; abrupt interruption can leave orphan files. No secure byte-erasure or server-deletion guarantee. See RELEASE-3.28.29.md.
3. This patch prevents future companion deletion from rewriting history; it cannot reconstruct ownership already overwritten by older releases without a trustworthy backup.
4. Android production submission of 3.28.28(48) was not verified. This patch is not in Android48 or iOS50. Store status must be checked separately.
5. App-owned device-local dates are corrected; no server sync/audit timestamps were converted away from UTC.

## Delivery boundary
Separate review branch only. No main merge, production deployment, native store upload, paid API usage, or live user-data modification. The source candidate is 3.28.29/iOS51/Android49 with matching app/package/visible identifiers. No signed native release build is created; verify native counters remain unused before building. Already uploaded binaries do not receive these changes.

## Monetization preparation
Receipt time-saving tools are the first product candidate; see RECEIPT-PRODUCT-PLAN.md. Unreadable amount/currency now releases free usage reservations. Ad-removal purchase/restore foundations remain disabled by default, without product configuration or live SDK calls. No receipt credit sales, prices, store products, paid services or native releases were activated. Native billing and receipt accuracy still require device/sandbox QA.
