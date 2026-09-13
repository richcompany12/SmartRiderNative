/**
 * backup.js  (신규)
 *
 * 개인 데이터를 파일 하나로 뽑아서 카톡·메일·보안폴더 등으로 내보내고,
 * 다시 읽어들이는 기능.
 *
 * ── 왜 서버가 아니라 파일인가 ────────────────────────────
 *  개인 데이터에는 공동현관 비밀번호가 들어있다.
 *  서버에 자동 백업하면 편하지만, 그 순간 "전국 비번 DB"가 서버에 생긴다.
 *  파일로 내보내면 대표님 본인만 쥐고 있게 되고,
 *  구글 플레이 데이터 보안 양식에도 "서버 전송 없음"으로 적을 수 있다.
 *
 * ── 주의 ────────────────────────────────────────────────
 *  백업 파일은 암호가 걸려 있지 않다. 비번이 그대로 들어있으므로
 *  아무 데나 올리면 안 된다. 이 경고는 화면에서도 보여준다.
 */

import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
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

const pad = (n) => String(n).padStart(2, '0');

// 파일 이름에 날짜·시각을 넣는다.
// 백업을 여러 개 갖고 있을 때 어느 게 최신인지 바로 보이게.
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

// ── 백업 파일 만들기 ─────────────────────────────────────
export const createBackupFile = async () => {
  const data = await exportPersonalData();
  const json = JSON.stringify(data);

  // 캐시 폴더에 만든다. 공유가 끝나면 안드로이드가 알아서 정리한다.
  const dir = FS.cacheDirectory || FS.documentDirectory;
  if (!dir) throw new Error('저장할 폴더를 찾지 못했습니다.');

  const uri = dir + makeFileName();
  await FS.writeAsStringAsync(uri, json, { encoding: 'utf8' });

  return { uri, counts: countOf(data), bytes: json.length };
};

// ── 백업 파일 내보내기 (공유 시트 열기) ──────────────────
// 카카오톡, 이메일, 드라이브, 보안 폴더 등 폰에 깔린 앱이 전부 뜬다.
export const shareBackup = async () => {
  const made = await createBackupFile();

  const can = await Sharing.isAvailableAsync();
  if (!can) throw new Error('이 기기에서는 파일 공유를 쓸 수 없습니다.');

  await Sharing.shareAsync(made.uri, {
    mimeType: 'application/json',
    dialogTitle: '스마트라이더 백업 저장',
    UTI: 'public.json',
  });

  return made;
};

// ── 백업 파일 고르기 ─────────────────────────────────────
// 바로 복원하지 않는다. 먼저 내용을 확인시켜 주고,
// 사용자가 합치기/덮어쓰기를 고른 뒤에 restoreFromData를 부른다.
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

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('파일 내용이 깨져 있습니다. 다른 백업 파일을 골라주세요.');
  }

  if (!data || data.format !== 'smartrider-backup') {
    throw new Error('스마트라이더 백업 파일이 아닙니다.');
  }

  return {
    data,
    name: asset.name || '백업 파일',
    exportedAt: data.exportedAt || null,
    counts: countOf(data),
  };
};

// ── 복원 ─────────────────────────────────────────────────
// mode: 'merge'(합치기, 기본) | 'replace'(덮어쓰기)
export const restoreFromData = async (data, mode = 'merge') => {
  return await importPersonalData(data, mode);
};