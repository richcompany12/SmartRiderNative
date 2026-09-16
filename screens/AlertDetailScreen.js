import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { getAlertPoint, updateAlertPoint, deleteAlertPoint } from '../firebaseDB';
import { syncAlertsToService } from '../alertSync';
import { useAuth } from '../AuthContext';
import { useTheme } from '../theme';

const ALERT_TYPES = [
  { key: 'rear', label: '후방카메라' },
  { key: 'front', label: '전방카메라' },
  { key: 'parking', label: '주차단속' },
  { key: 'etc', label: '기타' },
];

const typeLabel = (key) =>
  ALERT_TYPES.find(t => t.key === key)?.label || '알림구역';

export default function AlertDetailScreen({ navigation, route }) {
  const { alertId } = route.params;
  const { c, font, space, radius, TAP } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius, TAP), [c]);

  const [point, setPoint] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [locationChanged, setLocationChanged] = useState(false);

  const { isAdmin } = useAuth();

  useEffect(() => {
    getAlertPoint(alertId).then(data => {
      if (!data) {
        Alert.alert('없는 지점', '이미 삭제된 알림지점입니다.');
        navigation.goBack();
        return;
      }
      if (data.location) {
        data.location = {
          lat: parseFloat(String(data.location.lat)),
          lng: parseFloat(String(data.location.lng))
        };
      }
      setPoint(data);
    });
  }, [alertId]);

  const handleSave = async () => {
    if (!point.name?.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateAlertPoint({ ...point, name: point.name.trim() });
      // 저장 즉시 Kotlin에 반영 (앱을 껐다 켜지 않아도 되게)
      syncAlertsToService();
      setEditMode(false);
      setLocationChanged(false);
      setSaveMsg('저장 완료!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (e) {
      Alert.alert('오류', '저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '알림지점 삭제',
      `"${point.name}"을(를) 삭제합니다.\n카메라가 없어졌거나 잘못 등록한 경우에만 삭제해주세요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            try {
              await deleteAlertPoint(alertId);
              syncAlertsToService();
              navigation.goBack();
            } catch (e) {
              Alert.alert('오류', '삭제 실패: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const openLocationPicker = () => {
    navigation.navigate('LocationPicker', {
      initialLocation: point.location || null,
      onPicked: (loc) => {
        setPoint(prev => ({ ...prev, location: loc }));
        setLocationChanged(true);
      }
    });
  };

  if (!point) return (
    <View style={s.loadingContainer}>
      <ActivityIndicator size="large" color={c.danger} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 340 }}>
      <View style={s.banner}>
        <Text style={s.bannerText}>{typeLabel(point.alertType)}</Text>
      </View>

      {saveMsg ? (
        <View style={s.saveMsg}>
          <Text style={s.saveMsgText}>{saveMsg}</Text>
        </View>
      ) : null}

      {editMode ? (
        <>
          <Text style={s.label}>이름</Text>
          <TextInput
            style={s.input}
            value={point.name}
            onChangeText={v => setPoint(p => ({ ...p, name: v }))}
            placeholderTextColor={c.textFaint}
          />

          <Text style={s.label}>알림 종류</Text>
          <View style={s.typeGrid}>
            {ALERT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[s.typeBtn, point.alertType === t.key && s.typeBtnActive]}
                onPress={() => setPoint(p => ({ ...p, alertType: t.key }))}
              >
                <Text style={[s.typeBtnText, point.alertType === t.key && s.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>메모</Text>
          <TextInput
            style={s.input}
            value={point.memo || ''}
            onChangeText={v => setPoint(p => ({ ...p, memo: v }))}
            placeholder="예: 삼거리 신호등 옆"
            placeholderTextColor={c.textFaint}
          />

          <TouchableOpacity style={s.btnLocation} onPress={openLocationPicker}>
            <Text style={s.btnLocationText}>위치 옮기기</Text>
          </TouchableOpacity>
          {point.location && (
            <Text style={s.coordText}>
              위도: {point.location.lat?.toFixed(6)}, 경도: {point.location.lng?.toFixed(6)}
            </Text>
          )}
          {locationChanged && (
            <View style={s.locChangedBox}>
              <Text style={s.locChangedText}>위치가 변경되었습니다. 저장을 눌러 완료하세요.</Text>
            </View>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={s.btnSave} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={c.onAccent} /> : <Text style={s.btnSaveText}>저장</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnCancel}
              onPress={() => { setEditMode(false); setLocationChanged(false); }}
            >
              <Text style={s.btnCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>이름</Text>
            <Text style={s.infoValue}>{point.name}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>메모</Text>
            <Text style={s.infoValue}>{point.memo || '없음'}</Text>
          </View>
          {point.location && (
            <View style={s.infoBox}>
              <Text style={s.infoLabel}>위치</Text>
              <Text style={s.infoValue}>
                위도: {point.location.lat?.toFixed(6)}{'\n'}경도: {point.location.lng?.toFixed(6)}
              </Text>
            </View>
          )}

          {isAdmin ? (
            <View style={s.btnRow}>
              <TouchableOpacity style={s.btnEdit} onPress={() => setEditMode(true)}>
                <Text style={s.btnEditText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnDelete} onPress={handleDelete}>
                <Text style={s.btnDeleteText}>삭제</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.readonly}>알림지점 수정은 관리자만 할 수 있습니다.</Text>
          )}
        </>
      )}

      <TouchableOpacity style={s.btnBack} onPress={() => navigation.goBack()}>
        <Text style={s.btnBackText}>← 뒤로</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c, font, space, radius, TAP) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg, padding: space.lg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },

  // 강력알림은 danger를 쓰는 게 맞다. 진짜 위험 정보다.
  banner: {
    backgroundColor: c.dangerSoft, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.danger, borderRadius: radius.md,
    padding: space.lg, marginBottom: space.lg,
  },
  bannerText: { ...font.head, color: c.danger },

  saveMsg: {
    backgroundColor: c.accentSoft, padding: space.md,
    borderRadius: radius.sm, marginBottom: space.md,
  },
  saveMsgText: { ...font.sub, color: c.accent, textAlign: 'center' },

  label: { ...font.sub, fontWeight: '500', color: c.fieldLabel, marginBottom: space.xs, marginTop: space.md },
  input: {
    backgroundColor: c.field, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.fieldBorder, borderRadius: radius.sm,
    padding: space.md, ...font.body, color: c.text,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  typeBtn: {
    backgroundColor: c.surfaceSoft, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line, paddingHorizontal: space.lg,
    minHeight: TAP, justifyContent: 'center', borderRadius: radius.sm,
  },
  typeBtnActive: { backgroundColor: c.danger, borderColor: c.danger },
  typeBtnText: { ...font.sub, fontWeight: '500', color: c.textSub },
  typeBtnTextActive: { color: '#FFFFFF' },

  infoBox: {
    backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.line,
  },
  infoLabel: { ...font.tiny, color: c.textFaint, marginBottom: space.xs },
  infoValue: { ...font.body, fontWeight: '500', color: c.text, lineHeight: 23 },

  btnLocation: {
    backgroundColor: c.surfaceSoft, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, minHeight: TAP, justifyContent: 'center',
    borderRadius: radius.sm, alignItems: 'center', marginTop: space.lg,
  },
  btnLocationText: { ...font.body, fontWeight: '500', color: c.publicColor },
  coordText: { ...font.sub, color: c.textMuted, marginTop: space.sm },
  locChangedBox: {
    backgroundColor: c.warnSoft, padding: space.md,
    borderRadius: radius.sm, marginTop: space.sm,
  },
  locChangedText: { ...font.sub, color: c.warn, lineHeight: 20 },

  btnRow: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  btnSave: {
    flex: 1, backgroundColor: c.accent, minHeight: TAP,
    justifyContent: 'center', borderRadius: radius.sm, alignItems: 'center',
  },
  btnSaveText: { ...font.body, fontWeight: '500', color: c.onAccent },
  btnCancel: {
    flex: 1, backgroundColor: c.surfaceSoft, minHeight: TAP,
    justifyContent: 'center', borderRadius: radius.sm, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  btnCancelText: { ...font.body, fontWeight: '500', color: c.textSub },
  btnEdit: {
    flex: 1, backgroundColor: c.surfaceSoft, minHeight: TAP,
    justifyContent: 'center', borderRadius: radius.sm, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  btnEditText: { ...font.body, fontWeight: '500', color: c.textSub },
  btnDelete: {
    flex: 1, backgroundColor: c.dangerSoft, minHeight: TAP,
    justifyContent: 'center', borderRadius: radius.sm, alignItems: 'center',
  },
  btnDeleteText: { ...font.body, fontWeight: '500', color: c.danger },

  readonly: { ...font.sub, color: c.textFaint, textAlign: 'center', marginTop: space.lg },
  btnBack: {
    backgroundColor: c.surfaceSoft, minHeight: TAP, justifyContent: 'center',
    borderRadius: radius.sm, alignItems: 'center',
    marginTop: space.lg, marginBottom: 40,
  },
  btnBackText: { ...font.body, color: c.textSub },
});