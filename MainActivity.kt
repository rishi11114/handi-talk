package com.rishi.sign_to_speech

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.AssetFileDescriptor
import android.graphics.*
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.Surface
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import org.tensorflow.lite.Interpreter
import java.io.ByteArrayOutputStream
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.min

class MainActivity : ComponentActivity() {
    private lateinit var interpreter: Interpreter
    private lateinit var tts: TextToSpeech
    private var handLandmarker: HandLandmarker? = null
    private val executor = Executors.newSingleThreadExecutor()
    private val TAG = "SignToSpeech"
    private val predictionThreshold = 0.6f // tune if needed

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startCamera()
        } else {
            Log.w(TAG, "Camera permission denied")
            setContent { ErrorScreen("Camera permission required") }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            interpreter = Interpreter(loadModel("cnn_model.tflite"))
            initializeTTS()
            initializeHandLandmarker()
            requestCameraPermission()
        } catch (e: Exception) {
            Log.e(TAG, "Initialization failed: ${e.message}", e)
            setContent { ErrorScreen("Initialization failed: ${e.message}") }
        }
    }

    private fun initializeTTS() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts.language = Locale.US
                tts.setSpeechRate(0.95f)
            } else {
                Log.e(TAG, "TTS initialization failed: $status")
            }
        }
    }

    private fun initializeHandLandmarker() {
        try {
            val optionsBuilder = HandLandmarker.HandLandmarkerOptions.builder()
                .setNumHands(1)
                .setMinHandDetectionConfidence(0.7f)
                .setMinHandPresenceConfidence(0.7f)
                .setMinTrackingConfidence(0.7f)
            // If you need to set BaseOptions->model asset path, set here.
            handLandmarker = HandLandmarker.createFromOptions(this, optionsBuilder.build())
        } catch (e: Exception) {
            Log.w(TAG, "HandLandmarker init skipped or failed: ${e.message}")
            handLandmarker = null
        }
    }

    private fun requestCameraPermission() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                startCamera()
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    private fun startCamera() {
        setContent {
            SignToSpeechApp(
                interpreter = interpreter,
                lifecycleOwner = this,
                tts = tts,
                handLandmarker = handLandmarker,
                executor = executor,
                TAG = TAG,
                predictionThreshold = predictionThreshold
            )
        }
    }

    private fun loadModel(fileName: String): MappedByteBuffer {
        val fd: AssetFileDescriptor = assets.openFd(fileName)
        val input = FileInputStream(fd.fileDescriptor)
        val channel = input.channel
        return channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
            .also { input.close() }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { tts.shutdown() } catch (_: Exception) {}
        try { interpreter.close() } catch (_: Exception) {}
        try { handLandmarker?.close() } catch (_: Exception) {}
        try { executor.shutdown() } catch (_: Exception) {}
    }
}

@Composable
fun ErrorScreen(message: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Red.copy(alpha = 0.1f))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Error",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Red,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            fontSize = 16.sp,
            color = Color.Red,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { /* You can add retry logic here if needed */ },
            colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
        ) {
            Text("Retry", color = Color.White)
        }
    }
}

