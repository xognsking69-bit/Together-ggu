# Togetrip V3.28.0 Release Candidate

최종 계정 연결 전 코드 기준 RC.

## 최종 보강
- 누락되어 있던 실제 import 대상 `smooth-text`, `smooth-pressable`, `appearance-context` 컴포넌트를 복구했습니다.
- 시스템/라이트/다크 모드 상태를 AsyncStorage에 유지합니다.
- 영수증 직접 촬영 카메라 권한과 사진 선택 권한을 모두 유지합니다.
- 사용하지 않는 Expo starter `/explore` 라우트를 제거했습니다.
- 활성 Router layout에서 global.css를 불러오도록 정리했습니다.
- 개인정보처리방침 초안의 사진/카메라 설명을 실제 구현과 맞췄습니다.
- 표시 버전/패키지 버전/스토어 빌드 번호를 V3.28.0 / iOS 16 / Android 16으로 맞췄습니다.

## 검증 범위
정적 파일/구성/상대 import/버전/권한/민감정보 흔적을 점검했습니다.
이 환경에서는 npm 의존성 설치가 제한 시간 내 완료되지 않아 실제 TypeScript 컴파일 및 네이티브 iOS/Android 빌드는 아직 검증하지 못했습니다.
다음 단계는 EAS/Apple/Google 계정 연결과 실제 클라우드 빌드 및 iPhone 테스트입니다.
