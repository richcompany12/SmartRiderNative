/**
 * backup.js  (암호화 버전 — 2026.09.15)
 *
 * 개인 데이터를 파일 하나로 뽑아서 카톡·메일·보안폴더 등으로 내보내고,
 * 다시 읽어들이는 기능.
 *
 * ── 왜 서버가 아니라 파일인가 ────────────────────────────
 *  개인 데이터에는 공동현관 비밀번호가 들어있다.
 *  서버에 자동 백업하면 편하지만, 그 순간 "전국 비번 DB"가 서버에 생긴다.
 *  파일로 내보내면 본인만 쥐고 있게 되고,
 *  구글 플레이 데이터 보안 양식에도 "서버 전송 없음"으로 적을 수 있다.
 *
 * ── 09-15 변경: 파일 자체를 암호화한다 ───────────────────
 *  예전에는 평문 JSON이었다. 카톡으로 보내는 순간 비번 1,000건이
 *  카톡 서버에 그대로 얹혔다. 이제는 사용자가 정한 비밀번호로
 *  AES-256 암호화해서 내보낸다. 파일을 주워도 비번 없이는 못 연다.
 *
 *  ※ 열쇠는 비밀번호에서 그때그때 만들어낸다(PBKDF2).
 *    폰이나 서버에 열쇠를 저장하지 않으므로
 *    "파일 + 비밀번호"만 있으면 어느 폰에서든 복원된다.
 *    반대로 비밀번호를 잊으면 누구도 못 연다. 나도 못 연다.
 *
 * ── 옛 백업 파일 ────────────────────────────────────────
 *  09-14에 만든 평문 백업(1,095건)도 그대로 복원된다.
 *  파일을 고르면 암호화 여부를 자동으로 판별한다.
 */

import 'react-native-get-random-values';   // ← crypto-js보다 먼저!
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { exportPersonalData, importPersonalData } from './personalDB';

// expo-file-system은 버전에 따라 API가 크게 바뀌었다.
// 예전 방식(writeAsStringAsync)이 있는 쪽을 골라서 쓴다.
let FS;
try {
  FS = require('expo-file-system/legacy');
  if (!FS || typeof FS.writeAsStringAsync !== 'function') {
    FS = require('expo-file-system');
  }
} catch (e) {
  FS = require('expo-file-system');
}

// ── 상수 ────────────────────────────────────────────────
const FORMAT_PLAIN = 'smartrider-backup';      // 옛 평문 파일
const FORMAT_ENC = 'smartrider-backup-enc';    // 새 암호화 파일
const MAGIC = 'SRB1';                          // 비번이 맞는지 확인하는 도장
const ITER = 10000;                            // 열쇠 만들 때 반복 횟수
const PW_KEY = 'smartrider_backup_password';   // SecureStore 저장 키

const pad = (n) => String(n).padStart(2, '0');

// 파일 이름에 날짜·시각을 넣는다.
// 백업을 여러 개 갖고 있을 때 어느 게 최신인지 바로 보이게.
//
// 확장자는 .json 그대로 둔다. .srb 같은 낯선 확장자로 바꾸면
// 카카오톡이 전송을 막는 경우가 있다.
const makeFileName = () => {
  const d = new Date();
  return 'smartrider-backup-'
    + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes())
    + '.json';
};

const countOf = (data) => ({
  buildings: Object.keys(data.buildings || {}).length,
  notes: Object.keys(data.notes || {}).length,
  favorites: Object.keys(data.favorites || {}).length,
});

// ════════════════════════════════════════════════════════
//  비밀번호 규칙
// ════════════════════════════════════════════════════════

/**
 * 문제가 있으면 안내 문구를 돌려주고, 괜찮으면 null을 돌려준다.
 *
 * 숫자만 6자리로 하면 경우의 수가 100만개뿐이라 PC로 몇 분이면 뚫린다.
 * 파일을 주운 사람은 무제한으로 시도할 수 있어서 횟수 제한도 못 건다.
 * 그래서 영문+숫자 8자 이상을 강제한다.
 */
export const validatePassword = (pw) => {
  if (!pw || pw.length < 8) return '8자 이상으로 정해주세요.';
  if (!/[a-zA-Z]/.test(pw)) return '영문을 하나 이상 넣어주세요.';
  if (!/[0-9]/.test(pw)) return '숫자를 하나 이상 넣어주세요.';
  if (/\s/.test(pw)) return '띄어쓰기는 쓸 수 없습니다.';
  return null;
};

// ════════════════════════════════════════════════════════
//  비밀번호 보관 (앱 안에서 다시 보기용)
// ════════════════════════════════════════════════════════
//
// 안드로이드 키스토어에 암호화되어 저장된다. AsyncStorage와 달리
// 루팅하지 않으면 다른 앱이 못 읽는다.
//
// 이 폰이 살아있는 동안에는 언제든 확인할 수 있게 하는 게 목적이다.
// 대부분은 폰이 죽기 전에 폰을 바꾸므로, 기변 전날 확인해서
// 메모해두면 된다.