@Composable
fun SignToSpeechApp(
    interpreter: Interpreter,
    lifecycleOwner: LifecycleOwner,
    tts: TextToSpeech,
    handLandmarker: HandLandmarker?,
    executor: java.util.concurrent.Executor,
    TAG: String,
    predictionThreshold: Float
) {
    var currentLetter by remember { mutableStateOf("...") }
    var sentence by remember { mutableStateOf("") }
    var confidence by remember { mutableStateOf(0f) }
    var firstLetter by remember { mutableStateOf<Char?>(null) }
    val predictionBuffer = remember { mutableStateListOf<Pair<String, Float>>() }
    val overlayPoints = remember { mutableStateListOf<Offset>() }

    // suggestion words (update when firstLetter changes)
    val suggestions = remember(firstLetter) {
        if (firstLetter != null) generateWordSuggestionsForLetter(firstLetter!!) else emptyList()
    }

    Column(modifier = Modifier.fillMaxSize().padding(8.dp)) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            CameraPreviewWithAnalyzer(
                modifier = Modifier.fillMaxSize(),
                lifecycleOwner = lifecycleOwner,
                interpreter = interpreter,
                handLandmarker = handLandmarker,
                executor = executor,
                TAG = TAG,
                predictionThreshold = predictionThreshold,
                overlayPoints = overlayPoints,
                onPrediction = { letter, conf ->
                    // smoothing buffer logic
                    if (predictionBuffer.size < 5) {
                        predictionBuffer.add(letter to conf)
                    } else {
                        val best = predictionBuffer.maxByOrNull { it.second }
                        predictionBuffer.clear()
                        best?.let {
                            if (it.second >= predictionThreshold) {
                                currentLetter = it.first
                                confidence = it.second
                                when {
                                    it.first == "DEL" && sentence.isNotEmpty() -> sentence = sentence.dropLast(1)
                                    it.first == "SPACE" -> sentence += " "
                                    it.first.length == 1 -> {
                                        sentence += it.first
                                        if (firstLetter == null && it.first[0].isLetter()) {
                                            firstLetter = it.first[0].uppercaseChar()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            )

            // overlay for skeleton points
            HandLandmarkOverlay(overlayPoints = overlayPoints)
        }

        // Prediction + controls
        PredictionDisplay(
            currentLetter = currentLetter,
            confidence = confidence,
            sentence = sentence,
            suggestions = suggestions,
            onSpeak = { text -> if (text.isNotBlank()) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tts1") },
            onUseSuggestion = { chosen -> sentence = chosen },
            onClearAll = {
                sentence = ""
                firstLetter = null
            }
        )
    }
}

@Composable
fun CameraPreviewWithAnalyzer(
    modifier: Modifier = Modifier,
    lifecycleOwner: LifecycleOwner,
    interpreter: Interpreter,
    handLandmarker: HandLandmarker?,
    executor: java.util.concurrent.Executor,
    TAG: String,
    predictionThreshold: Float,
    overlayPoints: MutableList<Offset>,
    onPrediction: (String, Float) -> Unit
) {
    val context = LocalContext.current
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx)

            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val previewUseCase = Preview.Builder()
                    .setTargetRotation(Surface.ROTATION_90)
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }

                val analyzer = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .build()
                    .also { ia ->
                        ia.setAnalyzer(executor) { imageProxy ->
                            try {
                                // convert frame to Bitmap
                                val bmp = imageProxy.toBitmap() ?: run { imageProxy.close(); return@setAnalyzer }
                                // optional: run mediapipe landmarks
                                overlayPoints.clear()
                                if (handLandmarker != null) {
                                    try {
                                        val mpImage = BitmapImageBuilder(bmp).build()
                                        val result = handLandmarker.detect(mpImage)
                                        if (result.landmarks().isNotEmpty()) {
                                            val landmarks = result.landmarks()[0]
                                            val w = bmp.width.toFloat()
                                            val h = bmp.height.toFloat()
                                            val xMin = landmarks.minOf { it.x() * w }
                                            val xMax = landmarks.maxOf { it.x() * w }
                                            val yMin = landmarks.minOf { it.y() * h }
                                            val yMax = landmarks.maxOf { it.y() * h }
                                            val handWidth = xMax - xMin
                                            val handHeight = yMax - yMin
                                            val scaleFactor = min(w / 224f, h / 224f) * min(handWidth / w, handHeight / h)
                                            landmarks.forEach { lm ->
                                                val x = (lm.x() * w - xMin) * scaleFactor
                                                val y = (lm.y() * h - yMin) * scaleFactor
                                                overlayPoints.add(Offset(x, y))
                                            }
                                        }
                                    } catch (e: Exception) {
                                        Log.w(TAG, "Mediapipe detect error: ${e.message}")
                                    }
                                }

                                // prepare input and run interpreter
                                val input = prepareInput(bmp) // [1][224][224][3]
                                val output = Array(1) { FloatArray(26) } // assuming 26 classes A-Z
                                try {
                                    interpreter.run(input, output)
                                    // find best index
                                    output[0].withIndex().maxByOrNull { it.value }?.let { best ->
                                        val conf = best.value
                                        val idx = best.index
                                        if (conf >= 0f) { // we let thresholding happen in parent smoothing
                                            val predictedChar = if (idx < 26) ('A' + idx).toString() else "?"
                                            onPrediction(predictedChar, conf)
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "Interpreter run failed: ${e.message}", e)
                                }
                            } finally {
                                imageProxy.close()
                            }
                        }
                    }

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_FRONT_CAMERA,
                        previewUseCase,
                        analyzer
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Camera bind failed: ${e.message}", e)
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        }
    )
}

@Composable
fun PredictionDisplay(
    currentLetter: String,
    confidence: Float,
    sentence: String,
    suggestions: List<String>,
    onSpeak: (String) -> Unit,
    onUseSuggestion: (String) -> Unit,
    onClearAll: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
        Text(text = "Gesture: $currentLetter (${(confidence * 100).toInt()}%)", fontSize = 20.sp)
        Spacer(modifier = Modifier.height(6.dp))
        Text(text = "Sentence: $sentence", fontSize = 18.sp)
        Spacer(modifier = Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            Button(onClick = { onSpeak(sentence) }) { Text("Speak") }
            Button(onClick = { onClearAll() }) { Text("Clear") }
        }

        Spacer(modifier = Modifier.height(10.dp))

        if (suggestions.isNotEmpty()) {
            Text(text = "Suggestions:", fontSize = 16.sp)
            LazyRow(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                items(suggestions) { s ->
                    Card(modifier = Modifier.padding(6.dp)) {
                        TextButton(onClick = { onUseSuggestion(s) }) {
                            Text(s)
                        }
                    }
                }
            }
        } else {
            Text(text = "Make the first gesture to see suggestions.", fontSize = 14.sp, color = Color.Gray)
        }
    }
}

@Composable
fun HandLandmarkOverlay(overlayPoints: List<Offset>) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        // simple skeleton draw: lines connecting sequential points if available
        if (overlayPoints.size >= 2) {
            for (i in 0 until overlayPoints.size - 1) {
                val s = overlayPoints[i]
                val e = overlayPoints[i + 1]
                drawLine(color = Color.Green, start = s, end = e, strokeWidth = 4f)
            }
        }
        overlayPoints.forEach { p ->
            drawCircle(color = Color.Red, radius = 6f, center = p)
        }
    }
}

