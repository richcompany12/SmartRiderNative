package com.richcompany.smartridernative3

import android.app.NotificationChannel
import android.app.NotificationManager
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
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class ProximityOverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private data class ToastEntry(
        val view: View,
        val params: WindowManager.LayoutParams,
        var pinned: Boolean = false,
        var dismissRunnable: Runnable? = null
    )
    private val activeToasts = linkedMapOf<String, ToastEntry>()
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        const val CHANNEL_ID = "smartrider_proximity"
        const val ACTION_SHOW_TOAST = "com.richcompany.smartridernative3.SHOW_TOAST"
        const val ACTION_DISMISS_ALL = "com.richcompany.smartridernative3.DISMISS_TOASTS"
        const val EXTRA_PAYLOAD = "payload"
        const val AUTO_DISMISS = 15000L
        const val MAX_TOASTS = 3
        const val CARD_HEIGHT_ESTIMATE = 170
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

    override fun onCreate() {
        super.onCreate()
        createChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("스마트라이더")
            .setContentText("근접 알림 서비스 실행 중")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    startForeground(2, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
} else {
    startForeground(2, notification)
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
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(receiver) } catch (e: Exception) {}
        dismissAll()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

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
        var longPressRunnable: Runnable? = null
        var startX = 0f
        var startParamX = 0
        var isDragging = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startParamX = params.x
                    isDragging = false
                    longPressRunnable = Runnable {
                        removeToast(id)
                        if (buildingId.isNotEmpty()) emitDetailRequest(buildingId)
                    }
                    handler.postDelayed(longPressRunnable!!, 2000)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    if (Math.abs(dx) > 10 && !isDragging) {
                        isDragging = true
                        longPressRunnable?.let { handler.removeCallbacks(it) }
                    }
                    if (isDragging && dx < 0) {
                        params.x = (startParamX - dx).toInt()
                        try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    longPressRunnable?.let { handler.removeCallbacks(it) }
                    if (isDragging) {
                        val dx = event.rawX - startX
                        if (Math.abs(dx) > 80) {
                            removeToast(id)
                        } else {
                            params.x = 12
                            try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                        }
                    } else {
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
            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("ProximityToastDetailRequested", buildingId)
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