export const saveBackupPassword = async (pw) => {
  try {
    await SecureStore.setItemAsync(PW_KEY, pw);
  } catch (e) {
    // 저장에 실패해도 백업 자체는 성공시킨다.
    console.warn('[backup] 비밀번호 보관 실패', e);
  }
};

export const getSavedPassword = async () => {
  try {
    return await SecureStore.getItemAsync(PW_KEY);
  } catch (e) {
    return null;
  }
};

export const clearSavedPassword = async () => {
  try {
    await SecureStore.deleteItemAsync(PW_KEY);
  } catch (e) {
    /* 무시 */
  }
};

// ════════════════════════════════════════════════════════
//  암호화 / 복호화
// ════════════════════════════════════════════════════════

// 비밀번호 → 열쇠.
// 소금(salt)을 섞어 10,000번 돌린다. 같은 비번이라도 파일마다
// 소금이 달라서 열쇠가 달라지고, 미리 만들어둔 표로 뚫는 공격을 막는다.
const makeKey = (password, salt) =>
  CryptoJS.PBKDF2(password, salt, {
    keySize: 8,              // 8 × 32bit = 256bit
    iterations: ITER,
    hasher: CryptoJS.algo.SHA256,
  });

// ── 백업 파일 만들기 ─────────────────────────────────────
export const createBackupFile = async (password) => {
  const bad = validatePassword(password);
  if (bad) throw new Error(bad);

  const data = await exportPersonalData();
  const counts = countOf(data);

  // 암호화는 1,000건 기준 몇 초 걸린다.
  // 화면이 멈춘 것처럼 보이지 않게 한 틱 양보해서 로딩 표시가 먼저 그려지게 한다.
  await new Promise((r) => setTimeout(r, 50));

  const salt = CryptoJS.lib.WordArray.random(16);
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = makeKey(password, salt);

  // 평문 앞에 도장을 찍어둔다. 복원할 때 이 도장이 나오는지로
  // 비밀번호가 맞았는지 판단한다.
  const cipher = CryptoJS.AES.encrypt(MAGIC + JSON.stringify(data), key, { iv });

  // 겉면(개수·날짜)은 일부러 암호화하지 않는다.
  // 복원 화면에서 "1,095건 / 9월 14일"을 먼저 보여줘야
  // 사용자가 어느 파일인지 고를 수 있다.
  const file = {
    format: FORMAT_ENC,
    v: 1,
    alg: 'AES-256-CBC',
    iter: ITER,
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
    exportedAt: data.exportedAt || new Date().toISOString(),
    counts,
    data: cipher.toString(),
  };

  const json = JSON.stringify(file);

  // 캐시 폴더에 만든다. 공유가 끝나면 안드로이드가 알아서 정리한다.
  const dir = FS.cacheDirectory || FS.documentDirectory;
  if (!dir) throw new Error('저장할 폴더를 찾지 못했습니다.');

  const uri = dir + makeFileName();
  await FS.writeAsStringAsync(uri, json, { encoding: 'utf8' });

  return { uri, counts, bytes: json.length };
};

// ── 백업 파일 내보내기 (공유 시트 열기) ──────────────────
// 카카오톡, 이메일, 드라이브, 보안 폴더 등 폰에 깔린 앱이 전부 뜬다.
export const shareBackup = async (password) => {
  const made = await createBackupFile(password);

  const can = await Sharing.isAvailableAsync();
  if (!can) throw new Error('이 기기에서는 파일 공유를 쓸 수 없습니다.');

  await Sharing.shareAsync(made.uri, {
    mimeType: 'application/json',
    dialogTitle: '스마트라이더 백업 저장',
    UTI: 'public.json',
  });

  // 다음에 "비밀번호 다시 보기"로 확인할 수 있게 보관해둔다.
  await saveBackupPassword(password);

  // 마지막 백업 시점·개수를 기록해두면
  // "백업 이후 30건 늘었습니다" 같은 안내를 띄울 수 있다.
  await markBackupDone(made.counts);

  return made;
};

// ── 백업 파일 고르기 ─────────────────────────────────────
// 바로 복원하지 않는다. 먼저 내용을 확인시켜 주고,
// 암호화된 파일이면 비밀번호를 받은 뒤 decryptBackup을 부른다.
export const pickBackupFile = async () => {
  // type을 'application/json'으로 좁히면 일부 기기에서 파일이 안 보인다.
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (res.canceled) return null;

  const asset = res.assets && res.assets[0];
  if (!asset?.uri) throw new Error('파일을 읽지 못했습니다.');

  const text = await FS.readAsStringAsync(asset.uri, { encoding: 'utf8' });

  let file;
  try {
    file = JSON.parse(text);
  } catch (e) {
    throw new Error('파일 내용이 깨져 있습니다. 다른 백업 파일을 골라주세요.');
  }

  const name = asset.name || '백업 파일';

  // ① 새 암호화 파일 — 비밀번호를 받아야 한다
  if (file && file.format === FORMAT_ENC) {
    return {
      encrypted: true,
      file,                                  // decryptBackup에 그대로 넘긴다
      name,
      exportedAt: file.exportedAt || null,
      counts: file.counts || { buildings: 0, notes: 0, favorites: 0 },
    };
  }

  // ② 옛 평문 파일 — 바로 복원 가능
  if (file && file.format === FORMAT_PLAIN) {
    return {
      encrypted: false,
      data: file,
      name,
      exportedAt: file.exportedAt || null,
      counts: countOf(file),
    };
  }

  throw new Error('스마트라이더 백업 파일이 아닙니다.');
};

