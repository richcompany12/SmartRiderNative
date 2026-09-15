import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, PanResponder
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sidebar from './Sidebar';
import BuildingRow from './BuildingRow';
import { copyBuildingMemo } from '../copyUtil';
import { getCachedBuildings } from '../buildingsCache';
import { useAuth } from '../AuthContext';
import { useTheme } from '../theme';

// 한 번에 몇 개씩 더 불러올지.
// 1000개를 한꺼번에 그리면 스크롤이 끊긴다.
const PAGE = 20;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('fav');       // 기본은 즐겨찾기
  const [shown, setShown] = useState(PAGE);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const list = await getCachedBuildings(isRefresh);
      setBuildings([...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    } catch (e) {
      Alert.alert('오류', '건물 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 화면에 돌아올 때마다 다시 읽는다.
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── 탭 ────────────────────────────────────────────────
  const tabs = [
    { key: 'fav', label: '즐겨찾기' },
    { key: 'public', label: '공용' },
    ...(isAdmin ? [{ key: 'photo', label: '사진' }] : []),
    { key: 'all', label: '전체' },
  ];

  const counts = useMemo(() => ({
    fav: buildings.filter(b => b.isFav).length,
    public: buildings.filter(b => b.scope !== 'personal').length,
    photo: buildings.filter(b => b.images?.length > 0).length,
    all: buildings.length,
  }), [buildings]);

  const filtered = useMemo(() => buildings.filter(b => {
    if (tab === 'fav') return b.isFav;
    if (tab === 'public') return b.scope !== 'personal';
    if (tab === 'photo') return b.images?.length > 0;
    return true;
  }), [buildings, tab]);

  const changeTab = (key) => { setTab(key); setShown(PAGE); };

  // ── 좌우 스와이프로 탭 이동 ─────────────────────────────
  //
  //  이걸 넣는 이유가 두 가지다.
  //   1) 원래 목적: 칩을 누르지 않고도 카테고리를 넘기고 싶다
  //   2) 버그 수정: 목록을 가로로 밀면 상세 화면으로 들어가던 문제
  //
  //  2번은 세로로 밀면 FlatList가 "이건 스크롤이다" 하고 터치를 가져가
  //  탭이 취소되는데, 가로로 밀면 가져갈 주인이 없어서 손을 뗄 때
  //  그냥 탭으로 처리되던 것이었다.
  //  아래에서 가로 제스처의 주인을 만들어주면 그 문제도 같이 사라진다.
  //
  //  PanResponder는 처음 만들어진 것이 계속 쓰이므로,
  //  안에서 지금 상태를 읽으려면 ref로 꺼내야 한다.
  const tabRef = useRef(tab);
  const tabKeysRef = useRef([]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  tabKeysRef.current = tabs.map(t => t.key);

  const pan = useRef(
    PanResponder.create({
      // Capture = 자식(목록·줄 버튼)보다 먼저 판단한다.
      // 가로로 24 이상 + 가로가 세로의 2배 이상일 때만 내가 가져간다.
      // 세로 스크롤은 세로 값이 훨씬 크므로 여기 걸리지 않는다.
      onMoveShouldSetPanResponderCapture: (_evt, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,

      onPanResponderRelease: (_evt, g) => {
        const keys = tabKeysRef.current;
        const i = keys.indexOf(tabRef.current);
        if (i < 0) return;
        // 왼쪽으로 밀면 다음 탭, 오른쪽으로 밀면 이전 탭.
        // 양 끝에서는 아무 일도 하지 않는다.
        if (g.dx < 0 && i < keys.length - 1) { setTab(keys[i + 1]); setShown(PAGE); }
        else if (g.dx > 0 && i > 0) { setTab(keys[i - 1]); setShown(PAGE); }
      },
    })
  ).current;

  // 스크롤 끝에 닿으면 조금 더 보여준다
  const loadMore = () => {
    if (shown < filtered.length) setShown(n => n + PAGE);
  };

  const renderItem = ({ item }) => (
    <BuildingRow
      item={item}
      onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
      onCopy={() => copyBuildingMemo(item)}
    />
  );

  const emptyText = {
    fav: '즐겨찾기한 건물이 없습니다.\n건물 상세에서 ★ 를 눌러 추가하세요.',
    public: '공용 건물이 없습니다.',
    photo: '사진이 있는 건물이 없습니다.',
    all: '등록된 건물이 없습니다.',
  }[tab];

  return (
    <View style={s.screen}>
      {/* 헤더 — 가운데 네모는 로고가 나오면 그 자리 */}
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <View style={s.logoRow}>
          <View style={s.logoMark}>
            <Icon name="office-building" size={18} color={c.accent} />
          </View>
          <Text style={s.logoText}>스마트라이더</Text>
        </View>
        <View style={s.headerIcons}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => navigation.navigate('Search')}
          >
            <Icon name="magnify" size={23} color={c.textSub} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => navigation.navigate('Map')}
          >
            <Icon name="map-outline" size={22} color={c.textSub} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => setMenuOpen(true)}>
            <Icon name="menu" size={23} color={c.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 칩 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipScroll}
        contentContainerStyle={s.chipRow}
      >
        {tabs.map(t => {
          const on = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.chip, on && s.chipOn]}
              onPress={() => changeTab(t.key)}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {t.label} {counts[t.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 이 영역 안에서 좌우로 밀면 탭이 넘어간다 */}
      <View style={{ flex: 1 }} {...pan.panHandlers}>
        {loading ? (
          <ActivityIndicator size="large" color={c.accent} style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={filtered.slice(0, shown)}
            keyExtractor={item => String(item.id)}
            renderItem={renderItem}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[c.accent]}
                tintColor={c.accent}
              />
            }
            ListEmptyComponent={<Text style={s.empty}>{emptyText}</Text>}
            ListFooterComponent={
              shown < filtered.length
                ? <ActivityIndicator color={c.textFaint} style={{ marginVertical: space.lg }} />
                : <View style={{ height: 96 }} />
            }
            contentContainerStyle={{ paddingHorizontal: space.lg }}
          />
        )}
      </View>

      {/* 등록 버튼 */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + space.xl }]}
        onPress={() => navigation.navigate('Register', {})}
      >
        <Icon name="plus" size={26} color={c.fabIcon} />
      </TouchableOpacity>

      <Sidebar
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
      />
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingBottom: space.md,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logoMark: {
    width: 30, height: 30, borderRadius: radius.sm,
    backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  logoText: { ...font.head, color: c.accent, letterSpacing: -0.2 },
  headerIcons: { flexDirection: 'row' },
  headerBtn: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },

  chipScroll: { flexGrow: 0, marginBottom: space.sm },
  chipRow: { gap: space.sm, paddingHorizontal: space.lg },
  chip: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md + 2,
    borderRadius: radius.pill, backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  chipText: { ...font.chip, color: c.textSub },
  chipTextOn: { color: c.onAccent },


  empty: {
    textAlign: 'center', color: c.textFaint,
    ...font.body, lineHeight: 22, marginTop: 48,
  },

  fab: {
    position: 'absolute', right: space.xl,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: c.fab, alignItems: 'center', justifyContent: 'center',
    elevation: 4,
  },
});