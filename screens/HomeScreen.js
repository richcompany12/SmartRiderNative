import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, PanResponder, Animated   // ★ 바뀐 줄 — Animated 추가
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sidebar from './Sidebar';
import BuildingRow from './BuildingRow';
import AlertRow from './AlertRow';
import { copyBuildingMemo } from '../copyUtil';
import { getCachedBuildings } from '../buildingsCache';
import { getAllAlertPoints } from '../firebaseDB';
import { getCenter, distanceKm, ALERT_RADIUS_KM } from '../alertSync';   // ★ 새 줄
import { useAuth } from '../AuthContext';
import { useTheme } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';           // ★ 새 줄
import { PERMISSION_SEEN_KEY } from './PermissionScreen';                        // ★ 새 줄

// 한 번에 몇 개씩 더 불러올지.
// 1000개를 한꺼번에 그리면 스크롤이 끊긴다.
const PAGE = 20;

// ★ 새 줄 — 전체 탭 정렬. 누를 때마다 다음 것으로
// ★ 새 줄 — 저장 시각을 숫자로 통일 (예전 데이터가 글자 형식이어도 정렬이 안 깨지게)
const toTime = (t) => {                                                 // ★ 새 줄
  if (typeof t === 'number') return t;                                  // ★ 새 줄
  const n = Number(t);                                                  // ★ 새 줄
  if (!isNaN(n)) return n;                                              // ★ 새 줄
  const d = Date.parse(t);                                              // ★ 새 줄
  return isNaN(d) ? 0 : d;                                              // ★ 새 줄
};                                                                      // ★ 새 줄

