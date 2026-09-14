import { useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ScrollView, StyleSheet
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BuildingRow from './BuildingRow';
import { getCachedBuildings } from '../buildingsCache';
import { copyBuildingMemo } from '../copyUtil';
import { useTheme } from '../theme';

const SK_SHORTCUTS = ['SK뷰', 'SK1차', 'SK2차', 'SK3차'];
const PAGE = 20;

// 한글 초성 추출. "ㄷㅌㄴㄷ" 로 "동탄능동"을 찾기 위한 것.
const getInitials = (str) => {
  const consonants = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  return str.split('').map(ch => {
    const code = ch.charCodeAt(0) - 44032;
    if (code > -1 && code < 11172) return consonants[Math.floor(code / 588)];
    return ch;
  }).join('');
};

const clean = (str) => str.replace(/[\s{}[\]/?.,;:|)*~`!^\-_+<>@#$%&\\=('"]/g, '').toLowerCase();
const nums = (str) => str.replace(/[^0-9]/g, '');

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [term, setTerm] = useState('');
  const [buildings, setBuildings] = useState([]);
  const [numericMode, setNumericMode] = useState(true);  // 기본 숫자패드
  const [shown, setShown] = useState(PAGE);
  const inputRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      getCachedBuildings().then(list => {
        setBuildings([...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      });
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }, [])
  );

  // 이름·초성·숫자 세 가지로 찾는다.
  // 장갑 낀 손으로는 오타가 나기 쉬워서 넓게 잡아준다.
  const results = useMemo(() => {
    if (term.length === 0) return buildings;
    const t = clean(term);
    const tInit = getInitials(t);
    const tNum = nums(term);
    return buildings.filter(b => {
      if (!b?.name) return false;
      const name = clean(b.name);
      if (name.includes(t)) return true;
      if (getInitials(name).includes(tInit)) return true;
      if (tNum.length > 0 && nums(name).includes(tNum)) return true;
      return false;
    });
  }, [buildings, term]);

  const onChangeTerm = (v) => { setTerm(v); setShown(PAGE); };

  const toggleKeyboard = () => {
    inputRef.current?.blur();
    setNumericMode(p => !p);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const renderItem = ({ item }) => (
    <BuildingRow
      item={item}
      onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
      onCopy={() => copyBuildingMemo(item)}
    />
  );

  return (
    <View style={s.screen}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.title}>건물 조회</Text>
      </View>

      {/* 검색창 */}
      <View style={s.searchWrap}>
        <Icon name="magnify" size={20} color={c.textMuted} />
        <TextInput
          ref={inputRef}
          style={s.input}
          value={term}
          onChangeText={onChangeTerm}
          placeholder="이름, 초성, 숫자로 검색"
          placeholderTextColor={c.textFaint}
          inputMode={numericMode ? 'numeric' : 'text'}
        />
        {term.length > 0 && (
          <TouchableOpacity onPress={() => onChangeTerm('')} style={s.clearBtn}>
            <Icon name="close-circle" size={19} color={c.textFaint} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={toggleKeyboard}
          style={[s.kbBtn, numericMode && s.kbBtnOn]}
        >
          <Text style={[s.kbText, numericMode && s.kbTextOn]}>
            {numericMode ? '123' : '가나다'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 단축 검색어 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipScroll}
        contentContainerStyle={s.chipRow}
      >
        {SK_SHORTCUTS.map(sk => (
          <TouchableOpacity key={sk} style={s.chip} onPress={() => onChangeTerm(sk)}>
            <Text style={s.chipText}>{sk}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={s.count}>
        {term.length > 0 ? `검색 결과 ${results.length}개` : `전체 ${results.length}개`}
      </Text>

      <FlatList
        data={results.slice(0, shown)}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => { if (shown < results.length) setShown(n => n + PAGE); }}
        onEndReachedThreshold={0.4}
        contentContainerStyle={{ paddingHorizontal: space.lg }}
        ListEmptyComponent={
          <Text style={s.empty}>
            {term.length > 0 ? '찾는 건물이 없습니다.' : '등록된 건물이 없습니다.'}
          </Text>
        }
        ListFooterComponent={<View style={{ height: 96 }} />}
      />

      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + space.xl }]}
        onPress={() => navigation.navigate('Register', {})}
      >
        <Icon name="plus" size={26} color={c.fabIcon} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.sm, paddingBottom: space.md,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.title, color: c.text, marginLeft: space.xs },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    marginHorizontal: space.lg, paddingHorizontal: space.md,
    minHeight: TAP + 4, borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  input: { flex: 1, ...font.body, color: c.text, paddingVertical: space.sm },
  clearBtn: { padding: 2 },
  kbBtn: {
    paddingHorizontal: space.sm + 2, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: c.surfaceSoft,
  },
  kbBtnOn: { backgroundColor: c.accent },
  kbText: { ...font.tiny, fontWeight: '500', color: c.textSub },
  kbTextOn: { color: c.onAccent },

  chipScroll: { flexGrow: 0, marginTop: space.md },
  chipRow: { gap: space.sm, paddingHorizontal: space.lg },
  chip: {
    minHeight: 34, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.pill, backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  chipText: { ...font.tiny, fontWeight: '500', color: c.textSub },

  count: {
    ...font.sub, color: c.textMuted,
    paddingHorizontal: space.lg, marginTop: space.md, marginBottom: space.xs,
  },

  empty: {
    textAlign: 'center', color: c.textFaint,
    ...font.body, marginTop: 48,
  },

  fab: {
    position: 'absolute', right: space.xl,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: c.fab, alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
});