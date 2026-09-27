# Togetrip 영수증 AI 무료 출시 설정 (V3.28.16)

현재 앱은 결제 화면을 표시하지 않고 Worker도 유료 크레딧을 사용하지 않습니다. App Store Connect 및 RevenueCat에 미리 만들어 둔 10회권은 향후 유료 출시를 위해 보관합니다.

앱 로그인이나 이메일·전화번호 없이 서버가 익명 게스트 ID와 서명 토큰을 발급합니다. Worker는 서명 토큰의 ID만 사용해 무료 사용량을 조회합니다. 앱이 보내는 임의의 `appUserId` 값은 신뢰하지 않습니다.

## 현재 기본 제한

- 게스트당 무료 분석 5회(여행방별이 아니라 계정 없는 게스트 ID 기준)
- 게스트당 하루 최대 분석 10회(무료 5회 제한이 우선 적용)
- 전체 이용자 합산 하루 최대 분석 10회(Worker 코드에서도 최대 10회로 제한)
- 한 IP에서 새 게스트 세션 발급 하루 최대 5회
- 게스트 토큰은 기기에 저장되고 1년 뒤 만료됩니다. 앱은 만료 30일 전부터 토큰을 갱신합니다.

하루 한도는 UTC 날짜 기준으로 초기화됩니다. 한도는 비용을 제한하는 안전장치이며, Workers AI 무료 할당량을 넘지 않는다는 보장은 아닙니다. 실제 사용량/요금을 Cloudflare 대시보드에서도 확인해야 합니다.

## Cloudflare Worker 배포

`wrangler.jsonc`는 Cloudflare Workers AI 바인딩과 기본 모델 `@cf/moondream/moondream3.1-9B-A2B`를 사용하도록 설정돼 있습니다. 이 비전 모델은 OCR과 이미지 질의를 지원하지만, 한국어 영수증을 실제 사진으로 시험한 뒤 공개해야 합니다.

Cloudflare 대시보드에서 AI 기능을 사용할 수 있는지 확인한 뒤, 프로젝트 폴더에서 아래를 실행합니다.

```sh
npx wrangler deploy
```

`GUEST_TOKEN_SECRET`에는 최소 32자 이상의 예측 불가능한 비밀값을 넣습니다. 기존에 설정했다면 변경할 필요가 없습니다. 최초 배포라면 먼저 `npx wrangler secret put GUEST_TOKEN_SECRET`으로 등록하세요. 이 값은 앱 설정, 소스 코드, GitHub에 넣지 않습니다. Worker를 새 코드로 배포해야 서버 측 5회 제한과 전체 하루 10회 제한이 적용됩니다. 배포 전에는 기존 Worker 동작이 유지됩니다.

Cloudflare Workers AI 대신 기존 OpenAI 처리를 사용할 때만 `wrangler.jsonc`의 `RECEIPT_AI_PROVIDER`를 `openai`로 바꾸고 `OPENAI_API_KEY`를 Worker secret으로 설정합니다. 앱 안에 AI 비밀 키를 넣으면 안 됩니다.

## 나중에 유료 판매할 때

1. RevenueCat에 iOS 앱(`com.susysisu.togetrip.ios`)과 Android 앱(`com.togetrip.app`)을 연결합니다.
2. iOS에 준비된 소모성 상품 `com.susysisu.togetrip.ios.receipt_10`과 RevenueCat 통화 `AISCAN`의 10개 지급을 검증합니다. Android 상품은 별도로 준비해야 합니다.
3. 사업자등록, 유료 앱 계약, 세금 및 은행 정보, 실제 구매 화면과 검증 흐름을 완료한 별도 버전에서 구매 기능을 구현합니다. 현재 버전에 `EXPO_PUBLIC_REVENUECAT_*` 값을 넣어도 구매는 시작되지 않습니다.
4. 이번 무료 버전의 앱 빌드 환경변수 `EXPO_PUBLIC_RECEIPT_API_URL`에 Worker 분석 경로(예: `https://<worker-domain>/receipt/analyze`)를 설정합니다.

RevenueCat에서 앱이 공개되기 전에 산 테스트 크레딧이 있다면, 이번 버전은 별도의 서버 발급 게스트 ID를 사용하므로 그 잔액이 자동 이전되지 않습니다. 구매를 실제 사용자에게 판매하기 전에 새 게스트 ID로 테스트 구매를 확인하세요.

## 공개 전 테스트

1. Worker secret을 Cloudflare에 등록하고 배포합니다.
2. 비공개 iOS/Android 빌드에서 게스트 토큰 발급, 앱 재실행 후 ID 유지, 무료 5회 제한, 전체 하루 10회 제한을 확인합니다.
3. 여러 종류의 한국어 영수증 사진에서 상호·날짜·최종 금액·통화·분류 정확도를 확인합니다. 숫자가 틀리면 사용자가 저장 전에 고칠 수 있는지 확인합니다.
4. 여섯 번째 분석 요청이 402로 차단되고 결제 화면이 표시되지 않는지 확인합니다.
5. Cloudflare Workers AI 실제 사용량 및 요금을 확인하고, 개인 정보 처리 방침의 AI 제공업체/처리 내용과 앱 구현이 일치하는지 확인합니다.

## 보호 범위와 남은 한계

서버 서명 토큰은 다른 사용자의 임의 ID를 요청에 넣는 것을 막지만, 이메일/전화번호 로그인이나 Apple App Attest·Google Play Integrity와 같은 앱/기기 검증은 아닙니다. IP 주소를 순환하는 자동화 공격까지 막는 완전한 인증 수단은 아니므로, 공개 서비스 초기에 호출량과 AI 사용료를 모니터링하고 한도를 낮게 유지해야 합니다. 이 구현은 사용자 연락처를 수집하지 않습니다.
