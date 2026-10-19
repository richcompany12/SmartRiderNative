// screens/KeyboardToggle.js
// ★ v6.1 — 글자판·숫자판 전환 공통 버튼 (등록 화면 도착 메모, 검색창)
// 삼성 키보드·Gboard는 숫자 칸에서 키보드 안의 한/영 전환 키를 없앤다.
// 그래서 이 버튼이 유일한 전환 방법 → 버튼인 게 바로 보이게 크게, 글자는 항상 같게.
// 숫자판일 때는 앱 색으로 꽉 채우고, 글자판일 때는 테두리선만.
import { useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../theme';

const LABEL = '한/영·숫자 전환';

export default function KeyboardToggle({ numeric, onPress, style }) {
  const { c, font, space, radius } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius), [c]);

  return (
    <TouchableOpacity
      style={[s.btn, numeric ? s.btnFill : s.btnLine, style]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Icon name="keyboard-outline" size={17} color={numeric ? c.onAccent : c.accent} />
      <Text style={[s.text, { color: numeric ? c.onAccent : c.accent }]}>{LABEL}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c, font, space, radius) => StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    minHeight: 36, paddingHorizontal: space.sm + 4,
    borderRadius: radius.pill, borderWidth: 1.5,
  },
  btnFill: { backgroundColor: c.accent, borderColor: c.accent },
  btnLine: { backgroundColor: 'transparent', borderColor: c.accent },
  text: { ...font.sub, fontWeight: '600' },
});
