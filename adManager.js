// adManager.js — 전면광고 관리
//
// 원칙
//  - 광고가 실패해도 앱 기능은 절대 멈추지 않는다 (전부 try로 감싼다)
//  - 미리 받아두고(load), 때가 되면 보여준다(show). 받는 중에 기다리게 하지 않는다
//  - 라이더는 하루에 건물을 여러 번 등록한다. 매번 띄우면 앱을 지운다
//    → N번에 한 번 + 최소 간격 두 가지로 제한한다

import { NativeModules } from 'react-native';                                   // ★ 새 줄
import mobileAds, { InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';
import { INTERSTITIAL_ID } from './adConfig';
import { getFloating } from './settingsCache';                                  // ★ 새 줄

const { ProximityOverlayModule } = NativeModules;                               // ★ 새 줄

const EVERY_N = 3;                    // 작업 3번에 한 번
const MIN_GAP_MS = 3 * 60 * 1000;     // 마지막 광고 후 최소 3분
const RETRY_MS = 60 * 1000;           // 로드 실패 시 1분 뒤 재시도

let interstitial = null;
let loaded = false;
let actionCount = 0;
let lastShownAt = 0;
let started = false;

// 광고 중에는 플로팅 숨김. 설정값은 절대 안 건드린다.          // ★ 바뀐 줄
// 닫힘 신호를 놓쳐도 코틀린이 90초 뒤 알아서 풀어준다.          // ★ 새 줄
function hideFloating() {
  try { ProximityOverlayModule?.setFloatingHold?.('ad', true)?.catch?.(() => {}); } catch (e) {}   // ★ 바뀐 줄
}
function restoreFloating() {                                                                       // ★ 바뀐 줄 (async 삭제)
  try { ProximityOverlayModule?.setFloatingHold?.('ad', false)?.catch?.(() => {}); } catch (e) {}  // ★ 바뀐 줄
}

function load() {
  try {
    loaded = false;
    interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID);

    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      console.log('[AD] 전면 준비 완료');
    });
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      restoreFloating();              // ★ 새 줄 — 사용자가 켜둔 경우에만 다시 켠다
      load();                         // 닫히면 다음 것을 미리 받아둔다
    });
    interstitial.addAdEventListener(AdEventType.ERROR, (e) => {
      loaded = false;
      console.log('[AD] 전면 로드 실패:', e?.message);
      setTimeout(load, RETRY_MS);
    });

    interstitial.load();
  } catch (e) {
    console.log('[AD] load 오류:', e?.message);
  }
}

// 앱 시작 시 한 번. 여러 번 불려도 한 번만 실행된다
export async function initAds() {
  if (started) return;
  started = true;
  try {
    await mobileAds().initialize();
    console.log('[AD] SDK 초기화 완료');
    load();
  } catch (e) {
    console.log('[AD] 초기화 실패:', e?.message);
  }
}

// 작업 완료 시점에 부른다. 띄울지 말지는 여기서 알아서 판단한다
export function maybeShowInterstitial() {
  try {
    actionCount += 1;
    if (actionCount % EVERY_N !== 0) return;
    if (Date.now() - lastShownAt < MIN_GAP_MS) return;
    if (!loaded || !interstitial) return;

    lastShownAt = Date.now();
    loaded = false;
    hideFloating();                                                 // ★ 새 줄
    interstitial.show().catch((e) => {                              // ★ 바뀐 줄
      console.log('[AD] 표시 실패:', e?.message);                   // ★ 새 줄
      restoreFloating();                                            // ★ 새 줄
    });                                                             // ★ 새 줄
  } catch (e) {
    console.log('[AD] 표시 실패:', e?.message);
    restoreFloating();                                              // ★ 새 줄
  }
}