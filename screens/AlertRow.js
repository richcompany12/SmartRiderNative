import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useTheme } from '../theme';

/**
 * AlertRow.js
 *
 * 강력알림 지점 목록의 한 줄.
 * BuildingRow와 모양을 맞췄지만 안에 든 게 다르다.
 *   - 비번이 없으므로 복사 버튼이 없다
 *   - 대신 알림 종류를 이름 옆에 붙인다
 */

const TYPE_INFO = {
  rear:    { label: '후방카메라', icon: 'cctv' },
  front:   { label: '전방카메라', icon: 'cctv' },
  parking: { label: '주차단속',   icon: 'car' },
  etc:     { label: '기타',       icon: 'alert-outline' },
};

export default function AlertRow({ item, onPress }) {
  const { c, font, space } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space), [c]);

  // theme.js에 danger가 없더라도 색이 사라지지 않게 대비해둔다
  const red = c.danger || '#DC2626';

  const info = TYPE_INFO[item.alertType] || TYPE_INFO.etc;
  const hasLoc = !!item.location;
  const memo = (item.memo || '').trim();

  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Icon name={info.icon} size={18} color={red} />

      <View style={s.body}>
        <View style={s.nameRow}>
          <View style={[s.badge, { borderColor: red }]}>
            <Text style={[s.badgeText, { color: red }]}>{info.label}</Text>
          </View>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        </View>
        <Text style={s.sub} numberOfLines={1}>
          {memo || '메모 없음'}
        </Text>
      </View>

      <View style={s.marks}>
        <Icon name="map-marker" size={14} color={hasLoc ? c.publicColor : c.textFaint} />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c, font, space) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md + 1,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line,
  },
  body: { flex: 1, minWidth: 0, marginLeft: space.md, marginRight: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, marginRight: 6,
  },
  badgeText: { ...font.sub, fontSize: 11 },
  name: { ...font.body, color: c.text, flexShrink: 1 },
  sub: { ...font.sub, color: c.textMuted, marginTop: 2 },
  marks: { flexDirection: 'row', gap: 2, alignItems: 'center' },
});