// android/app/src/main/java/com/myapp/MainApplication.kt

package com.myapp

import android.app.Application
import android.media.AudioAttributes

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType

import com.oney.WebRTCModule.WebRTCModuleOptions
import org.webrtc.audio.JavaAudioDeviceModule

import com.myapp.pip.PipPackage
import com.myapp.blur.BackgroundBlurPackage
import com.myapp.blur.BackgroundBlurModule   // ← ADD THIS

class MainApplication : Application(), ReactApplication {

    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(
            context = applicationContext,
            packageList =
                PackageList(this).packages.apply {
                    add(PipPackage())
                    add(BackgroundBlurPackage())
                },
        )
    }

    override fun onCreate() {
        super.onCreate()

        LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())

        val options = WebRTCModuleOptions.getInstance()
        options.enableMediaProjectionService = true

        // ← REMOVED: options.videoProcessor = BackgroundBlurModule.processor
        // WebRTCModuleOptions does NOT have a videoProcessor field.
        // The BlurVideoProcessor is wired as a VideoSink inside the native module instead.

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        options.audioDeviceModule =
            JavaAudioDeviceModule.builder(this)
                .setAudioAttributes(audioAttributes)
                .createAudioDeviceModule()

        loadReactNative(this)
    }
}