// 활동 지역 고르기 부품 (v6, 14번)
// 첫 실행 창(RegionGate)과 사이드바·설정의 활동 지역 화면(RegionScreen)이 같이 쓴다.
// "현재 위치로 자동 선택"은 절대 넣지 않는다 (위치정보 원칙 — 라이더가 직접 고른 값만)

import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { REGIONS, MAX_REGIONS, regionValue } from '../regions';

export const REGION_INTRO = '활동 지역을 알려주세요. 라이더가 많은 지역부터 카메라·공용 건물 정보를 늘려갑니다.';
export const PARTNER_LABEL = '지역 파트너·제휴 안내를 이메일로 받을게요 (선택)';

export default function RegionPicker({
  initialRegions = [], initialPartner = false,
  onSave, onLater, saveLabel = '저장', showIntro = true, bottomInset = 0,
}) {
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [picked, setPicked] = useState(initialRegions.slice(0, MAX_REGIONS));
  const [sido, setSido] = useState(null);
  const [partner, setPartner] = useState(initialPartner === true);
  const [saving, setSaving] = useState(false);

  const toggle = (value) => {
    if (picked.includes(value)) {
      setPicked(p => p.filter(v => v !== value));
      return;
    }
    if (picked.length >= MAX_REGIONS) {
      Alert.alert('최대 3곳까지예요', '다른 지역을 빼고 골라주세요.');
      return;
    }
    setPicked(p => [...p, value]);
  };

  const save = async () => {
    if (saving || picked.length === 0) return;
    setSaving(true);
    try {
      await onSave?.(picked, partner);
    } finally {
      setSaving(false);
    }
  };

  const current = REGIONS.find(r => r.sido === sido);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.lg }}>
        {showIntro && <Text style={s.intro}>{REGION_INTRO}</Text>}

        <Text style={s.label}>고른 지역 ({picked.length}/{MAX_REGIONS})</Text>
        <View style={s.chipRow}>
          {picked.length === 0 && <Text style={s.empty}>아래에서 골라주세요</Text>}
          {picked.map(v => (
            <TouchableOpacity key={v} style={s.chipOn} onPress={() => toggle(v)}>
              <Text style={s.chipOnText}>{v}</Text>
              <Icon name="close" size={16} color={c.onAccent} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>시·도</Text>
        <View style={s.grid}>
          {REGIONS.map(r => (
            <TouchableOpacity
              key={r.sido}
              style={[s.cell, sido === r.sido && s.cellOn]}
              onPress={() => setSido(sido === r.sido ? null : r.sido)}
            >
              <Text style={[s.cellText, sido === r.sido && s.cellTextOn]}>{r.sido}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {current && (
          <>
            <Text style={s.label}>{current.sido} — 시·군·구</Text>
            <View style={s.grid}>
              {current.list.map(name => {
                const v = regionValue(current.sido, name);
                const on = picked.includes(v);
                return (
                  <TouchableOpacity key={v} style={[s.cell, on && s.cellOn]} onPress={() => toggle(v)}>
                    <Text style={[s.cellText, on && s.cellTextOn]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <TouchableOpacity style={s.partnerRow} onPress={() => setPartner(v => !v)} activeOpacity={0.8}>
          <Icon
            name={partner ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={partner ? c.accent : c.textSub}
          />
          <Text style={s.partnerText}>{PARTNER_LABEL}</Text>
        </TouchableOpacity>
        <Text style={s.partnerHint}>체크하면 가입한 이메일로 안내를 받을 수 있어요. 설정에서 언제든 끌 수 있어요.</Text>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: space.md + bottomInset }]}>
        <TouchableOpacity
          style={[s.btnPrimary, (picked.length === 0 || saving) && s.btnOff]}
          disabled={picked.length === 0 || saving}
          onPress={save}
        >
          <Text style={s.btnPrimaryText}>{saveLabel}</Text>
        </TouchableOpacity>
        {onLater && (
          <TouchableOpacity style={s.btnPlain} onPress={onLater}>
            <Text style={s.btnPlainText}>나중에</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  intro: { ...font.body, color: c.text, lineHeight: 24, marginBottom: space.md },
  label: { ...font.sub, fontWeight: '500', color: c.textMuted, marginTop: space.lg, marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, minHeight: TAP, alignItems: 'center' },
  empty: { ...font.sub, color: c.textFaint },
  chipOn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.accent, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14,
  },
  chipOnText: { ...font.body, fontWeight: '500', color: c.onAccent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    minWidth: '22%', flexGrow: 1, minHeight: TAP, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  cellOn: { backgroundColor: c.accent, borderColor: c.accent },
  cellText: { ...font.body, color: c.text },
  cellTextOn: { color: c.onAccent, fontWeight: 'bold' },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, minHeight: TAP },
  partnerText: { ...font.body, color: c.text, flex: 1 },
  partnerHint: { ...font.sub, color: c.textMuted, marginLeft: 32, lineHeight: 19 },
  bottom: {
    paddingHorizontal: space.lg, paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: c.bg,
  },
  btnPrimary: {
    minHeight: TAP + 4, justifyContent: 'center', alignItems: 'center',
    backgroundColor: c.accent, borderRadius: radius.md,
  },
  btnOff: { opacity: 0.4 },
  btnPrimaryText: { ...font.body, fontWeight: 'bold', color: c.onAccent },
  btnPlain: { minHeight: TAP, justifyContent: 'center', alignItems: 'center', marginTop: space.xs },
  btnPlainText: { ...font.body, color: c.textSub },
});
