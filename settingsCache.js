import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────
//  앱 설정을 한 곳에서 관리한다.
//  값이 바뀌면 반드시 Kotlin 서비스에도 다시 넘겨야 한다.
//  (넘기는 일은 SettingsScreen이 한다)
// ─────────────────────────────────────────────────────────

const RADIUS_KEY = 'proximity_radius';
const DEFAULT_RADIUS = 20;              // 건물 감지 반경 (m)

const FLOATING_KEY = 'floating_enabled';
const ALERT_DISTANCE_KEY = 'alert_distance';
const ALERT_SOUND_KEY = 'alert_sound';
const ALERT_TYPES_KEY = 'alert_types';

const DEFAULT_ALERT_DISTANCE = 100;     // 강력알림 진입 거리 (m)

// 이륜차는 앞번호판이 없어서 전방카메라에 안 걸린다 → 기본 꺼짐
const DEFAULT_ALERT_TYPES = {
  rear: true,
  front: false,
  parking: true,
  etc: true,
};

let _cache = null;

const readBool = async (key, fallback) => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch (e) { return fallback; }
};

const readInt = async (key, fallback) => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === null ? fallback : parseInt(v, 10);
  } catch (e) { return fallback; }
};

export const getSettings = async () => {
  if (_cache) return _cache;
  let types = DEFAULT_ALERT_TYPES;
  try {
    const raw = await AsyncStorage.getItem(ALERT_TYPES_KEY);
    if (raw) types = { ...DEFAULT_ALERT_TYPES, ...JSON.parse(raw) };
  } catch (e) {}

  _cache = {
    radius: await readInt(RADIUS_KEY, DEFAULT_RADIUS),
    floating: await readBool(FLOATING_KEY, true),
    alertDistance: await readInt(ALERT_DISTANCE_KEY, DEFAULT_ALERT_DISTANCE),
    alertSound: await readBool(ALERT_SOUND_KEY, true),
    alertTypes: types,
  };
  return _cache;
};

// ── 건물 감지 반경 ──
export const getRadius = async () => (await getSettings()).radius;

export const setRadius = async (value) => {
  const s = await getSettings();
  s.radius = value;
  try { await AsyncStorage.setItem(RADIUS_KEY, String(value)); } catch (e) {}
};

// ── 플로팅 버튼 ──
export const getFloating = async () => (await getSettings()).floating;

export const setFloating = async (on) => {
  const s = await getSettings();
  s.floating = on;
  try { await AsyncStorage.setItem(FLOATING_KEY, String(on)); } catch (e) {}
};

// ── 강력알림 거리 ──
export const getAlertDistance = async () => (await getSettings()).alertDistance;

export const setAlertDistance = async (value) => {
  const s = await getSettings();
  s.alertDistance = value;
  try { await AsyncStorage.setItem(ALERT_DISTANCE_KEY, String(value)); } catch (e) {}
};

// ── 알림음 ──
export const getAlertSound = async () => (await getSettings()).alertSound;

export const setAlertSound = async (on) => {
  const s = await getSettings();
  s.alertSound = on;
  try { await AsyncStorage.setItem(ALERT_SOUND_KEY, String(on)); } catch (e) {}
};

// ── 알림 종류별 켜기/끄기 ──
export const getAlertTypes = async () => (await getSettings()).alertTypes;

export const setAlertType = async (key, on) => {
  const s = await getSettings();
  s.alertTypes = { ...s.alertTypes, [key]: on };
  try { await AsyncStorage.setItem(ALERT_TYPES_KEY, JSON.stringify(s.alertTypes)); } catch (e) {}
};