// screens/SignalRegisterScreen.js
// ★ 사거리 신호 순서 등록·수정 (10-20, 어드민만)
//  - 길게 누른 곳 = 사거리 중심 (route.params.center). 수정은 route.params.signalId
//  - 지도 탭 → 진입로 핀 (정지선 근처). 핀마다 반경 (기본 20m)
//  - 단계마다 진입로를 직진 / 좌회전 / 직좌로. 우회전은 없음
//  - 진입로 이름은 "정지선 N" (찍은 순서) + 중심 기준 8방위
//  - 미리보기: "정지선 1에서 보기" 등으로 토스트 아이콘 줄 확인 (CCTV 보면서 검증)
//  - 서버 signals/ 에 공용 저장 (모두가 내려받음). 라이더 위치는 안 들어감
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTheme } from '../theme';
import { useAuth } from '../AuthContext';
import { getSignal, saveSignal, deleteSignal } from '../firebaseDB';
import {
  MOVE_LABEL, DEFAULT_RADIUS, MAX_APPROACHES, approachName, compass8,
} from '../signalLayout';
import KeyboardScreen from './KeyboardScreen';
import SignalIconRow, { SignalCompact } from './SignalIconRow';
import { fixTextKeyboard } from '../keyboardMode';
import { syncSignalsToService } from '../signalSync';

const KAKAO_API_KEY = '7d65ade73c1b3e7d64687306911f7ce7';
const MAP_H = Math.round(Dimensions.get('window').height * 0.38);
const NEXT_MOVE = { '': 'S', S: 'L', L: 'SL', SL: '' };   // 칩을 누를 때마다 없음 → 직진 → 좌회전 → 직좌 → 없음

