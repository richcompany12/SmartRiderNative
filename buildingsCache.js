/**
 * buildingsCache.js  (교체)
 *
 * 공용 건물(Firebase) + 개인 건물(폰) + 개인 메모(폰)를 하나로 합쳐서 돌려준다.
 * 화면들은 이 파일만 부르면 되고, 데이터가 어디서 왔는지 신경 쓸 필요가 없다.
 *
 * ── 캐시 정책 ────────────────────────────────────────────
 *  공용 : 3시간 캐시. Firebase 요금 폭탄 방지.
 *  개인 : 캐시 안 함. 폰 안에서 읽는 거라 비용이 없고,
 *         방금 등록한 게 목록에 안 보이면 고장으로 느껴지기 때문.
 *
 * ── 합친 결과에 붙는 표시 ────────────────────────────────
 *  scope           'public' | 'personal'   — 배지 표시에 사용
 *  hasPersonalNote true                    — 공용 건물에 내 메모가 덧씌워진 경우
 *  publicMemo      원래 공용 메모           — 내 메모로 덮기 전 값 보관
 */

import { getAllBuildings } from './firebaseDB';
import { getPersonalBuildings, getPersonalNotes, getFavorites } from './personalDB';

let _publicCache = null;
let _publicCacheTime = 0;
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3시간

// ── 공용 건물만 (캐시 적용) ──────────────────────────────
const loadPublicBuildings = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && _publicCache && (now - _publicCacheTime < CACHE_TTL)) {
    return _publicCache;
  }
  const list = await getAllBuildings();
  _publicCache = list.map((b) => ({ ...b, scope: 'public' }));
  _publicCacheTime = now;
  return _publicCache;
};

// ── 공용 건물에 내 메모 덧씌우기 ─────────────────────────
// 공용 메모를 지우지 않고 publicMemo로 옮겨둔다.
// 나중에 "이건 관리자 정보 / 이건 내 메모"로 나눠 보여줄 수 있게.
const applyPersonalNotes = (publicList, notes) => {
  return publicList.map((b) => {
    const note = notes[b.id];
    if (!note) return b;

    return {
      ...b,
      publicMemo: b.memo || '',
      publicMemo2: b.memo2 || '',
      memo: note.memo || b.memo || '',
      memo2: note.memo2 || b.memo2 || '',
      hasPersonalNote: true,
    };
  });
};

// ── 메인 함수 ────────────────────────────────────────────
// 기존 코드가 부르던 이름 그대로 유지했다. 화면 쪽은 고칠 필요 없다.
export const getCachedBuildings = async (forceRefresh = false) => {
  const [publicList, personalList, notes, favorites] = await Promise.all([
    loadPublicBuildings(forceRefresh),
    getPersonalBuildings(),
    getPersonalNotes(),
    getFavorites(),
  ]);

  const merged = applyPersonalNotes(publicList, notes);

  // 개인 건물을 뒤에 붙이고, 즐겨찾기 표시를 달아준다.
  // 화면에서는 b.isFav 만 보면 된다.
  return [...merged, ...personalList].map(b => ({
    ...b,
    isFav: !!favorites[b.id],
  }));
};

// 공용만 필요할 때 (어드민 관리 화면 등)
export const getPublicBuildingsOnly = async (forceRefresh = false) => {
  return await loadPublicBuildings(forceRefresh);
};

// 공용 캐시만 비운다. 개인 데이터는 캐시가 없으므로 대상 아님.
export const invalidateBuildingsCache = () => {
  _publicCache = null;
  _publicCacheTime = 0;
};