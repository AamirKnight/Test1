// android/app/src/main/java/com/myapp/pip/PipModule.kt
//
// A zero-dependency Kotlin native module that exposes Android's built-in
// PictureInPicture API (API 26+) to React Native JavaScript.
//
// JS methods exposed:
//   PipModule.enterPipMode(width: number, height: number)
//   PipModule.isPipSupported(): Promise<boolean>
//   PipModule.isInPipMode(): Promise<boolean>
//
// JS events (subscribe via NativeEventEmitter):
//   "onPipModeChanged" → { isInPipMode: boolean }
//
// MainActivity.kt must call PipModule.onPipModeChanged(bool) from
// onPictureInPictureModeChanged() to fire the JS event.

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

        // Singleton reference so MainActivity can call back into this module
        private var instance: PipModule? = null

        /** Called from MainActivity.onPictureInPictureModeChanged */
        @JvmStatic
        fun onPipModeChanged(isInPipMode: Boolean) {
            instance?.emitPipModeChanged(isInPipMode)
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    // ────────────────────────────────────────────────────────────────────────
    // enterPipMode(width, height)
    //
    // width / height → rational aspect ratio (not pixels).
    //   Portrait call:  enterPipMode(9, 16)
    //   Landscape call: enterPipMode(16, 9)
    // No-ops silently on API < 26 or unsupported devices.
    // ────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun enterPipMode(width: Int, height: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val activity = currentActivity ?: return

        activity.runOnUiThread {
            try {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(width.coerceAtLeast(1), height.coerceAtLeast(1)))
                    .build()
                activity.enterPictureInPictureMode(params)
            } catch (_: Exception) {
                // Some OEM ROMs deny PiP even on API 26+ — swallow to avoid crash
            }
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // isPipSupported() → Promise<Boolean>
    // ────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false); return
        }
        val supported = currentActivity
            ?.packageManager
            ?.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
            ?: false
        promise.resolve(supported)
    }

    // ────────────────────────────────────────────────────────────────────────
    // isInPipMode() → Promise<Boolean>
    // ────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun isInPipMode(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.resolve(false); return
        }
        promise.resolve(currentActivity?.isInPictureInPictureMode ?: false)
    }

    // ────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ────────────────────────────────────────────────────────────────────────

    private fun emitPipModeChanged(isInPipMode: Boolean) {
        if (!reactContext.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putBoolean("isInPipMode", isInPipMode)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_PIP_MODE_CHANGED, params)
    }

    // Required boilerplate for NativeEventEmitter on RN ≥ 0.65
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        if (instance === this) instance = null
    }
}