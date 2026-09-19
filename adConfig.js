// adConfig.js — 광고 스위치
//
// USE_TEST_ADS
//   true  : 구글 테스트 광고 ("Test Ad" 표시). 개발·테스트·라이더 시험배포용
//   false : 진짜 광고. 스토어에 올릴 AAB를 빌드하기 "직전"에만 바꾼다
//
// ⚠️ 우리는 항상 릴리즈 빌드로 테스트하므로 __DEV__로 자동 전환하면 안 된다.
//    (릴리즈에선 __DEV__가 false라서 테스트 중에도 진짜 광고가 뜬다)

import { TestIds } from 'react-native-google-mobile-ads';

export const USE_TEST_ADS = true;

// 애드몹 콘솔의 "스마트라이더 전면" 광고 단위 ID (슬래시 / 있는 것)
const REAL_INTERSTITIAL_ID = 'ca-app-pub-5136124041871438/5103327401';

export const INTERSTITIAL_ID = USE_TEST_ADS ? TestIds.INTERSTITIAL : REAL_INTERSTITIAL_ID;