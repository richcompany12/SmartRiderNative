/**
 * migration.js  (신규)
 *
 * 서버에 쌓여 있는 공용 건물(약 1000건)을 내 폰으로 회수하고,
 * 검증된 것만 다시 공용으로 올리기 위한 도구.
 *
 * ── 왜 이 순서인가 ──────────────────────────────────────
 *  지금은 1000건 전부가 "로그인한 사람이면 누구나 열람"이다.
 *  반대 순서(서버에 두고 하나씩 개인으로 내리기)로 하면
 *  분류하는 내내 나머지가 계속 공개 상태로 남는다.
 *  "전부 회수 → 검증된 것만 공개"가 안전한 방향이다.
 *
 * ── 단계 ────────────────────────────────────────────────
 *  1) importServerToPersonal()    서버 → 내 폰 복사 (서버는 그대로 둠)
 *  2) (백업 파일 저장)
 *  3) promoteToPublic(건물)       하나씩 공용으로 승격
 *  4) deleteOriginalsFromServer() 1)에서 기록해둔 원본만 일괄 삭제
 *
 *  4번 전까지는 아무것도 사라지지 않는다.
 */

import { db } from './firebase';
import { ref, update } from 'firebase/database';
import { getAllBuildings, saveBuilding } from './firebaseDB';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  importPersonalData,
  savePersonalNote,
  deletePersonalBuilding,
} from './personalDB';

const KEY_STATE = 'migration_state_v1';

// ── 진행 상태 저장 ───────────────────────────────────────
// idMap: { "서버id": "로컬id" }  — 뭘 가져왔는지, 뭘 지워도 되는지의 근거
export const getMigrationState = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY_STATE);
    return raw ? JSON.parse(raw) : { idMap: {} };
  } catch (e) {
    return { idMap: {} };
  }
};

const saveState = async (state) => {
  await AsyncStorage.setItem(KEY_STATE, JSON.stringify(state));
};

// ── 1) 서버 → 내 폰 ──────────────────────────────────────
// 서버는 전혀 건드리지 않는다. 복사만 한다.
// 두 번 눌러도 이미 가져온 건 건너뛰므로 중복이 생기지 않는다.
export const importServerToPersonal = async () => {
  const state = await getMigrationState();
  const idMap = { ...(state.idMap || {}) };

  const serverList = await getAllBuildings();

  const stamp = Date.now();
  const buildingsMap = {};
  let added = 0;
  let skipped = 0;

  serverList.forEach((b, i) => {
    if (idMap[b.id]) { skipped++; return; }

    const { id, scope, ...data } = b;

    // 시간+순번이라 1000건을 한 번에 넣어도 절대 겹치지 않는다
    const localId = `local_${stamp}_${i}`;

    buildingsMap[localId] = {
      ...data,
      fromServerId: id,              // 어디서 왔는지 흔적을 남긴다
      timestamp: data.timestamp || stamp,
    };
    idMap[id] = localId;
    added++;
  });

  if (added > 0) {
    // 한 건씩 저장하면 1000번 읽고 쓰느라 느리다. 한 번에 합친다.
    await importPersonalData(
      { format: 'smartrider-backup', version: 1, buildings: buildingsMap, notes: {} },
      'merge'
    );
  }

  await saveState({
    ...state,
    idMap,
    importedAt: Date.now(),
    serverCount: serverList.length,
  });

  return { added, skipped, total: serverList.length };
};

// ── 3) 개인 건물 → 공용으로 승격 ─────────────────────────
// ★ 출입 정보(memo, memo2)는 올리지 않는다.
//   현관 비밀번호가 서버에 쌓이면 유출 시 주거침입 범죄에 직결된다.
//   비번은 내 폰에 "개인 메모"로 옮겨 붙이고, 공용에는 빈 칸으로 올린다.
export const promoteToPublic = async (building) => {
  const {
    id, scope, memo, memo2,
    publicMemo, publicMemo2, hasPersonalNote, fromServerId,
    ...rest
  } = building;

  if (!rest.name) throw new Error('이름이 없는 건물은 올릴 수 없습니다.');

  // id를 안 넘기면 firebaseDB가 새 id를 만들어준다
  const newId = await saveBuilding({
    ...rest,
    memo: '',
    memo2: '',
    promotedAt: Date.now(),
  });

  // 비번은 내 폰에만 남긴다 (새 공용 id에 붙여서)
  if ((memo || '').trim() || (memo2 || '').trim()) {
    await savePersonalNote(newId, { memo, memo2 });
  }

  // 개인 사본은 지운다. 안 지우면 목록에 두 번 나온다.
  if (id) await deletePersonalBuilding(id);

  return newId;
};

// ── 4) 서버의 원본만 삭제 ────────────────────────────────
// 1)에서 기록해둔 id만 지운다.
// 3)에서 승격한 건물은 새 id라 이 목록에 없으므로 살아남는다.
export const deleteOriginalsFromServer = async (onProgress) => {
  const state = await getMigrationState();
  const ids = Object.keys(state.idMap || {});
  if (ids.length === 0) return { done: 0, failed: 0, total: 0 };

  let done = 0;
  let failed = 0;

  // 한 건씩 지우면 1000번 왕복한다. 100개씩 묶어서 한 번에 지운다.
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const patch = {};
    chunk.forEach(id => { patch[id] = null; });

    try {
      await update(ref(db, 'buildings'), patch);
      done += chunk.length;
    } catch (e) {
      console.log('[MIGRATION] 삭제 실패:', e?.message);
      failed += chunk.length;
    }
    onProgress?.(done + failed, ids.length);
  }

  await saveState({ ...state, deletedAt: Date.now(), deletedCount: done });
  return { done, failed, total: ids.length };
};

// 이전 기록 초기화. 처음부터 다시 하고 싶을 때만.
// 폰에 들어온 건물 데이터를 지우는 게 아니라 "어디서 왔는지 기록"만 지운다.
export const resetMigrationState = async () => {
  await AsyncStorage.removeItem(KEY_STATE);
};