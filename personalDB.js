/**
 * personalDB.js  (신규)
 *
 * 개인 데이터 저장소 — 이 폰 안에만 저장된다. 서버로 절대 나가지 않는다.
 *
 * ── 왜 로컬인가 ──────────────────────────────────────────
 *  공동현관 비밀번호 같은 정보를 서버에 모으면
 *  "전국 아파트 현관 비번 DB"가 되고, 유출되면 주거침입 범죄에 직결된다.
 *  구글 플레이 심사에서도 민감정보 수집으로 분류되어 불리하다.
 *  "모든 개인 데이터는 내 폰에만 저장됩니다" — 이건 마케팅 자산이기도 하다.
 *
 * ── 저장하는 것 2가지 ────────────────────────────────────
 *  1) 개인 건물 : 내가 직접 등록한 건물 (통째로 로컬)
 *  2) 개인 메모 : 공용 건물 위에 덧씌우는 내 메모 (비번 등)
 *
 *  2번이 중요하다. 공용 건물에 비번을 적고 싶을 때
 *  공용 데이터를 건드리지 않고 내 폰에만 따로 붙여두는 장치다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BUILDINGS = 'personal_buildings_v1';
const KEY_NOTES = 'personal_notes_v1';
const KEY_FAVORITES = 'personal_favorites_v1';

// ── 내부 헬퍼 ────────────────────────────────────────────

// JSON 읽기. 데이터가 깨져 있어도 앱이 죽지 않게 기본값을 돌려준다.
const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed || fallback;
  } catch (e) {
    console.log('[PERSONAL] 읽기 실패:', key, e?.message);
    return fallback;
  }
};

const writeJson = async (key, value) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

// ── id 규칙 ──────────────────────────────────────────────
// 개인 건물 id는 반드시 'local_' 로 시작한다.
// Firebase push id와 겹치지 않게 하려는 것이고,
// 화면에서 "이건 내 데이터"를 판별할 때도 이걸 쓴다.

export const makeLocalId = () =>
  'local_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

export const isLocalId = (id) =>
  typeof id === 'string' && id.startsWith('local_');

// ── 1) 개인 건물 ─────────────────────────────────────────

// 목록으로 돌려준다. scope:'personal' 이 붙어 나오므로
// 화면에서 배지 표시할 때 이걸 보면 된다.
export const getPersonalBuildings = async () => {
  const map = await readJson(KEY_BUILDINGS, {});
  return Object.entries(map)
    .filter(([_, data]) => data !== null)
    .map(([id, data]) => ({ id, ...data, scope: 'personal' }));
};

export const getPersonalBuilding = async (id) => {
  const map = await readJson(KEY_BUILDINGS, {});
  if (!map[id]) return null;
  return { id, ...map[id], scope: 'personal' };
};

// 신규 등록이면 id 없이 넘기면 된다. 자동으로 만들어준다.
// 수정이면 기존 id를 그대로 넘긴다.
export const savePersonalBuilding = async (building) => {
  const map = await readJson(KEY_BUILDINGS, {});

  // scope는 저장하지 않는다. 읽을 때 붙여주는 값이라 중복 저장할 필요 없음.
  const { id, scope, ...data } = building;

  const key = isLocalId(id) ? id : makeLocalId();
  map[key] = { ...data, timestamp: Date.now() };

  await writeJson(KEY_BUILDINGS, map);
  return key;
};

export const deletePersonalBuilding = async (id) => {
  const map = await readJson(KEY_BUILDINGS, {});
  delete map[id];
  await writeJson(KEY_BUILDINGS, map);
};

// ── 2) 개인 메모 (공용 건물 위에 덧씌움) ──────────────────
// 구조: { "공용건물id": { memo, memo2, updatedAt } }

export const getPersonalNotes = async () => {
  return await readJson(KEY_NOTES, {});
};

export const getPersonalNote = async (buildingId) => {
  const map = await readJson(KEY_NOTES, {});
  return map[buildingId] || null;
};

// 둘 다 비어 있으면 저장하지 않고 지운다. 빈 껍데기가 쌓이는 걸 막는다.
export const savePersonalNote = async (buildingId, note) => {
  const map = await readJson(KEY_NOTES, {});

  const memo = (note?.memo || '').trim();
  const memo2 = (note?.memo2 || '').trim();

  if (!memo && !memo2) {
    delete map[buildingId];
  } else {
    map[buildingId] = { memo, memo2, updatedAt: Date.now() };
  }

  await writeJson(KEY_NOTES, map);
};

export const deletePersonalNote = async (buildingId) => {
  const map = await readJson(KEY_NOTES, {});
  delete map[buildingId];
  await writeJson(KEY_NOTES, map);
};

// ── 3) 즐겨찾기 ──────────────────────────────────────────
// 구조: { "건물id": true }
// 공용 건물이든 내 건물이든 똑같이 담을 수 있다.
// 이것도 내 폰에만 있다 — "내가 어느 건물을 자주 가는지"는 사생활이다.

export const getFavorites = async () => {
  return await readJson(KEY_FAVORITES, {});
};

export const isFavorite = async (buildingId) => {
  const map = await readJson(KEY_FAVORITES, {});
  return !!map[buildingId];
};

// 켜고 끄기. 바뀐 결과(true/false)를 돌려준다.
export const toggleFavorite = async (buildingId) => {
  const map = await readJson(KEY_FAVORITES, {});
  const next = !map[buildingId];
  if (next) map[buildingId] = true;
  else delete map[buildingId];
  await writeJson(KEY_FAVORITES, map);
  return next;
};

export const setFavorite = async (buildingId, on) => {
  const map = await readJson(KEY_FAVORITES, {});
  if (on) map[buildingId] = true;
  else delete map[buildingId];
  await writeJson(KEY_FAVORITES, map);
};

// ── 4) 통계 (설정 화면에서 "내 데이터 N건" 표시용) ────────

export const countPersonalData = async () => {
  const buildings = await readJson(KEY_BUILDINGS, {});
  const notes = await readJson(KEY_NOTES, {});
  const favorites = await readJson(KEY_FAVORITES, {});
  return {
    buildings: Object.keys(buildings).length,
    notes: Object.keys(notes).length,
    favorites: Object.keys(favorites).length,
  };
};

// ── 5) 백업 / 복원용 ─────────────────────────────────────
// 실제 파일 저장과 공유는 backup.js가 맡는다.
// 여기서는 "데이터를 통째로 꺼내고 넣는 것"만 한다.

export const exportPersonalData = async () => {
  return {
    format: 'smartrider-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    buildings: await readJson(KEY_BUILDINGS, {}),
    notes: await readJson(KEY_NOTES, {}),
    favorites: await readJson(KEY_FAVORITES, {}),
  };
};

/**
 * mode:
 *   'merge'   기존 데이터 유지 + 백업파일 내용 덮어쓰기 (기본, 안전)
 *   'replace' 기존 데이터 전부 지우고 백업파일로 교체
 *
 * 반환: { buildings: n, notes: n, favorites: n }  — 들어온 건수
 */
