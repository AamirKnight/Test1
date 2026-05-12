package com.myapp.blur

import android.content.Context
import com.oney.WebRTCModule.videoEffects.VideoEffectProcessor
import com.oney.WebRTCModule.videoEffects.VideoEffectsManager
import org.webrtc.Camera1Capturer
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Capturer
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.VideoCapturer
import com.oney.WebRTCModule.DefaultVideoCapturerFactory
import com.oney.WebRTCModule.VideoCapturerFactory

class BlurCapturerFactory(private val context: Context) : VideoCapturerFactory {

    override fun createVideoCapturer(
        deviceId: String?,
        position: String?,
    ): VideoCapturer? {
        val enumerator: CameraEnumerator =
            if (Camera2Enumerator.isSupported(context)) Camera2Enumerator(context)
            else Camera1Enumerator(true)

        // Pick front/back camera
        val deviceNames = enumerator.deviceNames
        val target = when (position) {
            "front" -> deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            "back"  -> deviceNames.firstOrNull { enumerator.isBackFacing(it) }
            else    -> deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                       ?: deviceNames.firstOrNull()
        } ?: deviceNames.firstOrNull() ?: return null

        return if (Camera2Enumerator.isSupported(context)) {
            Camera2Capturer(context, target, null)
        } else {
            Camera1Capturer(target, null, false)
        }
    }
}