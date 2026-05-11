// android/app/src/main/java/com/myapp/MainActivity.kt

package com.myapp

import android.content.res.Configuration
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.oney.WebRTCModule.WebRTCModuleOptions
import com.myapp.pip.PipModule   // ← our own module, zero npm deps

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        val options = WebRTCModuleOptions.getInstance()
        options.enableMediaProjectionService = true
        super.onCreate(savedInstanceState)
    }

    /**
     * Android fires this whenever PiP mode enters or exits.
     * We forward it to our PipModule so the JS NativeEventEmitter
     * can notify usePiP() subscribers.
     */
    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        PipModule.onPipModeChanged(isInPictureInPictureMode)
    }

    override fun getMainComponentName(): String = "MyApp"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}