export const importPersonalData = async (data, mode = 'merge') => {
  if (!data || data.format !== 'smartrider-backup') {
    throw new Error('스마트라이더 백업 파일이 아닙니다.');
  }

  const inBuildings = data.buildings || {};
  const inNotes = data.notes || {};
  const inFavorites = data.favorites || {};   // version 1 백업에는 없다

  let buildings = inBuildings;
  let notes = inNotes;
  let favorites = inFavorites;

  if (mode === 'merge') {
    const curB = await readJson(KEY_BUILDINGS, {});
    const curN = await readJson(KEY_NOTES, {});
    const curF = await readJson(KEY_FAVORITES, {});
    buildings = { ...curB, ...inBuildings };
    notes = { ...curN, ...inNotes };
    favorites = { ...curF, ...inFavorites };
  }

  await writeJson(KEY_BUILDINGS, buildings);
  await writeJson(KEY_NOTES, notes);
  await writeJson(KEY_FAVORITES, favorites);

  return {
    buildings: Object.keys(inBuildings).length,
    notes: Object.keys(inNotes).length,
    favorites: Object.keys(inFavorites).length,
  };
};

// 전체 삭제. "계정 삭제" 기능에서 쓴다.
// 되돌릴 수 없으므로 반드시 확인 팝업을 거친 뒤에 호출할 것.
export const clearPersonalData = async () => {
  await AsyncStorage.multiRemove([KEY_BUILDINGS, KEY_NOTES, KEY_FAVORITES]);
};