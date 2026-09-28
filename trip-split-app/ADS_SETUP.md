# Togetrip 배너 광고 설정

홈 화면의 최근 지출 아래에 배너 한 개를 표시합니다. `TOGETRIP_ADS_MODE` 기본값은 `off`입니다. 기존 빌드나 Expo Go에서는 광고를 요청하지 않습니다. 광고 SDK를 추가했으므로 광고를 켠 버전은 새 네이티브 빌드가 필요합니다.

## 테스트 빌드

Android APK는 GitHub Actions의 **Togetrip Ad Test Build** 워크플로를 수동 실행하거나 `eas build --platform android --profile ads-test`로 만들 수 있습니다. iOS도 **Togetrip iOS Ad Test Build** 워크플로 또는 `eas build --platform ios --profile ads-test`를 사용합니다. `ads-test` 프로필은 `TOGETRIP_ADS_MODE=test`를 설정하고 Google의 공식 데모 앱 ID와 배너 광고 단위를 사용합니다. 수익은 발생하지 않습니다. Expo Go는 이 네이티브 SDK를 실행할 수 없습니다.

## 실제 광고를 켜기 전

AdMob에서 Android와 iOS 앱을 각각 등록하고 플랫폼별 **앱 ID** (`~`)와 **배너 광고 단위 ID** (`/`)를 만드세요. EAS의 `production` 환경에 다음 변수를 등록합니다.

| 이름 | 값 |
| --- | --- |
| `TOGETRIP_ADS_MODE` | `live` |
| `TOGETRIP_ADMOB_ANDROID_APP_ID` | `ca-app-pub-1867930342924422~4834113520` |
| `TOGETRIP_ADMOB_IOS_APP_ID` | `ca-app-pub-1867930342924422~3213995818` |
| `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID` | `ca-app-pub-1867930342924422/2084746976` |
| `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID` | `ca-app-pub-1867930342924422/4089851373` |

광고 ID는 비밀번호가 아니지만 앱/광고 단위마다 정확히 일치해야 합니다. 하나라도 잘못되면 `live` 빌드의 설정 검사가 실패합니다. `off`가 그대로면 새 빌드에도 광고는 나타나지 않습니다.

2026-09-28 기준 AdMob 계정은 승인되었지만 Android와 iOS 앱은 모두 **검토 필요** 상태입니다. 각 앱을 지원되는 스토어에 게시하고 AdMob 앱 설정에서 스토어를 연결하면 앱 검토를 요청할 수 있습니다. 앱 검토 전에는 실제 광고 게재가 제한될 수 있습니다.

AdMob의 **개인정보 보호 및 메시지**에서 대상 지역의 동의 메시지를 구성하세요. 앱은 광고 요청 전에 UMP 동의 상태를 확인하고 광고 요청이 허용되지 않으면 배너를 표시하지 않습니다. 실제 출시 전 Play Console의 광고, 광고 ID, 데이터 보안 및 개인정보처리방침과 App Store 개인정보 항목을 광고 SDK 동작에 맞춰 확인해야 합니다. 광고 클릭을 직접 테스트할 때는 반드시 `test` 모드를 사용하세요.
