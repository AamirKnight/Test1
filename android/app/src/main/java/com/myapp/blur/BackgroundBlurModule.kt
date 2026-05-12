// android/app/src/main/java/com/myapp/blur/BackgroundBlurModule.kt

package com.myapp.blur

import android.graphics.*
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.math.max

class BackgroundBlurModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "BackgroundBlurModule"
        const val MODULE_NAME = "BackgroundBlurModule"

        const val EVENT_PROCESSOR_READY   = "onProcessorReady"
        const val EVENT_PROCESSOR_ERROR   = "onProcessorError"
        const val EVENT_PROCESSOR_STOPPED = "onProcessorStopped"

        const val MODE_BLUR    = "blur"
        const val MODE_VIRTUAL = "virtual"
        const val MODE_NONE    = "none"
    }

    // ── State ──────────────────────────────────────────────────────────────────

    private var processorThread: HandlerThread? = null
    private var processorHandler: Handler? = null
    private val isRunning = AtomicBoolean(false)

    private val segmenter = Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
            .enableRawSizeMask()
            .build()
    )

    private var currentMode   = MODE_NONE
    private var blurRadius    = 25f
    private var virtualBitmap: Bitmap? = null

    override fun getName() = MODULE_NAME

    // ── JS API ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startProcessor(mode: String, blurRadiusJs: Int, imagePath: String?, promise: Promise) {
        Log.d(TAG, "startProcessor mode=$mode blurRadius=$blurRadiusJs")

        if (mode == MODE_NONE) {
            stopProcessorInternal()
            promise.resolve(true)
            return
        }

        currentMode = mode
        blurRadius  = blurRadiusJs.coerceAtLeast(4).toFloat()

        if (mode == MODE_VIRTUAL && imagePath != null) {
            try {
                virtualBitmap = loadBitmap(imagePath)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load virtual background image", e)
                promise.reject("IMG_LOAD_FAIL", "Could not load image: ${e.message}")
                return
            }
        }

        if (!isRunning.get()) {
            processorThread = HandlerThread("LK-BG-Processor").also { it.start() }
            processorHandler = Handler(processorThread!!.looper)
            isRunning.set(true)
        }

        emitEvent(EVENT_PROCESSOR_READY, Arguments.createMap().apply {
            putString("mode", mode)
        })

        promise.resolve(true)
    }

    @ReactMethod
    fun switchMode(mode: String, blurRadiusJs: Int, imagePath: String?, promise: Promise) {
        Log.d(TAG, "switchMode mode=$mode")
        if (mode == MODE_NONE) {
            stopProcessorInternal()
            promise.resolve(true)
            return
        }
        currentMode = mode
        blurRadius  = blurRadiusJs.coerceAtLeast(4).toFloat()
        if (mode == MODE_VIRTUAL && imagePath != null) {
            try { virtualBitmap = loadBitmap(imagePath) } catch (_: Exception) {}
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun stopProcessor(promise: Promise) {
        stopProcessorInternal()
        promise.resolve(true)
    }

    @ReactMethod
    fun processFrame(base64Jpeg: String, promise: Promise) {
        if (!isRunning.get() || currentMode == MODE_NONE) {
            promise.resolve(base64Jpeg)
            return
        }

        processorHandler?.post {
            try {
                val bytes  = android.util.Base64.decode(base64Jpeg, android.util.Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: return@post promise.resolve(base64Jpeg)

                val image = InputImage.fromBitmap(bitmap, 0)
                segmenter.process(image)
                    .addOnSuccessListener { mask ->
                        val result = applyEffect(bitmap, mask)
                        val out = java.io.ByteArrayOutputStream()
                        result.compress(Bitmap.CompressFormat.JPEG, 90, out)
                        val encoded = android.util.Base64.encodeToString(
                            out.toByteArray(), android.util.Base64.DEFAULT
                        )
                        bitmap.recycle()
                        result.recycle()
                        promise.resolve(encoded)
                    }
                    .addOnFailureListener { e ->
                        Log.e(TAG, "MLKit segmentation failed", e)
                        promise.resolve(base64Jpeg)
                    }
            } catch (e: Exception) {
                Log.e(TAG, "processFrame error", e)
                promise.resolve(base64Jpeg)
            }
        } ?: promise.resolve(base64Jpeg)
    }

    // ── Effect compositing ─────────────────────────────────────────────────────

    private fun applyEffect(frame: Bitmap, mask: SegmentationMask): Bitmap {
        val w = frame.width
        val h = frame.height

        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)

        // 1. Draw background layer
        when (currentMode) {
            MODE_BLUR -> {
                // ✅ Pure Kotlin stack blur — no RenderScript / no deprecated APIs
                val blurred = stackBlur(frame, blurRadius.toInt().coerceIn(1, 25))
                canvas.drawBitmap(blurred, 0f, 0f, null)
                blurred.recycle()
            }
            MODE_VIRTUAL -> {
                val vbg = virtualBitmap
                if (vbg != null) {
                    val scaled = Bitmap.createScaledBitmap(vbg, w, h, true)
                    canvas.drawBitmap(scaled, 0f, 0f, null)
                    if (scaled !== vbg) scaled.recycle()
                } else {
                    canvas.drawColor(Color.BLACK)
                }
            }
            else -> canvas.drawColor(Color.BLACK)
        }

        // 2. Composite person on top using MLKit confidence mask
        val maskBuffer = mask.buffer   // FloatBuffer
        val maskW      = mask.width
        val maskH      = mask.height

        val pixels = IntArray(w * h)
        frame.getPixels(pixels, 0, w, 0, 0, w, h)

        val scaleX = maskW.toFloat() / w
        val scaleY = maskH.toFloat() / h

        for (y in 0 until h) {
            for (x in 0 until w) {
                val mx = (x * scaleX).toInt().coerceIn(0, maskW - 1)
                val my = (y * scaleY).toInt().coerceIn(0, maskH - 1)
                // FloatBuffer.get(index) — explicit positional read, no property ambiguity
                val confidence = maskBuffer.get(my * maskW + mx)
                val alpha      = (confidence * 255f).toInt().coerceIn(0, 255)
                val orig       = pixels[y * w + x]
                pixels[y * w + x] = Color.argb(
                    alpha,
                    Color.red(orig),
                    Color.green(orig),
                    Color.blue(orig)
                )
            }
        }
        maskBuffer.rewind()

        val personBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        personBitmap.setPixels(pixels, 0, w, 0, 0, w, h)
        canvas.drawBitmap(personBitmap, 0f, 0f, null)
        personBitmap.recycle()

        return result
    }

    // ── Pure-Kotlin Stack Blur ─────────────────────────────────────────────────
    //
    // Mario Klingemann's stack blur — works on all API levels, no deprecated APIs,
    // comparable quality to ScriptIntrinsicBlur at radius ≤ 25.

    private fun stackBlur(src: Bitmap, radius: Int): Bitmap {
        val r = radius.coerceAtLeast(1)
        val bitmap = src.copy(Bitmap.Config.ARGB_8888, true)
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        val div       = 2 * r + 1
        val tableSize = div * 256
        val divSum    = (r + 1) * (r + 1)
        val mulTable  = IntArray(tableSize) { it / divSum }

        // Horizontal pass
        for (y in 0 until h) {
            var rSum = 0; var gSum = 0; var bSum = 0
            var rOut = 0; var gOut = 0; var bOut = 0

            for (i in -r..r) {
                val p = pixels[y * w + min(max(i, 0), w - 1)]
                val weight = r + 1 - kotlin.math.abs(i)
                rSum += Color.red(p)   * weight
                gSum += Color.green(p) * weight
                bSum += Color.blue(p)  * weight
            }

            for (x in 0 until w) {
                pixels[y * w + x] = Color.rgb(
                    mulTable[min(rSum, tableSize - 1)],
                    mulTable[min(gSum, tableSize - 1)],
                    mulTable[min(bSum, tableSize - 1)]
                )
                val leftPx  = pixels[y * w + max(x - r, 0)]
                val rightPx = pixels[y * w + min(x + r + 1, w - 1)]
                rSum += Color.red(rightPx)   - Color.red(leftPx)
                gSum += Color.green(rightPx) - Color.green(leftPx)
                bSum += Color.blue(rightPx)  - Color.blue(leftPx)
            }
        }

        // Vertical pass
        for (x in 0 until w) {
            var rSum = 0; var gSum = 0; var bSum = 0

            for (i in -r..r) {
                val p = pixels[min(max(i, 0), h - 1) * w + x]
                val weight = r + 1 - kotlin.math.abs(i)
                rSum += Color.red(p)   * weight
                gSum += Color.green(p) * weight
                bSum += Color.blue(p)  * weight
            }

            for (y in 0 until h) {
                pixels[y * w + x] = Color.rgb(
                    mulTable[min(rSum, tableSize - 1)],
                    mulTable[min(gSum, tableSize - 1)],
                    mulTable[min(bSum, tableSize - 1)]
                )
                val topPx    = pixels[max(y - r, 0) * w + x]
                val bottomPx = pixels[min(y + r + 1, h - 1) * w + x]
                rSum += Color.red(bottomPx)   - Color.red(topPx)
                gSum += Color.green(bottomPx) - Color.green(topPx)
                bSum += Color.blue(bottomPx)  - Color.blue(topPx)
            }
        }

        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
        return bitmap
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun loadBitmap(path: String): Bitmap {
        return if (path.startsWith("http")) {
            val url = java.net.URL(path)
            BitmapFactory.decodeStream(url.openStream())
                ?: throw Exception("null bitmap from URL")
        } else {
            BitmapFactory.decodeFile(path)
                ?: throw Exception("null bitmap from file: $path")
        }
    }

    private fun stopProcessorInternal() {
        isRunning.set(false)
        processorThread?.quit()
        processorThread = null
        processorHandler = null
        currentMode = MODE_NONE
        emitEvent(EVENT_PROCESSOR_STOPPED, Arguments.createMap())
    }

    private fun emitEvent(name: String, params: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(
                com.facebook.react.modules.core.DeviceEventManagerModule
                    .RCTDeviceEventEmitter::class.java
            )
            .emit(name, params)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        stopProcessorInternal()
        segmenter.close()
        virtualBitmap?.recycle()
        virtualBitmap = null
    }
}