const SORTS = [
  { key: 'new', label: '최신순' },                                       // ★ 새 줄
  { key: 'old', label: '오래된순' },                                     // ★ 새 줄
  { key: 'name', label: '이름순' },                                      // ★ 새 줄
];                                                                      // ★ 새 줄

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const isAdminRef = useRef(isAdmin);          // ★ 새 줄 — load 안에서 항상 최신 역할을 보려고
  isAdminRef.current = isAdmin;                // ★ 새 줄
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [buildings, setBuildings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('fav');       // 기본은 즐겨찾기
  const [shown, setShown] = useState(PAGE);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState('new');                      // ★ 새 줄

  const load = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);

    // 건물이 본체다. 이것만은 반드시 살린다.
    try {
      const list = await getCachedBuildings(isRefresh);
      setBuildings([...list].sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp)));   // ★ 바뀐 줄
    } catch (e) {
      Alert.alert('오류', '건물 데이터를 불러오지 못했습니다.\n' + (e?.message || ''));
    }

       // ★ 새 줄 — 건물이 준비되면 바로 목록을 보여준다 (알림지점은 뒤에서 이어서 받는다)
    setLoading(false);                                                  // ★ 새 줄
    setRefreshing(false);                                               // ★ 새 줄

    // 알림지점은 곁다리다. 실패해도 건물 목록은 그대로 보여야 한다.
    try {
      const aList = await getAllAlertPoints();
      let shownAlerts = aList;                                                         // ★ 새 줄
      // 일반 라이더는 내 주변만. 어드민은 전국을 관리해야 하니 전체
      if (!isAdminRef.current) {                                                       // ★ 새 줄
        const center = await getCenter();                                              // ★ 새 줄
        if (center) {                                                                  // ★ 새 줄
          shownAlerts = aList.filter(a =>                                              // ★ 새 줄
            a.location?.lat && a.location?.lng &&                                      // ★ 새 줄
            distanceKm(center.lat, center.lng, a.location.lat, a.location.lng) <= ALERT_RADIUS_KM   // ★ 새 줄
          );                                                                           // ★ 새 줄
        }                                                                              // ★ 새 줄
      }                                                                                // ★ 새 줄
      setAlerts([...shownAlerts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));   // ★ 바뀐 줄
    } catch (e) {
      setAlerts([]);
      console.log('알림지점 로드 실패:', e?.message);
    }
  };

  // 화면에 돌아올 때마다 다시 읽는다.
  useFocusEffect(useCallback(() => { load(); }, []));

  // ★ 권한 안내를 딱 한 번만 띄운다.
  //   AsyncStorage에 표시가 없으면 아직 안 본 사람이다.
  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(PERMISSION_SEEN_KEY);
        if (!seen) navigation.navigate('Permission');
      } catch (e) {}
    })();
  }, []);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── 탭 ────────────────────────────────────────────────
  // 사진 탭을 빼고 강력알림을 넣었다.
  // 사진은 "사진 있는 건물만 보기"였는데 따로 볼 일이 없었고,
  // 알림지점은 지도에만 있어서 목록으로는 확인할 길이 없었다.
  const tabs = [
    { key: 'fav', label: '즐겨찾기' },
    { key: 'public', label: '공용' },
    { key: 'alert', label: '강력알림' },
    { key: 'all', label: '전체' },
  ];

  const counts = useMemo(() => ({
    fav: buildings.filter(b => b.isFav).length,
    public: buildings.filter(b => b.scope !== 'personal').length,
    alert: alerts.length,
    all: buildings.length,
  }), [buildings, alerts]);

  // 강력알림 탭일 때만 다른 배열을 돌려준다.
  // 아래 FlatList·더보기 코드는 filtered만 보므로 고칠 게 없다.
  const filtered = useMemo(() => {
    if (tab === 'alert') return alerts;
    const list = buildings.filter(b => {                                // ★ 바뀐 줄
      if (tab === 'fav') return b.isFav;
      if (tab === 'public') return b.scope !== 'personal';
      return true;
    });
    // ★ 새 줄 — 전체 탭만 정렬을 바꾼다. 최신순은 불러올 때 이미 정렬돼 있다
    if (tab !== 'all' || sortMode === 'new') return list;               // ★ 새 줄
    if (sortMode === 'old') {                                           // ★ 새 줄
      return [...list].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));   // ★ 바뀐 줄
    }                                                                   // ★ 새 줄
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));  // ★ 새 줄
  }, [buildings, alerts, tab, sortMode]);                               // ★ 바뀐 줄

  const changeTab = (key) => { setTab(key); setShown(PAGE); };

    // ★ 새 줄 — 정렬 버튼: 최신순 → 오래된순 → 이름순 → 최신순
  const cycleSort = () => {                                             // ★ 새 줄
    const i = SORTS.findIndex(x => x.key === sortMode);                 // ★ 새 줄
    setSortMode(SORTS[(i + 1) % SORTS.length].key);                     // ★ 새 줄
    setShown(PAGE);                                                     // ★ 새 줄
  };                                                                    // ★ 새 줄

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

    // ★ 새 블록 — 선택한 칩을 가로 줄 가운데로 굴린다
  const chipScrollRef = useRef(null);
  const chipPos = useRef({});          // { 탭키: { x, w } }
  const chipBoxW = useRef(0);          // 칩 줄 전체 폭
  useEffect(() => {
    const p = chipPos.current[tab];
    if (!p || !chipBoxW.current) return;
    const x = Math.max(0, p.x + p.w / 2 - chipBoxW.current / 2);
    chipScrollRef.current?.scrollTo({ x, animated: true });
  }, [tab]);
  // ★ 새 블록 끝

  // ★ 새 블록 — 탭 바뀔 때 목록이 넘긴 방향에서 스르륵 들어온다
  const slideX = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const prevTabIdx = useRef(0);
  useEffect(() => {
    const keys = tabs.map(t => t.key);
    const idx = keys.indexOf(tab);
    const dir = idx >= prevTabIdx.current ? 1 : -1;   // 오른쪽 탭으로 가면 오른쪽에서 들어옴
    prevTabIdx.current = idx;
    slideX.setValue(dir * 40);
    fade.setValue(0.3);
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [tab]);
  // ★ 새 블록 끝 (슬라이드)
  
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

  const renderItem = ({ item }) => {
    if (tab === 'alert') {
      return (
        <AlertRow
          item={item}
          onPress={() => navigation.navigate('AlertDetail', { alertId: item.id })}
        />
      );
    }
    return (
      <BuildingRow
        item={item}
        onPress={() => navigation.navigate('Detail', { buildingId: item.id })}
        onCopy={() => copyBuildingMemo(item)}
      />
    );
  };

  const emptyText = {
    fav: '즐겨찾기한 건물이 없습니다.\n건물 상세에서 ★ 를 눌러 추가하세요.',
    public: '공용 건물이 없습니다.',
    alert: isAdmin ? '등록된 강력알림 지점이 없습니다.' : `내 주변 ${ALERT_RADIUS_KM}km 안에 강력알림 지점이 없습니다.`,   // ★ 바뀐 줄
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
        ref={chipScrollRef}                                                    // ★ 새 줄
        onLayout={e => { chipBoxW.current = e.nativeEvent.layout.width; }}     // ★ 새 줄
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
              onLayout={e => { chipPos.current[t.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width }; }}   // ★ 새 줄
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {t.label} {counts[t.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
        {tab === 'all' && (
          <TouchableOpacity style={s.sortBtn} onPress={cycleSort}>
            <Icon name="sort" size={16} color={c.accent} />
            <Text style={s.sortText}>{SORTS.find(x => x.key === sortMode)?.label}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 이 영역 안에서 좌우로 밀면 탭이 넘어간다 */}
      <Animated.View                                                                    // ★ 바뀐 줄
        style={{ flex: 1, opacity: fade, transform: [{ translateX: slideX }] }}         // ★ 새 줄
        {...pan.panHandlers}                                                            // ★ 새 줄
      >                                                                                 // ★ 새 줄
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
      </Animated.View>                                                                  // ★ 바뀐 줄

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
  sortBtn: {                                                            // ★ 새 줄
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4,  // ★ 새 줄
    paddingHorizontal: space.md, borderRadius: radius.pill,             // ★ 새 줄
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.accent,       // ★ 새 줄
  },                                                                    // ★ 새 줄
  sortText: { ...font.chip, color: c.accent },                          // ★ 새 줄


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