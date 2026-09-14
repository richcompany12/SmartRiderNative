/**
 * theme.js  (신규)
 *
 * 앱 전체의 색·글자크기·간격을 이 파일 하나에 모았다.
 * 화면마다 '#3b82f6' 같은 값을 직접 적지 않고 여기서 꺼내 쓴다.
 * 색 하나 바꾸려고 열 몇 개 파일을 뒤지는 일이 없어진다.
 *
 * ── 다크모드 ────────────────────────────────────────────
 *  라이더는 밤낮 가리지 않고 탄다.
 *  폰 설정이 다크면 dark 팔레트가, 밝으면 light 팔레트가 자동으로 쓰인다.
 *  화면에서는 useTheme() 만 부르면 된다.
 *
 * ── 쓰는 법 ─────────────────────────────────────────────
 *  import { useTheme } from '../theme';
 *
 *  export default function 화면() {
 *    const { c, space, radius, font } = useTheme();
 *    const s = useMemo(() => makeStyles(c), [c]);
 *    ...
 *  }
 *
 *  const makeStyles = (c) => StyleSheet.create({
 *    box: { backgroundColor: c.surface, color: c.text },
 *  });
 *
 *  StyleSheet.create를 화면 밖에 두고 색만 인자로 받는 구조다.
 *  이렇게 해야 폰 설정이 바뀔 때 색이 따라간다.
 */

import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

// ── 밝은 모드 ────────────────────────────────────────────
// 배경이 순백이 아니라 살짝 따뜻한 아이보리다.
// 햇빛 아래에서 순백은 눈이 부시고, 종이 같은 느낌이 덜 피로하다.
const light = {
  bg: '#FBFAF7',          // 화면 배경
  surface: '#FFFFFF',     // 카드, 입력칸
  surfaceSoft: '#F3F2ED', // 눌리지 않은 버튼 배경

  line: '#E5E3DC',        // 목록 구분선
  lineStrong: '#D3D1C7',  // 칩·입력칸 테두리

  text: '#1A1A18',        // 본문
  textSub: '#5F5E5A',     // 부제, 아이콘
  textMuted: '#6E6C66',   // 비번, 보조 설명
  textFaint: '#B4B2A9',   // 안내 문구, 꺼진 표시등

  accent: '#075B4B',      // 브랜드 그린 — 주요 버튼, 개인 데이터
  accentSoft: '#E1F5EE',  // 청록 연한 배경
  onAccent: '#FFFFFF',    // 청록 위에 올라가는 글자

  publicColor: '#185FA5', // 공용 데이터 표시
  star: '#F28C28',        // 즐겨찾기, 강조

  danger: '#C0392B',
  dangerSoft: '#FDECEA',
  warn: '#B45309',
  warnSoft: '#FEF6E7',

  fab: '#075B4B',
  fabIcon: '#FFFFFF',
};

// ── 어두운 모드 ──────────────────────────────────────────
// 청록을 그대로 쓰면 어두운 배경에서 가라앉는다. 한 단계 밝힌 값을 쓴다.
const dark = {
  bg: '#111315',
  surface: '#1A1D20',
  surfaceSoft: '#23272B',

  line: '#2A2E33',
  lineStrong: '#3A3F45',

  text: '#F4F2EC',
  textSub: '#A8A69F',
  textMuted: '#918F88',
  textFaint: '#55534E',

  accent: '#3FBF9C',
  accentSoft: '#12352C',
  onAccent: '#06251D',

  publicColor: '#5AA9F0',
  star: '#F9A84A',

  danger: '#F08076',
  dangerSoft: '#3A1D1A',
  warn: '#E0A44A',
  warnSoft: '#332615',

  fab: '#3FBF9C',
  fabIcon: '#06251D',
};

// ── 글자 ─────────────────────────────────────────────────
// 굵기는 두 가지만 쓴다. '400 보통'과 '500 굵게'.
// 700 bold는 안드로이드에서 뭉툭해 보여서 안 쓴다.
export const font = {
  title: { fontSize: 21, fontWeight: '500' },   // 화면 제목
  head: { fontSize: 18, fontWeight: '500' },    // 구역 제목
  body: { fontSize: 16, fontWeight: '400' },    // 목록 이름
  bodyBold: { fontSize: 16, fontWeight: '500' },// 즐겨찾기 이름
  sub: { fontSize: 14, fontWeight: '400' },     // 비번, 보조 설명
  tiny: { fontSize: 12, fontWeight: '400' },    // 탭바 글자, 안내
  chip: { fontSize: 13, fontWeight: '500' },
};

// ── 간격 ─────────────────────────────────────────────────
// 4의 배수로만 쓴다. 제각각인 여백이 앱을 어수선하게 만든다.
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24,
};

// ── 모서리 ───────────────────────────────────────────────
export const radius = {
  sm: 8, md: 10, lg: 12, pill: 999,
};

// ── 터치 영역 ────────────────────────────────────────────
// 장갑 끼고도 눌려야 한다. 어떤 버튼도 이보다 작으면 안 된다.
export const TAP = 48;

// ── 화면에서 부르는 함수 ─────────────────────────────────
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const c = isDark ? dark : light;

  return useMemo(
    () => ({ c, isDark, font, space, radius, TAP }),
    [isDark]
  );
}

// 화면 밖(유틸 함수 등)에서 색이 필요할 때만 쓴다.
// 다크모드를 따라가지 않으므로 화면 안에서는 useTheme()을 쓸 것.
export const palette = { light, dark };