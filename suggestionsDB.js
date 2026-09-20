/**
 * suggestionsDB.js  (신규)
 *
 * 제보 저장과 조회.
 *
 * ── 제보는 승인 대기열이 아니다 ─────────────────────────
 *  "여기 새 건물 생겼어요, 배치도 만들어주세요"
 *  "12층은 호수 배치가 달라요"
 *  이런 요청이 올라온다. 제보 내용이 그대로 공용 건물이 되는 게 아니라,
 *  관리자가 읽고 자료를 직접 만들어서 등록하는 방식이다.
 *  그래서 승인/반려가 없고, 안 읽음 / 처리함 두 가지만 있다.
 *
 * ── 보안 규칙과 짝 ──────────────────────────────────────
 *  suggestions 목록 읽기는 어드민만 가능하다.
 *  일반 사용자는 자기가 올린 제보만 읽을 수 있는데, 그러려면
 *  각 제보에 uid가 저장돼 있어야 한다. 아래 saveSuggestion이 그걸 넣는다.
 */

import { db, auth } from './firebase';
import { ref, get, set, push, update, remove } from 'firebase/database';
import { deleteImageByUrl } from './imageUpload';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PATH = 'suggestions';
export const MY_SUGGEST_KEYS = 'my_suggestion_ids';

export const SUGGEST_TYPES = [
  { key: 'new', label: '새 건물', hint: '여기 건물이 생겼어요' },
  { key: 'wrong', label: '정보가 달라요', hint: '입구 변경, 층별 배치 차이 등' },
  { key: 'alert', label: '알림 지점', hint: '단속 카메라가 있어요' },
  { key: 'etc', label: '기타', hint: null },
];

export const typeLabel = (key) => {
  const t = SUGGEST_TYPES.find(t => t.key === key);
  return t ? t.label : '기타';
};

// ── 제보 보내기 ──────────────────────────────────────────
export const saveSuggestion = async ({ type, text, images, location, buildingName }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');

  const data = {
    uid: user.uid,                 // 보안 규칙이 이 값을 본다. 빼면 안 된다.
    email: user.email || '',
    type: type || 'etc',
    text: (text || '').trim(),
    buildingName: (buildingName || '').trim(),
    images: images || [],
    done: false,
    createdAt: Date.now(),
  };
  if (location) data.location = location;

  const newRef = push(ref(db, PATH));
  await set(newRef, data);

  // ★ 여기부터 새 블록
  // 탈퇴할 때 내 제보를 찾으려면 id를 알아야 한다.
  // suggestions 목록 읽기는 어드민만 되므로 폰에 기록해둔다.
  try {
    const raw = await AsyncStorage.getItem(MY_SUGGEST_KEYS);
    const list = raw ? JSON.parse(raw) : [];
    list.push(newRef.key);
    await AsyncStorage.setItem(MY_SUGGEST_KEYS, JSON.stringify(list));
  } catch (e) {}
  // ★ 새 블록 끝

  return newRef.key;
};

// ── 목록 (어드민) ────────────────────────────────────────
// 최신순으로 돌려준다.
export const getAllSuggestions = async () => {
  const snap = await get(ref(db, PATH));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .filter(([_, v]) => v !== null)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// ── 처리 표시 ────────────────────────────────────────────
export const setSuggestionDone = async (id, done) => {
  await update(ref(db, `${PATH}/${id}`), {
    done: !!done,
    doneAt: done ? Date.now() : null,
  });
};

// 제보를 지울 때 사진도 같이 지운다.
// DB 기록만 지우면 Storage에 파일만 남아 아무도 찾지 못하는 쓰레기가 된다.
// 사진을 먼저 지우는 이유: 순서를 반대로 하면 주소를 잃어버려서
// 남은 파일을 영영 못 지운다.
export const deleteSuggestion = async (id) => {
  const snap = await get(ref(db, `${PATH}/${id}`));
  const images = snap.exists() ? (snap.val().images || []) : [];

  for (const url of images) {
    await deleteImageByUrl(url);   // 실패해도 멈추지 않는다
  }

  await remove(ref(db, `${PATH}/${id}`));
};

// 안 읽은 제보 개수 — 사이드바 빨간점에 쓸 수 있다.
export const countUnreadSuggestions = async () => {
  const list = await getAllSuggestions();
  return list.filter(s => !s.done).length;
};