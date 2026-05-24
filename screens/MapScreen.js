import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { getAllBuildings, getAllAlertPoints } from '../firebaseDB';

const KAKAO_API_KEY = '7d65ade73c1b3e7d64687306911f7ce7';

export default function MapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const [buildings, setBuildings] = useState([]);
  const [alertPoints, setAlertPoints] = useState([]);
  const [myLocation, setMyLocation] = useState(null);

  useEffect(() => {
    (async () => {
      // 위치 권한
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setMyLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
      // 데이터 로드
      const bList = await getAllBuildings();
      const aList = await getAllAlertPoints();
      setBuildings(bList);
      setAlertPoints(aList);
    })();
  }, []);

  // 데이터 준비되면 WebView로 전송
  useEffect(() => {
    if (!myLocation) return;
    sendToMap();
  }, [myLocation, buildings, alertPoints]);

  const sendToMap = () => {
    const msg = JSON.stringify({
      type: 'INIT',
      myLocation,
      buildings: buildings.filter(b => b.location),
      alertPoints: alertPoints.filter(a => a.location),
    });
    webViewRef.current?.postMessage(msg);
  };

  const moveToMyLocation = () => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'MOVE_TO_MY_LOCATION' }));
  };

  // WebView → RN 메시지 처리
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MARKER_CLICK') {
        navigation.navigate('Detail', { buildingId: data.id });
      } else if (data.type === 'LONG_PRESS') {
        // 지도 길게 눌러 등록
        const { lat, lng, nearest } = data;
        if (nearest) {
          Alert.alert(
            '근처 건물 발견',
            `📍 근처에 "${nearest.name}" 이(가) 있습니다.\n\n복사해서 등록하시겠습니까?`,
            [
              {
                text: '복사 등록', onPress: () => navigation.navigate('Register', {
                  buildingData: { name: nearest.name, memo: nearest.memo || '', note: nearest.note || '', shortcut: nearest.shortcut || '', images: [] },
                  location: { lat, lng }
                })
              },
              { text: '새로 등록', onPress: () => navigation.navigate('Register', { location: { lat, lng } }) },
              { text: '취소', style: 'cancel' }
            ]
          );
        } else {
          navigation.navigate('Register', { location: { lat, lng } });
        }
      }
    } catch (e) {}
  };

  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .overlay {
      background: #fff; border-radius: 10px; padding: 10px 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: sans-serif; max-width: 220px; position: relative;
      border-left: 4px solid #3b82f6;
    }
    .overlay-name { font-weight: bold; font-size: 13px; color: #1e3a5f; margin-bottom: 4px; }
    .overlay-memo { font-size: 12px; color: #374151; background: #f0f4ff; padding: 4px 6px; border-radius: 6px; font-family: monospace; word-break: break-all; }
    .overlay-hint { font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: center; }
    .overlay-close { position: absolute; top: 4px; right: 8px; cursor: pointer; font-size: 16px; color: #9ca3af; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false"></script>
  <script>
    var map, myMarker, myCircle, currentOverlay;
    var longPressTimer = null;

    kakao.maps.load(function() {
      map = new kakao.maps.Map(document.getElementById('map'), {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 3
      });

      // RN에서 메시지 수신
      document.addEventListener('message', handleRNMessage);
      window.addEventListener('message', handleRNMessage);
    });

    function handleRNMessage(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'INIT') {
          initMap(data);
        } else if (data.type === 'MOVE_TO_MY_LOCATION') {
          if (myMarker) map.setCenter(myMarker.getPosition());
        }
      } catch(err) {}
    }

    function calcDistance(lat1, lng1, lat2, lng2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
              Math.sin(dLng/2)*Math.sin(dLng/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function findNearest(lat, lng, buildings) {
      var nearest = null, minDist = Infinity;
      buildings.forEach(function(b) {
        if (!b.location) return;
        var d = calcDistance(lat, lng, b.location.lat, b.location.lng);
        if (d < minDist) { minDist = d; nearest = b; }
      });
      return minDist < 500 ? nearest : null;
    }

    function initMap(data) {
      var myLat = data.myLocation.lat;
      var myLng = data.myLocation.lng;
      var myPos = new kakao.maps.LatLng(myLat, myLng);
      map.setCenter(myPos);

      // 내 위치 마커
      if (myMarker) myMarker.setMap(null);
      myMarker = new kakao.maps.Marker({
        position: myPos, map: map,
        image: new kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
          new kakao.maps.Size(24, 35)
        )
      });

      // 건물 마커
      data.buildings.forEach(function(b) {
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(b.location.lat, b.location.lng),
          map: map, title: b.name
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          showOverlay(b, false);
        });
      });

      // 알림 마커
      data.alertPoints.forEach(function(a) {
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(a.location.lat, a.location.lng),
          map: map,
          image: new kakao.maps.MarkerImage(
            'https://cdn-icons-png.flaticon.com/512/564/564619.png',
            new kakao.maps.Size(35, 35)
          ),
          title: a.name
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          showOverlay(a, true);
        });
      });

      // 지도 길게 누르기 (터치)
      var touchTimer = null, touchLatLng = null;
      document.getElementById('map').addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        var touch = e.touches[0];
        var rect = document.getElementById('map').getBoundingClientRect();
        var proj = map.getProjection();
        var point = new kakao.maps.Point(touch.clientX - rect.left, touch.clientY - rect.top);
        touchLatLng = proj.coordsFromContainerPoint(point);
        touchTimer = setTimeout(function() {
          var lat = touchLatLng.getLat();
          var lng = touchLatLng.getLng();
          var nearest = findNearest(lat, lng, data.buildings);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LONG_PRESS', lat: lat, lng: lng,
            nearest: nearest ? { id: nearest.id, name: nearest.name, memo: nearest.memo || '', note: nearest.note || '', shortcut: nearest.shortcut || '' } : null
          }));
        }, 800);
      }, { passive: true });

      document.getElementById('map').addEventListener('touchend', function() { clearTimeout(touchTimer); });
      document.getElementById('map').addEventListener('touchmove', function() { clearTimeout(touchTimer); });
    }

    function showOverlay(item, isAlert) {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
      var content = '<div class="overlay" id="ov_' + item.id + '">' +
        '<div class="overlay-name">' + item.name + '</div>' +
        (item.memo ? '<div class="overlay-memo">' + item.memo + '</div>' : '') +
        '<div class="overlay-hint">✏️ 2초 길게 누르면 수정</div>' +
        '<div class="overlay-close" onclick="closeOverlay()">×</div>' +
        '</div>';
      var overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(item.location.lat, item.location.lng),
        content: content, yAnchor: 2.2, map: map
      });
      currentOverlay = overlay;

      setTimeout(function() {
        var el = document.getElementById('ov_' + item.id);
        if (!el) return;
        var timer = null;
        el.addEventListener('touchstart', function() {
          timer = setTimeout(function() {
            overlay.setMap(null);
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MARKER_CLICK', id: item.id }));
          }, 2000);
        }, { passive: true });
        el.addEventListener('touchend', function() { clearTimeout(timer); });
        el.addEventListener('touchmove', function() { clearTimeout(timer); });
      }, 100);
    }

    function closeOverlay() {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
    }
  </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
      />
      {/* 내 위치 버튼 */}
      <TouchableOpacity style={styles.myLocBtn} onPress={moveToMyLocation}>
        <Text style={styles.myLocBtnText}>📍</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  myLocBtn: {
    position: 'absolute', bottom: 30, right: 16,
    backgroundColor: '#fff', borderRadius: 30, width: 52, height: 52,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 6
  },
  myLocBtnText: { fontSize: 24 },
});