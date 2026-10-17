# 10회권 판매 구현 상태 — 2026-10-17

상품 범위: 영수증 자동 입력 10회권 하나. 한국 가격 기준 1,900원. 구독·대용량 팩 없음. 기본 정산 무료 유지. 실제 화면 가격은 스토어에서 받아야 하며 다른 국가 환산 가격을 하드코딩하지 않는다.

## 이번 완료

- ReceiptCreditLedger: 영구 거래/잔액 원장. 1개 전역 coordinator의 storage.transaction으로 거래 고유성과 차감을 직렬화한다. 부하 확장 전 별도 설계 필요.
- 한 구매당 정확히 10회 지급, 동일 거래 중복 지급 방지, 다른 사용자/상품으로 거래 재사용 차단.
- 이미지 해시 + 사용자별 요청 ID로 예약/완료/실패 해제 처리. 같은 요청 ID로 다른 사진을 보내면 차단.
- 완료한 사용량을 실패 처리해 돌려받을 수 없음. 실패 해제는 한 번만 반환.
- 환불 중복 차감 방지, 구매보다 먼저 온 환불 tombstone 유지. 이미 사용한 구매 환불은 내부 부채로 기록하며 이후 구매 지급에서 상계한다. 이 정책의 소비자 안내/법적 검토는 판매 전 필요.
- 기본 비활성인 /receipt/credits (인증된 본인 잔액만 조회)와 /receipt/credits/webhook (서버 알림만 지급) 경로.
- 웹훅 고정 Authorization secret, 64KB 본문 제한, 앱 ID/상품/환경/스토어 검사. 클라이언트 주장만으로 지급하지 않음.
- SANDBOX와 PRODUCTION은 별도 원장 이름. 운영·테스트 바인딩도 계정에서 별도 생성해야 함.
- 사진/추출 결과/결제 원문을 원장에 저장하지 않음. 거래 고유키/사용자 ID/상품/환불 상태/사진 해시/작업 상태만 저장. 유료 원장은 alarm/TTL 자동 삭제 없음.

## 아직 판매 불가인 이유

1. 실제 iOS/Android 10회 소모성 상품 생성 및 상태/가격/결제창 미확인.
2. RevenueCat 서버 프로젝트/공개 키/스토어 자격증명/웹훅 미연결. 사용 요금/개인정보 처리 조건 확인 후 승인된 계정만 사용.
3. 앱 결제 SDK에 서버 서명 세션의 사용자 ID `receipt:<guest UUID>`를 안전하게 연결하는 흐름 미구현. 기존 광고 제거 익명 SDK 설정과 중복 초기화되지 않아야 함.
4. 영구 계정 또는 안전한 복구코드 방식 및 재설치/다른 기기 잔액 복구 UI 미구현. 소모성 상품 스토어 복원만으로 잔액을 되찾는다고 약속하면 안 됨.
5. 실제 영수증 인식 경로는 아직 무료 5회 경로다. 새 유료 원장을 호출해 paid 분석하는 엔드포인트와 구매 UI는 아직 연결하지 않았다. 현 상태를 켜도 유료 분석을 사용할 수 없다.
6. 응답 유실 후 이미 성공한 결과를 다시 전달하는 저장/암호화/보존 정책이 필요하다. 이 원장은 결과를 저장하지 않아 status 조회만 가능하다. 예약은 자동 만료시키지 않으며 중단된 작업 정리/관리자 대조 도구가 필요하다.
7. 전역/사용자 일일 비용 상한에 유료 분석을 연결하고 추론 비용·정확도·시간 절약을 실제 측정해야 함.
8. 구매 취소/지연 승인/샌드박스/환불/중복 알림/오프라인/재설치/다국어 안내를 양 플랫폼 실기기에서 검증하지 않았다.

## 운영 설정 계약 (이름만 정의, 실제 값 미설정)

- RECEIPT_CREDITS_ENABLED: 기본 미설정. 실제 판매 준비 전 true 금지.
- RECEIPT_CREDITS_ENVIRONMENT: SANDBOX 또는 PRODUCTION 명시.
- RECEIPT_CREDIT_LEDGER: 새 Durable Object 바인딩, class_name ReceiptCreditLedger. 기존 RECEIPT_USAGE와 분리.
- RECEIPT_RC_WEBHOOK_SECRET: 32자 이상 새 무작위 secret. 앱/깃/ZIP에 넣지 말 것. RevenueCat webhook Authorization에 `Bearer <secret>` 설정.
- RECEIPT_RC_IOS_APP_ID / RECEIPT_RC_ANDROID_APP_ID: RevenueCat 앱 식별자 (bundle/package ID가 아님).
- RECEIPT_IOS_PACK10_ID / RECEIPT_ANDROID_PACK10_ID: 각 스토어의 정확한 소모성 상품 ID, 하나씩만 허용.
- 앱 SDK용 공개 키는 앱에, 서버용 비밀 키는 서버에만. 이번 웹훅 경로는 RevenueCat REST secret key를 요구하지 않는다.

배포 시 기존 Worker 모듈과 새 상대 import 파일을 함께 번들해야 한다. Cloudflare 편집기에 기존 단일 JS만 덮어쓰면 import가 빠져 동작하지 않을 수 있다. 새 바인딩 migration은 별도 sandbox Worker에서 검증하고 기존 사용량/여행 DB를 변경하지 않는다.

## 웹훅 처리 범위와 보류

NON_RENEWING_PURCHASE만 구매 지급. CANCELLATION + CUSTOMER_SUPPORT만 현재 환불 처리. 다른 환불 사유는 409로 재시도/운영자 확인 필요 상태로 둔다. TRANSFER/REFUND_REVERSED/계정 병합을 아직 지원하지 않으므로 자동 계정 이전을 켜지 않는다. 정확한 알림 매핑은 실제 두 스토어 샌드박스 payload로 검증해야 한다. 웹훅 인증은 RevenueCat 설정 secret에 의존하며 독립적인 Apple JWS/Google Play 서명 검증 구현은 아니다.

## 승인과 완료 기준

사용자의 10회권·1,900원·배포 요청은 확인됨. 추가 유료 서비스 계약/비용 승인은 별도이다. 설정 완료만으로 판매 가능으로 표시하지 않는다. 결제→10회 지급→분석 성공 시 1회→실패 시 미차감→재실행 중복 미차감→응답 유실 복구→재설치 잔액 복구→환불의 실제 결과를 양 플랫폼에서 확인해야 한다.

참고 문서:
- https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- https://www.revenuecat.com/docs/getting-started/restoring-purchases
- https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/