// ── 암호 풀기 ────────────────────────────────────────────
// pickBackupFile이 encrypted: true를 돌려줬을 때만 부른다.
export const decryptBackup = async (file, password) => {
  if (!password) throw new Error('비밀번호를 입력해주세요.');

  await new Promise((r) => setTimeout(r, 50)); // 로딩 표시 먼저 그리기

  const key = makeKey(password, CryptoJS.enc.Base64.parse(file.salt));

  let text = '';
  try {
    const dec = CryptoJS.AES.decrypt(file.data, key, {
      iv: CryptoJS.enc.Base64.parse(file.iv),
    });
    text = dec.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    // 비번이 틀리면 쓰레기값이 나와서 UTF-8 변환에서 터진다. 정상 흐름이다.
    text = '';
  }

  if (!text.startsWith(MAGIC)) {
    throw new Error('비밀번호가 맞지 않습니다.');
  }

  try {
    return JSON.parse(text.slice(MAGIC.length));
  } catch (e) {
    throw new Error('파일 내용이 손상되었습니다.');
  }
};

// ── 복원 ─────────────────────────────────────────────────
// mode: 'merge'(합치기, 기본) | 'replace'(덮어쓰기)
export const restoreFromData = async (data, mode = 'merge') => {
  return await importPersonalData(data, mode);
};

// ════════════════════════════════════════════════════════
//  백업 권유 알림 (100건 트리거)
// ════════════════════════════════════════════════════════
//
// 사람은 자기가 쌓아놓은 게 아까워지는 순간에 움직인다.
// 세 가지 중 하나라도 걸리면 권유한다.
//
//   ① 건물 100개 돌파 (아직 한 번도 백업 안 함)
//   ② 마지막 백업 이후 30건 늘어남
//   ③ 마지막 백업 이후 30일 지남
//
// 같은 안내를 계속 띄우면 짜증나므로 7일에 한 번만 띄운다.

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_BACKUP_KEY = 'backup_last_done';   // { at, buildings }
const LAST_NUDGE_KEY = 'backup_last_nudge';   // ISO 문자열

const DAY = 24 * 60 * 60 * 1000;

const readJSON = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

// 백업에 성공하면 호출된다 (shareBackup 안에서 자동)
export const markBackupDone = async (counts) => {
  try {
    await AsyncStorage.setItem(
      LAST_BACKUP_KEY,
      JSON.stringify({ at: new Date().toISOString(), buildings: counts.buildings })
    );
  } catch (e) {
    /* 무시 */
  }
};

/**
 * 백업을 권해야 하는 상황이면 안내 문구를 돌려준다. 아니면 null.
 *
 * 홈 화면이 뜰 때 한 번 불러서, 값이 있으면 팝업을 띄우면 된다.
 */
export const checkBackupNudge = async (currentBuildings) => {
  const last = await readJSON(LAST_BACKUP_KEY);
  const nudgedAt = await AsyncStorage.getItem(LAST_NUDGE_KEY);

  // 최근 7일 안에 이미 권했으면 조용히 넘어간다
  if (nudgedAt && Date.now() - new Date(nudgedAt).getTime() < 7 * DAY) {
    return null;
  }

  let reason = null;

  if (!last) {
    // 한 번도 백업한 적이 없다
    if (currentBuildings >= 100) {
      reason = {
        title: `건물 ${currentBuildings}개를 모으셨어요`,
        body: '폰이 고장나면 전부 사라집니다.\n지금 백업해두세요.',
      };
    }
  } else {
    const grown = currentBuildings - (last.buildings || 0);
    const days = Math.floor((Date.now() - new Date(last.at).getTime()) / DAY);

    if (grown >= 30) {
      reason = {
        title: `백업 이후 ${grown}개가 늘었어요`,
        body: '새로 모은 건물은 아직 백업에 없습니다.',
      };
    } else if (days >= 30) {
      reason = {
        title: `백업한 지 ${days}일 지났어요`,
        body: '한 달에 한 번은 백업해두시는 걸 권합니다.',
      };
    }
  }

  if (reason) {
    await AsyncStorage.setItem(LAST_NUDGE_KEY, new Date().toISOString());
  }
  return reason;
};