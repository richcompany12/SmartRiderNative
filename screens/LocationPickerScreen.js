import { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

const KAKAO_API_KEY = '7d65ade73c1b3e7d64687306911f7ce7';

export default function LocationPickerScreen({ navigation, route }) {
  const webViewRef = useRef(null);
  const initialLocation = route.params?.initialLocation || null;
  const onPicked = route.params?.onPicked; // 콜백
  const [selected, setSelected] = useState(initialLocation);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let center = initialLocation;
      if (!center && status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        center = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      }
      if (!center) center = { lat: 37.5665, lng: 126.9780 };
      setSelected(center);
      // WebView 준비되면 전송
      setTimeout(() => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'INIT', center, hasInitial: !!initialLocation }));
      }, 500);
    })();
  }, [ready]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PICK') {
        setSelected({ lat: data.lat, lng: data.lng });
      } else if (data.type === 'READY') {
        setReady(true);
      }
    } catch (e) {}
  };

  const handleSave = () => {
    if (selected && onPicked) {
      onPicked(selected);
    }
    navigation.goBack();
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
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false"></script>
  <script>
    var map, marker;
    kakao.maps.load(function() {
      map = new kakao.maps.Map(document.getElementById('map'), {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 3
      });
      document.addEventListener('message', onMsg);
      window.addEventListener('message', onMsg);
      // 지도 클릭 → 마커 이동
      kakao.maps.event.addListener(map, 'click', function(e) {
        var lat = e.latLng.getLat();
        var lng = e.latLng.getLng();
        setMarker(lat, lng);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type:'PICK', lat:lat, lng:lng }));
      });
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'READY' }));
    });

    function onMsg(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'INIT') {
          var pos = new kakao.maps.LatLng(data.center.lat, data.center.lng);
          map.setCenter(pos);
          if (data.hasInitial) setMarker(data.center.lat, data.center.lng);
        }
      } catch(err) {}
    }

    function setMarker(lat, lng) {
      var pos = new kakao.maps.LatLng(lat, lng);
      if (marker) marker.setMap(null);
      marker = new kakao.maps.Marker({ position: pos, map: map });
    }
  </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
      />
      <View style={styles.bottom}>
        {selected && (
          <Text style={styles.coord}>
            위도: {selected.lat.toFixed(6)}  경도: {selected.lng.toFixed(6)}
          </Text>
        )}
        <Text style={styles.hint}>지도를 눌러 위치를 선택하세요</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
            <Text style={styles.btnSaveText}>위치 저장</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnCancel} onPress={() => navigation.goBack()}>
            <Text style={styles.btnCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  bottom: { backgroundColor: '#fff', padding: 16 },
  coord: { fontSize: 13, color: '#475569', marginBottom: 4 },
  hint: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  btnRow: { flexDirection: 'row', gap: 12 },
  btnSave: { flex: 1, backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { flex: 1, backgroundColor: '#e2e8f0', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnCancelText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
});