/* Helpers */

fun ImageProxy.toBitmap(): Bitmap? {
    return try {
        val planeY = planes[0].buffer ?: return null
        val planeU = planes[1].buffer ?: return null
        val planeV = planes[2].buffer ?: return null

        val ySize = planeY.remaining()
        val uSize = planeU.remaining()
        val vSize = planeV.remaining()

        val nv21 = ByteArray(ySize + uSize + vSize)
        planeY.get(nv21, 0, ySize)
        planeV.get(nv21, ySize, vSize)
        planeU.get(nv21, ySize + vSize, uSize)

        val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(Rect(0, 0, width, height), 90, out)
        val bytes = out.toByteArray()
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val matrix = Matrix().apply { postRotate(imageInfo.rotationDegrees.toFloat()) }
        Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
    } catch (e: Exception) {
        Log.e("SignToSpeech", "Bitmap conversion error: ${e.message}", e)
        null
    }
}

/**
 * Prepare input for model: returns Array(1)[224][224][3] floats scaled [0..1]
 * Adjust if your model expects different normalization.
 */
fun prepareInput(bitmap: Bitmap): Array<Array<Array<FloatArray>>> {
    val resized = Bitmap.createScaledBitmap(bitmap, 224, 224, true)
    val inputArray = Array(1) { Array(224) { Array(224) { FloatArray(3) } } }
    for (y in 0 until 224) {
        for (x in 0 until 224) {
            val px = resized.getPixel(x, y)
            inputArray[0][y][x][0] = android.graphics.Color.red(px) / 255f
            inputArray[0][y][x][1] = android.graphics.Color.green(px) / 255f
            inputArray[0][y][x][2] = android.graphics.Color.blue(px) / 255f
        }
    }
    return inputArray
}

/**
 * Word suggestions DB — returns up to 4 words starting with letter.
 * Expand DB for better UX. Lowercase words are displayed as-is.
 */
fun generateWordSuggestionsForLetter(letter: Char): List<String> {
    val db = listOf(
        "hello", "hi", "how", "hey", "house", "help", "happy", "have",
        "good", "great", "go", "game", "give", "girl",
        "yes", "you", "yesterday", "yell",
        "no", "note", "now", "nice",
        "please", "project", "put", "play",
        "thanks", "thankyou", "today", "tomorrow"
    )
    return db.filter { it.startsWith(letter.toString(), ignoreCase = true) }.take(4)
}