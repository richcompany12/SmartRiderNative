package com.richcompany.smartridernative3

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class ProximityOverlayService : Service() {

    private lateinit var windowManager: WindowManager

    private data class ToastEntry(
        val view: View,
        val params: WindowManager.LayoutParams,
        var pinned: Boolean = false,
        var dismissRunnable: Runnable? = null
    )

    // 판정에 쓰는 건물 하나
    private data class Building(
        val id: String,
        val name: String,
        val memo: String,
        val lat: Double,
        val lng: Double
    )

    private val activeToasts = linkedMapOf<String, ToastEntry>()
    private val handler = Handler(Looper.getMainLooper())

    // ── 위치 수신 ──
    private var fusedClient: FusedLocationProviderClient? = null
    private var ktCallback: LocationCallback? = null
    private var lastLocationAt = 0L      // 마지막 위치 수신 시각 (알림 표시용)

    // ── 판정 데이터 ──
    private var buildings: List<Building> = emptyList()
    private var radius = 20.0
    private val dwellMap = HashMap<String, Long>()      // 반경 안에 처음 들어온 시각
    private val cooldownMap = HashMap<String, Long>()   // 마지막으로 토스트 띄운 시각

    // 속도 직접 계산용 직전 좌표
    private var lastFixLat = 0.0
    private var lastFixLng = 0.0
    private var lastFixAt = 0L

    private var notifManager: NotificationManager? = null

    private val healthChecker = object : Runnable {
        override fun run() {
            updateNotification()
            handler.postDelayed(this, CHECK_INTERVAL)
        }
    }

    companion object {
        const val CHANNEL_ID = "smartrider_proximity"
        const val ACTION_SHOW_TOAST = "com.richcompany.smartridernative3.SHOW_TOAST"
        const val ACTION_DISMISS_ALL = "com.richcompany.smartridernative3.DISMISS_TOASTS"
        const val ACTION_SET_BUILDINGS = "com.richcompany.smartridernative3.SET_BUILDINGS"
        const val EXTRA_PAYLOAD = "payload"
        const val AUTO_DISMISS = 15000L
        const val MAX_TOASTS = 3
        const val CARD_HEIGHT_ESTIMATE = 170
        const val NOTI_ID = 2
        const val CHECK_INTERVAL = 15000L
        const val STALE_THRESHOLD = 120000L

        // 판정 기준 (JS에 있던 값 그대로)
        const val SPEED_THRESHOLD = 2.5     // m/s 미만이어야 "도착"으로 봄
        const val DWELL_TIME = 3000L        // 반경 안에 이만큼 머물러야 함
        const val COOLDOWN = 300000L        // 같은 건물 재알림 최소 간격 (5분)
        const val MAX_CANDIDATES = 3

        const val DOUBLE_TAP_WINDOW = 400L
        const val TAG = "PROX_KT"
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_SHOW_TOAST -> {
                    val json = intent.getStringExtra(EXTRA_PAYLOAD) ?: return
                    try { showToast(JSONObject(json)) } catch (e: Exception) { e.printStackTrace() }
                }
                ACTION_DISMISS_ALL -> dismissAll()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW_TOAST -> {
                val json = intent.getStringExtra(EXTRA_PAYLOAD)
                if (json != null) {
                    handler.post {
                        try { showToast(JSONObject(json)) } catch (e: Exception) { e.printStackTrace() }
                    }
                }
            }
            ACTION_DISMISS_ALL -> handler.post { dismissAll() }
            ACTION_SET_BUILDINGS -> {
                val json = intent.getStringExtra(EXTRA_PAYLOAD)
                if (json != null) handler.post { setBuildings(json) }
            }
        }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        notifManager = getSystemService(NotificationManager::class.java)

        val notification = buildNotification("위치 확인 대기 중...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTI_ID, notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTI_ID, notification)
        }

        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val filter = IntentFilter().apply {
            addAction(ACTION_SHOW_TOAST)
            addAction(ACTION_DISMISS_ALL)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }

        handler.postDelayed(healthChecker, CHECK_INTERVAL)
        startLocationUpdates()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(healthChecker)
        stopLocationUpdates()
        try { unregisterReceiver(receiver) } catch (e: Exception) {}
        dismissAll()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    // ────────────────────────────────────────────
    //  건물 목록 (JS가 넘겨줌)
    // ────────────────────────────────────────────

    private fun setBuildings(json: String) {
        try {
            val root = JSONObject(json)
            radius = root.optDouble("radius", 20.0)
            val arr: JSONArray = root.getJSONArray("buildings")
            val list = ArrayList<Building>(arr.length())

            for (i in 0 until arr.length()) {
                val b = arr.getJSONObject(i)
                val lat = b.optDouble("lat", Double.NaN)
                val lng = b.optDouble("lng", Double.NaN)
                if (lat.isNaN() || lng.isNaN()) continue
                list.add(
                    Building(
                        id = b.optString("id", ""),
                        name = b.optString("name", ""),
                        memo = b.optString("memo", ""),
                        lat = lat,
                        lng = lng
                    )
                )
            }
            buildings = list
            android.util.Log.d(TAG, "건물 목록 수신: ${list.size}개, 반경 ${radius.toInt()}m")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "건물 목록 파싱 실패: " + e.message)
        }
    }

    // ────────────────────────────────────────────
    //  위치 수신 + 판정
    // ────────────────────────────────────────────

    private fun startLocationUpdates() {
        val granted = ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        if (!granted) {
            android.util.Log.e(TAG, "위치 권한 없음 — 수신 시작 못함")
            return
        }

        try {
            fusedClient = LocationServices.getFusedLocationProviderClient(this)

            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
                .setMinUpdateIntervalMillis(3000L)
                .setMinUpdateDistanceMeters(0f)
                .build()

            val cb = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    lastLocationAt = System.currentTimeMillis()
                    onNewLocation(loc.latitude, loc.longitude,
                        if (loc.hasSpeed()) loc.speed.toDouble() else -1.0)
                }
            }
            ktCallback = cb
            fusedClient?.requestLocationUpdates(request, cb, Looper.getMainLooper())
            android.util.Log.d(TAG, "위치 수신 등록 완료")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "위치 수신 등록 실패: " + e.message)
        }
    }

    private fun stopLocationUpdates() {
        try {
            ktCallback?.let { fusedClient?.removeLocationUpdates(it) }
            ktCallback = null
        } catch (e: Exception) { e.printStackTrace() }
    }

    // 두 좌표 사이 거리 (미터)
    private fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLng / 2) * sin(dLng / 2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    // 기기가 속도를 안 주면 직전 좌표와의 거리로 직접 계산한다
    private fun resolveSpeed(lat: Double, lng: Double, rawSpeed: Double, now: Long): Double {
        var spd = if (rawSpeed < 0) -1.0 else rawSpeed
        if (spd < 0 && lastFixAt > 0) {
            val dt = (now - lastFixAt) / 1000.0
            if (dt > 0.5) {
                spd = distanceMeters(lastFixLat, lastFixLng, lat, lng) / dt
            }
        }
        lastFixLat = lat
        lastFixLng = lng
        lastFixAt = now
        return if (spd < 0) 0.0 else spd
    }

    private fun onNewLocation(lat: Double, lng: Double, rawSpeed: Double) {
        val now = System.currentTimeMillis()
        val speed = resolveSpeed(lat, lng, rawSpeed, now)

        if (buildings.isEmpty()) {
            android.util.Log.d(TAG, "위치 수신했으나 건물 목록이 비어있음")
            return
        }

        val candidates = ArrayList<Pair<Building, Double>>()
        var nearestName = ""
        var nearestDist = Double.MAX_VALUE

        for (b in buildings) {
            val dist = distanceMeters(lat, lng, b.lat, b.lng)
            if (dist < nearestDist) { nearestDist = dist; nearestName = b.name }

            if (dist <= radius) {
                if (!dwellMap.containsKey(b.id)) dwellMap[b.id] = now
                val dwell = now - (dwellMap[b.id] ?: now)
                val okSpeed = speed < SPEED_THRESHOLD
                val okDwell = dwell > DWELL_TIME

                android.util.Log.d(
                    TAG,
                    "반경내 ${b.name} 거리${dist.toInt()}m " +
                    "속도${String.format("%.1f", speed)}${if (okSpeed) "O" else "X"} " +
                    "체류${dwell / 1000}초${if (okDwell) "O" else "X"}"
                )

                if (okSpeed && okDwell) candidates.add(Pair(b, dist))
            } else {
                dwellMap.remove(b.id)
            }
        }

        if (nearestName.isNotEmpty()) {
            android.util.Log.d(TAG, "위치 ${String.format("%.6f", lat)}, ${String.format("%.6f", lng)} " +
                    "속도${String.format("%.1f", speed)} 최근접 $nearestName ${nearestDist.toInt()}m (반경${radius.toInt()}m)")
        }

        if (candidates.isEmpty()) return

        // 가까운 순으로 정렬 후 최대 3개
        candidates.sortBy { it.second }
        val top = candidates.take(MAX_CANDIDATES)

        // 쿨다운 통과한 것만
        val fresh = top.filter { now - (cooldownMap[it.first.id] ?: 0L) > COOLDOWN }
        if (fresh.isEmpty()) {
            android.util.Log.d(TAG, "쿨다운으로 스킵")
            return
        }
        fresh.forEach { cooldownMap[it.first.id] = now }

        // 토스트 payload 만들기 (기존 형식 그대로)
        val id = "overlay_$now"
        val payload = JSONObject()
        payload.put("id", id)

        if (fresh.size == 1) {
            val b = fresh[0].first
            payload.put("type", "single")
            payload.put("buildingId", b.id)
            payload.put("name", b.name)
            payload.put("memo", b.memo)
        } else {
            payload.put("type", "cluster")
            val arr = JSONArray()
            for ((b, _) in fresh) {
                val o = JSONObject()
                o.put("buildingId", b.id)
                o.put("name", b.name)
                o.put("memo", b.memo)
                arr.put(o)
            }
            payload.put("candidates", arr)
        }

        android.util.Log.d(TAG, "오버레이 발사! " + fresh.joinToString(",") { it.first.name })
        handler.post {
            try { showToast(payload) } catch (e: Exception) { e.printStackTrace() }
        }
    }

    // ────────────────────────────────────────────
    //  알림
    // ────────────────────────────────────────────

    private fun buildNotification(text: String): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pending = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("스마트라이더")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOngoing(true)
            .setContentIntent(pending)
            .build()
    }

    private fun updateNotification() {
        val now = System.currentTimeMillis()
        val text: String

        if (lastLocationAt == 0L) {
            text = "위치 확인 대기 중..."
        } else {
            val age = now - lastLocationAt
            text = if (age > STALE_THRESHOLD) {
                "⚠️ 감지 중단됨 (${age / 1000}초)"
            } else {
                "감지 중 · ${age / 1000}초 전 위치 확인 · 건물 ${buildings.size}"
            }
        }

        try {
            notifManager?.notify(NOTI_ID, buildNotification(text))
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ────────────────────────────────────────────
    //  앱 진입 (더블탭)
    // ────────────────────────────────────────────

    private fun openAppWithDetail(buildingId: String) {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent == null) {
                android.util.Log.e(TAG, "앱 실행 인텐트를 찾을 수 없음")
                return
            }
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            launchIntent.putExtra("buildingId", buildingId)
            startActivity(launchIntent)
            android.util.Log.d(TAG, "더블탭 — 앱 실행 ($buildingId)")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "앱 실행 실패: " + e.message)
        }

        if (buildingId.isEmpty()) return

        // 앱 화면이 다 뜬 뒤에 보내야 한다.
        // 너무 일찍 보내면 navigate가 먹혔다가 앱 초기화에 덮어써진다.
        handler.postDelayed({ emitDetailRequest(buildingId) }, 1200)
        handler.postDelayed({ emitDetailRequest(buildingId) }, 2500)
        handler.postDelayed({ emitDetailRequest(buildingId) }, 4000)
    }

    // ────────────────────────────────────────────
    //  토스트
    // ────────────────────────────────────────────

    private fun showToast(payload: JSONObject) {
        val id = payload.getString("id")
        if (activeToasts.containsKey(id)) return

        if (activeToasts.size >= MAX_TOASTS) {
            activeToasts.keys.firstOrNull()?.let { removeToast(it) }
        }

        val view = LayoutInflater.from(this).inflate(R.layout.toast_card, null)
        val nameView = view.findViewById<TextView>(R.id.toast_name)
        val memoView = view.findViewById<TextView>(R.id.toast_memo)
        val closeView = view.findViewById<TextView>(R.id.toast_close)
        val hintView = view.findViewById<TextView>(R.id.toast_hint)

        val type = payload.optString("type", "single")
        var buildingId = ""

        if (type == "cluster") {
            val candidates = payload.getJSONArray("candidates")
            nameView.text = "🏢 근처 건물 (${candidates.length()})"
            val sb = StringBuilder()
            for (i in 0 until candidates.length()) {
                val c = candidates.getJSONObject(i)
                sb.append("• ").append(c.getString("name"))
                if (i < candidates.length() - 1) sb.append("\n")
            }
            memoView.text = sb.toString()
            memoView.visibility = View.VISIBLE
        } else {
            buildingId = payload.optString("buildingId", "")
            val name = payload.optString("name", "")
            val memo = payload.optString("memo", "")
            nameView.text = "🏢 $name"
            if (memo.isNotEmpty()) memoView.text = memo
        }

        hintView.text = if (type == "cluster") "더블탭 → 앱 열기" else "더블탭 → 상세보기"

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 12
            y = 150 + activeToasts.size * CARD_HEIGHT_ESTIMATE
        }

        val entry = ToastEntry(view, params)
        activeToasts[id] = entry

        closeView.setOnClickListener { removeToast(id) }

        var pinned = false
        var expanded = false
        var lastTapAt = 0L
        var startX = 0f
        var startParamX = 0
        var isDragging = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startParamX = params.x
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    if (abs(dx) > 10 && !isDragging) isDragging = true
                    if (isDragging && dx < 0) {
                        params.x = (startParamX - dx).toInt()
                        try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (isDragging) {
                        val dx = event.rawX - startX
                        if (abs(dx) > 80) {
                            removeToast(id)
                        } else {
                            params.x = 12
                            try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                        }
                    } else {
                        val now = System.currentTimeMillis()
                        if (pinned && now - lastTapAt < DOUBLE_TAP_WINDOW) {
                            // 더블탭 → 앱 진입
                            lastTapAt = 0L
                            removeToast(id)
                            openAppWithDetail(buildingId)
                        } else {
                            // 단일 탭 → 고정 / 메모 펼치기
                            lastTapAt = now
                            if (!pinned) {
                                pinned = true
                                entry.pinned = true
                                view.setBackgroundResource(R.drawable.toast_bg_pinned)
                                hintView.visibility = View.VISIBLE
                                entry.dismissRunnable?.let { handler.removeCallbacks(it) }
                            }
                            expanded = !expanded
                            memoView.visibility = if (expanded || type == "cluster") View.VISIBLE else View.GONE
                        }
                    }
                    true
                }
                else -> false
            }
        }

        try {
            windowManager.addView(view, params)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val dismissRunnable = Runnable { removeToast(id) }
        entry.dismissRunnable = dismissRunnable
        handler.postDelayed(dismissRunnable, AUTO_DISMISS)
    }

    private fun removeToast(id: String) {
        val entry = activeToasts[id] ?: return
        entry.dismissRunnable?.let { handler.removeCallbacks(it) }
        try { windowManager.removeView(entry.view) } catch (e: Exception) {}
        activeToasts.remove(id)
        repositionToasts()
    }

    private fun repositionToasts() {
        var index = 0
        for ((_, entry) in activeToasts) {
            entry.params.y = 150 + index * CARD_HEIGHT_ESTIMATE
            try { windowManager.updateViewLayout(entry.view, entry.params) } catch (e: Exception) {}
            index++
        }
    }

    private fun dismissAll() {
        for (id in activeToasts.keys.toList()) removeToast(id)
    }

    private fun emitDetailRequest(buildingId: String) {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            if (reactContext == null) {
                android.util.Log.d(TAG, "상세 요청 보류 — JS 아직 준비 안 됨")
                return
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ProximityToastDetailRequested", buildingId)
            android.util.Log.d(TAG, "상세 요청 전송 ($buildingId)")
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "스마트라이더 근접알림",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}