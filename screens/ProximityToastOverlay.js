// ProximityToastOverlay.js
// 앱 포그라운드일 때 우측상단 토스트 (최대 3개, 15초 자동삭제, 스와이프 닫기)
// + 후보가 여러 개면 목록(cluster)으로, 하나 고르면 상세보기(single)로 전환

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Animated,
  PanResponder, StyleSheet, Dimensions
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

function ToastCard({ toast, onDismiss, onTouched, onSelect, navigation }) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef(null);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
    onPanResponderMove: (_, g) => {
      if (g.dx > 0) translateX.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > 80) {
        Animated.timing(translateX, { toValue: SCREEN_WIDTH, duration: 200, useNativeDriver: true }).start(() => onDismiss(toast.id));
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    }
  })).current;

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      onDismiss(toast.id);
      navigation?.navigate('Detail', { buildingId: toast.buildingId });
    }, 2000);
  };

  const cancelLongPress = () => clearTimeout(longPressTimer.current);

  const handleTap = () => {
    if (!pinned) {
      setPinned(true);
      onTouched(toast.id);
    }
    setExpanded(prev => !prev);
  };

  const handleSelectCandidate = (candidate) => {
    onSelect(toast.id, candidate);
    onTouched(toast.id);
    setPinned(true);
    setExpanded(true);
  };

  // ── 후보 여러 개: 목록 형태 ──
  if (toast.type === 'cluster') {
    return (
      <Animated.View
        style={[styles.card, { transform: [{ translateX }], borderLeftColor: '#60a5fa' }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.row}>
          <Text style={styles.name}>🏢 근처 건물 ({toast.candidates.length})</Text>
          <TouchableOpacity onPress={() => onDismiss(toast.id)} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>
        {toast.candidates.map(c => (
          <TouchableOpacity
            key={c.buildingId}
            style={styles.clusterItem}
            onPress={() => handleSelectCandidate(c)}
          >
            <Text style={styles.clusterItemText} numberOfLines={1}>• {c.name}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.timerBar} />
      </Animated.View>
    );
  }

  // ── 후보 1개(또는 클러스터에서 선택됨): 기존 상세 카드 ──
  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ translateX }], borderLeftColor: pinned ? '#f59e0b' : '#60a5fa' },
        pinned && styles.cardPinned
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        onPress={handleTap}
        onPressIn={startLongPress}
        onPressOut={cancelLongPress}
        activeOpacity={1}
      >
        <View style={styles.row}>
          <Text style={[styles.name, pinned && styles.namePinned]} numberOfLines={pinned ? undefined : 2}>
            {pinned ? '📌' : '🏢'} {toast.name}
          </Text>
          <TouchableOpacity onPress={() => onDismiss(toast.id)} style={styles.closeBtn}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        {expanded && (
          <Text style={[styles.memo, pinned && styles.memoPinned]}>
            {toast.memo || '메모 없음'}
          </Text>
        )}

        {pinned && (
          <Text style={styles.hint}>✏️ 2초 누르면 상세보기</Text>
        )}
      </TouchableOpacity>

      {!pinned && <View style={styles.timerBar} />}
    </Animated.View>
  );
}

export default function ProximityToastOverlay({ toasts, onDismiss, onTouched, onSelect, navigation }) {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(toast => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onTouched={onTouched}
          onSelect={onSelect}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 60, right: 12,
    zIndex: 9999, alignItems: 'flex-end', gap: 8
  },
  card: {
    width: SCREEN_WIDTH * 0.85, maxWidth: 340,
    backgroundColor: 'rgba(17,24,39,0.95)',
    borderRadius: 12, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
  },
  cardPinned: { width: SCREEN_WIDTH * 0.9, maxWidth: 400 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  name: { flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 14, lineHeight: 20 },
  namePinned: { fontSize: 16, lineHeight: 24 },
  closeBtn: { padding: 4 },
  closeText: { color: '#9ca3af', fontSize: 18 },
  memo: { color: '#fde68a', fontSize: 12, fontFamily: 'monospace', paddingHorizontal: 12, paddingBottom: 10, lineHeight: 19 },
  memoPinned: { fontSize: 15, lineHeight: 24 },
  hint: { color: '#6b7280', fontSize: 11, textAlign: 'center', paddingBottom: 8 },
  clusterItem: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  clusterItemText: { color: '#e5e7eb', fontSize: 14 },
  timerBar: { height: 3, backgroundColor: '#60a5fa' },
});