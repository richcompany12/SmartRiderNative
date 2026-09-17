/**
 * accountDelete.js
 *
 * 회원 탈퇴. 되돌릴 수 없다.
 *
 * ── 순서가 중요하다 ──────────────────────────────────────
 *  계정(Auth)을 먼저 지우면 권한이 사라져 나머지를 못 지운다.
 *  보안 규칙이 uid 기준이기 때문이다. Auth 삭제는 반드시 맨 마지막.
 *
 * ── 제보를 찾는 법 ───────────────────────────────────────
 *  suggestions 목록 읽기는 어드민만 가능하다.
 *  그래서 제보할 때 폰에 적어둔 id 목록을 보고 하나씩 지운다.
 *  이 방식 이전에 올린 제보는 id가 없어 남을 수 있다. 11장 참조.
 *
 * ── 지우지 않는 것 ───────────────────────────────────────
 *  공용 건물(buildings)과 알림지점(alerts)은 남긴다.
 *  다른 회원이 함께 쓰는 자료이고 등록자 개인 소유가 아니다.
 */

import { ref, remove } from 'firebase/database';
import { ref as sRef, listAll, deleteObject } from 'firebase/storage';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage, auth } from './firebase';
import { clearPersonalData } from './personalDB';
import { MY_SUGGEST_KEYS } from './suggestionsDB';

// Firebase는 오래된 로그인 세션으로 계정 삭제를 허용하지 않는다.
// (auth/requires-recent-login)
export const reauth = async (password) => {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('로그인 정보를 찾을 수 없습니다.');
  const cred = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, cred);
};

// 제보 사진 (Storage) — suggestions/{uid}/ 는 본인 쓰기 권한이 있다
const deleteMyPhotos = async (uid) => {
  try {
    const listed = await listAll(sRef(storage, `suggestions/${uid}`));
    for (const item of listed.items) {
      try { await deleteObject(item); } catch (e) {}
    }
  } catch (e) {
    console.log('[DEL] 제보 사진 없음 또는 실패:', e?.message);
  }
};

// 제보 글 (DB) — 폰에 적어둔 id만 지운다
const deleteMySuggestions = async () => {
  try {
    const raw = await AsyncStorage.getItem(MY_SUGGEST_KEYS);
    const list = raw ? JSON.parse(raw) : [];
    for (const id of list) {
      try { await remove(ref(db, `suggestions/${id}`)); } catch (e) {}
    }
    await AsyncStorage.removeItem(MY_SUGGEST_KEYS);
  } catch (e) {
    console.log('[DEL] 제보 삭제 실패:', e?.message);
  }
};

/**
 * 탈퇴 실행. reauth()를 통과한 뒤에만 부른다.
 * wipeLocal=true면 이 폰의 건물·메모·즐겨찾기도 함께 지운다.
 */
export const deleteAccount = async (wipeLocal) => {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.');
  const uid = user.uid;

  await deleteMyPhotos(uid);
  await deleteMySuggestions();

  try { await remove(ref(db, `users/${uid}`)); } catch (e) {
    console.log('[DEL] 프로필 삭제 실패:', e?.message);
  }

  if (wipeLocal) await clearPersonalData();

  // 마지막. 이걸 하면 권한이 사라진다.
  await deleteUser(user);
};