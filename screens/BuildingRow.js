import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useTheme } from '../theme';

/**
 * BuildingRow.jsx
 *
 * 건물 목록의 한 줄. 홈과 조회가 같은 부품을 쓴다.
 * 예전에는 두 화면에 같은 코드가 따로 있어서, 줄 모양을 고치려면
 * 두 군데를 고쳐야 했다. 한 곳만 고치면 되도록 떼어냈다.
 *
 * 표시등: 비번 · 백업비번 · 지도위치
 *   진하면 있음, 흐리면 없음. 터치 대상이 아니라 신호등이다.
 */
export default function BuildingRow({ item, onPress, onCopy }) {
  const { c, font, space, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, TAP), [c]);

  const mine = item.scope === 'personal';
  const hasMemo = !!(item.memo || '').trim();
  const hasMemo2 = !!(item.memo2 || '').trim();
  const hasLoc = !!item.location;

  // 이름 아래 줄: 비번 → 사진 → 없음 순으로 보여준다
  let subText = '출입 정보 없음';
  let subMono = false;
  if (hasMemo) { subText = item.memo; subMono = true; }
  else if (item.images?.length > 0) { subText = `배치도 ${item.images.length}장`; }

  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Icon
        name={mine ? 'lock-outline' : 'web'}
        size={17}
        color={mine ? c.accent : c.publicColor}
      />

      <View style={s.body}>
        <View style={s.nameRow}>
          {item.isFav && (
            <Icon name="star" size={15} color={c.star} style={{ marginRight: 4 }} />
          )}
          <Text style={item.isFav ? s.nameFav : s.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        <Text style={[s.sub, subMono && s.subMono]} numberOfLines={1}>
          {subText}
        </Text>
      </View>

      <View style={s.marks}>
        <Icon name="key-variant" size={14} color={hasMemo ? c.accent : c.textFaint} />
        <Icon name="key-variant" size={14} color={hasMemo2 ? c.accent : c.textFaint} />
        <Icon name="map-marker" size={14} color={hasLoc ? c.publicColor : c.textFaint} />
      </View>

      <TouchableOpacity style={s.copyBtn} onPress={onCopy}>
        <Icon name="content-copy" size={19} color={c.textSub} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const makeStyles = (c, font, space, TAP) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md + 1,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line,
  },
  body: { flex: 1, minWidth: 0, marginLeft: space.md, marginRight: space.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { ...font.body, color: c.text, flexShrink: 1 },
  nameFav: { ...font.bodyBold, color: c.text, flexShrink: 1 },
  sub: { ...font.sub, color: c.textMuted, marginTop: 2 },
  subMono: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' },

  // 신호등이라 좁게 붙인다. 이름이 보일 자리를 더 준다.
  marks: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  copyBtn: {
    width: 34, height: TAP,
    alignItems: 'flex-end', justifyContent: 'center', marginLeft: space.xs,
  },
});