export default function SignalRegisterScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);
  const webRef = useRef(null);
  const savingRef = useRef(false);

  const signalId = route.params?.signalId || null;
  const [loading, setLoading] = useState(!!signalId);
  const [ready, setReady] = useState(false);
  const [center, setCenter] = useState(route.params?.center || null);
  const [name, setName] = useState('');
  const [approaches, setApproaches] = useState([]);
  const [phases, setPhases] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const approachesRef = useRef(approaches);   // 지도 메시지 처리에서 최신 목록을 읽기 위해
  approachesRef.current = approaches;

  // 수정이면 서버에서 읽고, 새로 만들 때 중심이 없으면 지금 위치
  useEffect(() => {
    (async () => {
      if (signalId) {
        try {
          const sig = await getSignal(signalId);
          if (sig) {
            setCenter(sig.center || null);
            setName(sig.name || '');
            setApproaches(Array.isArray(sig.approaches) ? sig.approaches : []);
            setPhases(Array.isArray(sig.phases) ? sig.phases.map(p => ({ moves: { ...(p?.moves || {}) } })) : []);
          } else {
            Alert.alert('알림', '신호 정보를 찾지 못했어요.');
          }
        } catch (e) {
          Alert.alert('불러오기 실패', e.message);
        }
        setLoading(false);
        return;
      }
      if (!center) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setCenter({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        } catch (e) {
          console.log('[SIGNAL] 현재 위치 실패', e.message);
        }
      }
    })();
  }, []);

  // 지도에 다시 그리기
  useEffect(() => {
    if (!ready || !center) return;
    // 지도 핀 라벨은 번호만 ("1", "2" …)
    const pins = approaches.map((a, i) => ({ ...a, label: String(i + 1) }));
    webRef.current?.postMessage(JSON.stringify({ type: 'RENDER', center, approaches: pins, selectedKey }));
  }, [ready, center, approaches, selectedKey]);

  // ★ 10-20 — 진입로 이름은 "정지선 N" (찍은 순서). 예전에 저장한 홈·1루 이름도 이걸로 보인다
  const nameOf = (key) => approachName(Math.max(0, approaches.findIndex(a => a.key === key)));

  const onMessage = (event) => {
    let data;
    try { data = JSON.parse(event.nativeEvent.data); } catch (e) { return; }
    if (data.type === 'READY') { setReady(true); return; }
    if (data.type === 'ADD') {
      const list = approachesRef.current;
      if (list.length >= MAX_APPROACHES) {
        Alert.alert('알림', '진입로는 ' + MAX_APPROACHES + '개까지예요.');
        return;
      }
      const key = 'a' + Date.now().toString(36);
      setApproaches([...list, { key, lat: data.lat, lng: data.lng, radius: DEFAULT_RADIUS }]);
      setSelectedKey(key);
      return;
    }
    if (data.type === 'SELECT') { setSelectedKey(data.key); return; }
  };

  const updateApproach = (key, patch) =>
    setApproaches(list => list.map(a => (a.key === key ? { ...a, ...patch } : a)));

  const removeApproach = (key) => {
    setApproaches(list => list.filter(a => a.key !== key));
    setPhases(list => list.map(p => {
      const moves = { ...p.moves };
      delete moves[key];
      return { moves };
    }));
    if (selectedKey === key) setSelectedKey(null);
    if (previewKey === key) setPreviewKey(null);
  };

  const toggleMove = (pi, key) => setPhases(list => list.map((p, i) => {
    if (i !== pi) return p;
    const moves = { ...p.moves };
    const next = NEXT_MOVE[moves[key] || ''];
    if (next) moves[key] = next; else delete moves[key];
    return { moves };
  }));

  const movePhase = (pi, dir) => setPhases(list => {
    const j = pi + dir;
    if (j < 0 || j >= list.length) return list;
    const out = [...list];
    [out[pi], out[j]] = [out[j], out[pi]];
    return out;
  });

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!center) { Alert.alert('알림', '사거리 위치가 없어요.'); return; }
    if (approaches.length < 2) { Alert.alert('알림', '진입로 핀을 2개 이상 찍어주세요.'); return; }
    const filled = phases.filter(p => Object.keys(p.moves || {}).length > 0);
    if (!filled.length) { Alert.alert('알림', '단계를 1개 이상 만들어주세요.'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveSignal({
        id: signalId || undefined,
        name: name.trim() || '사거리',
        center,
        approaches: approaches.map(({ key, lat, lng, radius: r }, i) => ({ key, name: approachName(i), lat, lng, radius: r })),
        phases: filled.map(p => ({ moves: p.moves })),
      });
      syncSignalsToService('저장');                                   // 토스트에 바로 반영
      Alert.alert('저장됨', '신호 순서를 저장했어요.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('저장 실패', e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!signalId) return;
    Alert.alert('삭제', '이 사거리 신호 정보를 지울까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive', onPress: async () => {
          try { await deleteSignal(signalId); syncSignalsToService('삭제'); navigation.goBack(); }
          catch (e) { Alert.alert('삭제 실패', e.message); }
        },
      },
    ]);
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:100vw; height:100vh; overflow:hidden; }
    #map { width:100%; height:100%; }
    .ap { padding:3px 8px; border-radius:12px; background:#2F6FD6; color:#fff; font-size:13px; font-weight:bold; border:2px solid #fff; }
    .ap.sel { background:#E8730C; }
    .ct { width:14px; height:14px; border-radius:7px; background:#C62828; border:2px solid #fff; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false"></script>
  <script>
    var map = null, drawn = [], centered = false;
    function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
    kakao.maps.load(function() {
      map = new kakao.maps.Map(document.getElementById('map'), {
        center: new kakao.maps.LatLng(37.5665, 126.9780), level: 2
      });
      kakao.maps.event.addListener(map, 'click', function(e) {
        post({ type:'ADD', lat:e.latLng.getLat(), lng:e.latLng.getLng() });
      });
      document.addEventListener('message', onMsg);
      window.addEventListener('message', onMsg);
      post({ type:'READY' });
    });
    function clearAll() {
      for (var i = 0; i < drawn.length; i++) drawn[i].setMap(null);
      drawn = [];
    }
    function onMsg(e) {
      var data;
      try { data = JSON.parse(e.data); } catch (err) { return; }
      if (data.type !== 'RENDER' || !map) return;
      clearAll();
      var cpos = new kakao.maps.LatLng(data.center.lat, data.center.lng);
      if (!centered) { map.setCenter(cpos); centered = true; }
      var ct = document.createElement('div');
      ct.className = 'ct';
      drawn.push(new kakao.maps.CustomOverlay({ position: cpos, content: ct, map: map, yAnchor: 0.5 }));
      for (var i = 0; i < data.approaches.length; i++) {
        (function(a) {
          var pos = new kakao.maps.LatLng(a.lat, a.lng);
          var sel = a.key === data.selectedKey;
          drawn.push(new kakao.maps.Circle({
            center: pos, radius: a.radius, map: map,
            strokeWeight: 2, strokeColor: sel ? '#E8730C' : '#2F6FD6', strokeOpacity: 0.9,
            fillColor: sel ? '#E8730C' : '#2F6FD6', fillOpacity: 0.12
          }));
          drawn.push(new kakao.maps.Polyline({
            path: [cpos, pos], map: map, strokeWeight: 2, strokeColor: '#555555', strokeOpacity: 0.5, strokeStyle: 'dash'
          }));
          var el = document.createElement('div');
          el.className = sel ? 'ap sel' : 'ap';
          el.textContent = a.label;
          el.addEventListener('click', function(ev) { ev.stopPropagation(); post({ type:'SELECT', key:a.key }); });
          el.addEventListener('touchend', function(ev) { ev.stopPropagation(); ev.preventDefault(); post({ type:'SELECT', key:a.key }); });
          drawn.push(new kakao.maps.CustomOverlay({ position: pos, content: el, map: map, yAnchor: 1.3, clickable: true }));
        })(data.approaches[i]);
      }
    }
  </script>
</body>
</html>
  `;

  if (!isAdmin) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.hint}>신호등 등록은 관리자만 할 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={c.textSub} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>{signalId ? '신호등 수정' : '신호등 등록'}</Text>
      </View>

      <View style={{ height: MAP_H }}>
        {center && !loading ? (
          <WebView
            ref={webRef}
            source={{ html }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
          />
        ) : (
          <View style={[s.center, { flex: 1 }]}>
            <ActivityIndicator color={c.accent} />
            <Text style={s.hint}>사거리 위치를 불러오는 중...</Text>
          </View>
        )}
      </View>

      <KeyboardScreen contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 40 }}>
        <Text style={s.hint}>{'지도에서 각 진입로 정지선 근처를 눌러 핀을 추가하세요 (빨간 점 = 사거리 중심)'}</Text>

        <Text style={s.label}>사거리 이름</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          onFocus={() => fixTextKeyboard()}
          inputMode="text"
          placeholder="예: 능동 사거리"
          placeholderTextColor={c.textFaint}
          maxLength={25}
        />

        <Text style={s.label}>진입로 ({approaches.length}/{MAX_APPROACHES})</Text>
        {approaches.length === 0 && <Text style={s.hint}>아직 없어요. 지도를 눌러 추가하세요.</Text>}
        {approaches.map((a, i) => (
          <TouchableOpacity
            key={a.key}
            style={[s.apRow, selectedKey === a.key && s.apRowOn]}
            onPress={() => setSelectedKey(a.key)}
            activeOpacity={0.8}
          >
            <View style={s.apNameBox}>
              <Text style={s.apName}>{approachName(i)}</Text>
              <Text style={s.apDir}>{center ? compass8(center, a) : ''}</Text>
            </View>
            <View style={s.radiusBox}>
              <TouchableOpacity style={s.stepBtn} onPress={() => updateApproach(a.key, { radius: Math.max(10, a.radius - 5) })}>
                <Icon name="minus" size={18} color={c.text} />
              </TouchableOpacity>
              <Text style={s.radiusText}>{a.radius}m</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => updateApproach(a.key, { radius: Math.min(80, a.radius + 5) })}>
                <Icon name="plus" size={18} color={c.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.delBtn} onPress={() => removeApproach(a.key)}>
              <Icon name="close" size={20} color={c.danger} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <Text style={s.label}>{'단계 (' + phases.length + ')  ·  칩을 누를 때마다 직진 → 좌회전 → 직좌 → 없음'}</Text>
        {phases.map((p, pi) => (
          <View key={pi} style={s.phaseCard}>
            <View style={s.phaseHead}>
              <Text style={s.phaseTitle}>{pi + 1}단계</Text>
              <View style={s.phaseTools}>
                <TouchableOpacity style={s.toolBtn} onPress={() => movePhase(pi, -1)}>
                  <Icon name="chevron-up" size={20} color={c.textSub} />
                </TouchableOpacity>
                <TouchableOpacity style={s.toolBtn} onPress={() => movePhase(pi, 1)}>
                  <Icon name="chevron-down" size={20} color={c.textSub} />
                </TouchableOpacity>
                <TouchableOpacity style={s.toolBtn} onPress={() => setPhases(list => list.filter((_, i) => i !== pi))}>
                  <Icon name="trash-can-outline" size={20} color={c.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={s.wrapRow}>
              {approaches.map(a => {
                const mv = p.moves?.[a.key] || '';
                return (
                  <TouchableOpacity key={a.key} style={[s.moveChip, !!mv && s.moveChipOn]} onPress={() => toggleMove(pi, a.key)}>
                    <Text style={[s.moveText, !!mv && s.moveTextOn]}>
                      {nameOf(a.key) + ' ' + (mv ? MOVE_LABEL[mv] : '-')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        <TouchableOpacity style={s.addPhase} onPress={() => setPhases(list => [...list, { moves: {} }])}>
          <Icon name="plus" size={18} color={c.accent} />
          <Text style={s.addPhaseText}>단계 추가</Text>
        </TouchableOpacity>

        <Text style={s.label}>미리보기 (토스트에 나오는 모양)</Text>
        <View style={s.wrapRow}>
          {approaches.map(a => (
            <TouchableOpacity
              key={a.key}
              style={[s.tplBtn, previewKey === a.key && s.tplBtnOn]}
              onPress={() => setPreviewKey(a.key)}
            >
              <Text style={[s.tplText, previewKey === a.key && s.tplTextOn]}>{nameOf(a.key) + '에서 보기'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {previewKey && (
          <View style={s.previewBox}>
            {/* ★ 10-21 — 접힌 토스트 (처음 뜰 때) */}
            <Text style={s.previewHead}>처음 뜰 때 (접힘)</Text>
            <SignalCompact
              signal={{ center, approaches, phases: phases.filter(p => Object.keys(p.moves || {}).length > 0) }}
              myKey={previewKey}
            />
            <Text style={[s.previewHead, { marginTop: space.md }]}>탭하면 (전체 순서)</Text>
            <SignalIconRow
              signal={{ center, approaches, phases: phases.filter(p => Object.keys(p.moves || {}).length > 0) }}
              myKey={previewKey}
            />
            <Text style={s.previewNote}>참고용, 실제 신호를 보고 출발하세요</Text>
            <Text style={s.hint}>{'초록 = 내 진입로가 움직이는 단계 · 숫자 = 원래 단계 번호'}</Text>
          </View>
        )}

        <TouchableOpacity style={[s.btnPrimary, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={c.onAccent} /> : <Text style={s.btnPrimaryText}>저장</Text>}
        </TouchableOpacity>
        {signalId && (
          <TouchableOpacity style={s.btnDanger} onPress={handleDelete}>
            <Text style={s.btnDangerText}>삭제</Text>
          </TouchableOpacity>
        )}
      </KeyboardScreen>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.sm },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...font.title, color: c.text, marginLeft: space.xs },
  hint: { ...font.sub, color: c.textMuted, marginTop: 6 },
  label: { ...font.sub, fontWeight: '500', color: c.fieldLabel, marginTop: space.lg, marginBottom: 6 },
  input: {
    backgroundColor: c.field, borderWidth: 1.5, borderColor: c.fieldBorder, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md, ...font.body, color: c.text,
  },
  apRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, marginBottom: 6,
    borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.lineStrong,
  },
  apRowOn: { borderColor: '#E8730C' },
  apNameBox: { width: 84 },
  apName: { ...font.body, fontWeight: '600', color: c.text },
  apDir: { ...font.tiny, color: c.textMuted, marginTop: 1 },
  radiusBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  stepBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSoft,
  },
  radiusText: { ...font.body, color: c.text, minWidth: 48, textAlign: 'center' },
  delBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tplBtn: {
    minHeight: 38, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: c.accent,
  },
  tplBtnOn: { backgroundColor: c.accent },
  tplText: { ...font.sub, color: c.accent, fontWeight: '600' },
  tplTextOn: { color: c.onAccent },
  phaseCard: {
    padding: space.md, marginBottom: space.sm, borderRadius: radius.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong,
  },
  phaseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  phaseTitle: { ...font.body, fontWeight: '700', color: c.text },
  phaseTools: { flexDirection: 'row', gap: 2 },
  toolBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  moveChip: {
    minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.sm,
    backgroundColor: c.surfaceSoft,
  },
  moveChipOn: { backgroundColor: '#2F6FD6' },
  moveText: { ...font.sub, color: c.textSub },
  moveTextOn: { color: '#fff', fontWeight: '600' },
  addPhase: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: TAP,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: c.accent, borderStyle: 'dashed',
  },
  addPhaseText: { ...font.body, color: c.accent, fontWeight: '600' },
  previewBox: {
    marginTop: space.sm, padding: space.md, borderRadius: radius.md,
    backgroundColor: '#FBFAF7', borderWidth: 1, borderColor: c.lineStrong,
  },
  previewNote: { fontSize: 12, color: '#6B675F', marginTop: space.sm },
  previewHead: { fontSize: 12, fontWeight: '600', color: '#6B675F', marginBottom: 6 },
  btnPrimary: {
    marginTop: space.xl, minHeight: TAP + 4, borderRadius: radius.md, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText: { ...font.body, fontWeight: '700', color: c.onAccent },
  btnDanger: { marginTop: space.md, minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  btnDangerText: { ...font.body, color: c.danger },
});
