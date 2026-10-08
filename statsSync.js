/**
 * statsSync.js (v6, 14·15번)
 *
 * 활동 지역·제휴 안내 수신 동의는 폰에 저장하고,
 * 라이더 통계를 users/{uid}/stats 에 올린다.
 *
 * ── 서버에 올리는 것 (이것만) ─────────────────────────────
 *  regions          라이더가 직접 고른 활동 지역 (최대 3곳, 예: "경기 화성시")
 *  buildingCount    내 폰 건물 "개수"만 (이름·메모·위치는 절대 안 올림)
 *  lastActiveDate   마지막 접속일 — 날짜만 (시각 없음), 하루 1번
 *  appVersion       APP_VERSION_CODE
 *  partnerOptIn     지역 파트너·제휴 안내 이메일 수신 동의 (기본 false)
 *  partnerOptInDate 동의한 날짜 (2년마다 재확인용). 동의를 끄면 지움
 *
 * ── 위치정보 원칙 ────────────────────────────────────────
 *  기기 위치(좌표·경로)는 여기서 절대 다루지 않는다. 활동 지역도 라이더가 직접 고른 값만.
 *
 * 지난번에 올린 값과 같으면 안 올린다 (바뀔 때만). 접속일은 날짜가 바뀌면 달라지므로 하루 1번.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set } from 'firebase/database';
import { db, auth } from './firebase';
import { countPersonalData } from './personalDB';
import { APP_VERSION_CODE } from './UpdateGate';
import { MAX_REGIONS } from './regions';

const KEY_REGIONS = 'active_regions';
const KEY_PARTNER = 'partner_opt_in';
// v2: 10-08 두 요청이 동시에 돌다 "마지막으로 올린 값" 기억이 꼬였던 폰도 한 번 다시 올리게 이름을 바꿈
const KEY_LAST = 'stats_last_uploaded_v2_';   // + uid

// 오늘 날짜 (폰 시간 기준) "2026-10-08"
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 활동 지역 ────────────────────────────────────────────
export const getRegions = async () => {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(KEY_REGIONS)) || '[]');
    return Array.isArray(list) ? list.slice(0, MAX_REGIONS) : [];
  } catch (e) {
    return [];
  }
};

export const saveRegions = async (list) => {
  await AsyncStorage.setItem(KEY_REGIONS, JSON.stringify((list || []).slice(0, MAX_REGIONS)));
  syncStats('지역 변경');
};

// ── 제휴 안내 수신 동의 ──────────────────────────────────
export const getPartnerOptIn = async () => {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY_PARTNER)) || 'null');
    return v && v.on ? { on: true, date: v.date || null } : { on: false, date: null };
  } catch (e) {
    return { on: false, date: null };
  }
};

// 켜면 오늘 날짜를 동의일로, 끄면 동의일을 지운다 (철회 시 파기)
export const setPartnerOptIn = async (on) => {
  const cur = await getPartnerOptIn();
  const next = on ? { on: true, date: cur.on && cur.date ? cur.date : today() } : { on: false, date: null };
  await AsyncStorage.setItem(KEY_PARTNER, JSON.stringify(next));
  syncStats(on ? '제휴 안내 동의' : '제휴 안내 철회');
  return next;
};

// ── 통계 올리기 ──────────────────────────────────────────
// 한 번에 하나만 돈다. 도는 중에 요청이 오면 끝난 뒤 최신 값으로 한 번만 더 돈다.
// (동시에 두 번 돌면 서버 값과 "마지막으로 올린 값" 기억이 어긋나서, 다음 변경을 같은 값으로 착각하고 안 올렸음 — 10-08)
let running = null;
let again = false;
let againReason = '';

export const syncStats = (reason = '') => {
  if (running) {
    again = true;
    againReason = reason;
    return running;
  }
  running = (async () => {
    try {
      await uploadOnce(reason);
      while (again) {
        again = false;
        await uploadOnce(againReason);
      }
    } finally {
      running = null;
    }
  })();
  return running;
};

const uploadOnce = async (reason) => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const regions = await getRegions();
    const partner = await getPartnerOptIn();
    let buildingCount = 0;
    try {
      buildingCount = (await countPersonalData()).buildings || 0;
    } catch (e) {}

    const stats = {
      regions,
      buildingCount,
      lastActiveDate: today(),
      appVersion: APP_VERSION_CODE,
      partnerOptIn: partner.on,
    };
    if (partner.on && partner.date) stats.partnerOptInDate = partner.date;

    const snap = JSON.stringify(stats);
    const lastKey = KEY_LAST + user.uid;
    if ((await AsyncStorage.getItem(lastKey)) === snap) return;   // 바뀐 게 없으면 안 올림

    // set = stats 칸 통째로 교체 → 동의를 끄면 partnerOptInDate 도 서버에서 지워진다
    await set(ref(db, `users/${user.uid}/stats`), stats);
    await AsyncStorage.setItem(lastKey, snap);
    console.log(`[STATS] 올림 (${reason}) 지역 ${regions.length}곳, 건물 ${buildingCount}개, 제휴 ${partner.on}`);
  } catch (e) {
    console.log('[STATS] 올리기 실패 (다음에 다시):', e?.message);
  }
};
