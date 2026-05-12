// android/app/src/main/java/com/myapp/pip/PipModule.kt

package com.myapp.pip

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class PipModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "PipModule"
        const val EVENT_PIP_MODE_CHANGED = "onPipModeChanged"

        private var instance: PipModule? = null

        @JvmStatic
        fun onPipModeChanged(isInPipMode: Boolean) {
            instance?.emitPipModeChanged(isInPipMode)
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun enterPipMode(width: Int, height: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        // ✅ Use reactContext.currentActivity instead of bare currentActivity
        val activity = reactContext.currentActivity ?: return

        activity.runOnUiThread {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(width.coerceAtLeast(1), height.coerceAtLeast(1)))
                    .build()
                activity.enterPictureInPictureMode(params)
            } catch (_: Exception) {
                // Some OEM ROMs deny PiP even on API 26+ — swallow silently
            }
        }
    }

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false); return
        }
        val supported = reactContext.currentActivity
            ?.packageManager
            ?.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
            ?: false
        promise.resolve(supported)
    }

    @ReactMethod
    fun isInPipMode(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false); return
        }
        promise.resolve(reactContext.currentActivity?.isInPictureInPictureMode ?: false)
    }

    private fun emitPipModeChanged(isInPipMode: Boolean) {
        if (!reactContext.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putBoolean("isInPipMode", isInPipMode)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_PIP_MODE_CHANGED, params)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        if (instance === this) instance = null
    }
}