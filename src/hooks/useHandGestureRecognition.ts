import { useRef, useCallback, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

interface GestureResult {
  gesture: string;
  confidence: number;
  landmarks?: number[][];
}

interface UseHandGestureRecognitionProps {
  modelPath: string;
  onGestureDetected?: (result: GestureResult) => void;
  predictionThreshold?: number;
  bufferSize?: number;
}

export const useHandGestureRecognition = ({
  modelPath,
  onGestureDetected,
  predictionThreshold = 0.7,
  bufferSize = 5
}: UseHandGestureRecognitionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const predictionBufferRef = useRef<string[]>([]);
  const lastPredictionTimeRef = useRef<number>(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<GestureResult | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Gesture mapping based on your Python script
  const GESTURE_MAPPING: { [key: number]: string } = {
    0: 'S', 1: 'B', 2: 'C', 3: 'G', 4: 'L', 5: 'P', 6: 'X', 7: 'Y'
  };

  // Load TensorFlow.js model
  const loadModel = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load model from public directory
      const model = await tf.loadLayersModel(modelPath);
      modelRef.current = model;
      setIsModelLoaded(true);
      
      console.log('Model loaded successfully:', model);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
      setError(errorMessage);
      console.error('Error loading model:', err);
    } finally {
      setIsLoading(false);
    }
  }, [modelPath]);

  // Initialize MediaPipe Hands
  const initializeHands = useCallback(() => {
    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);
    handsRef.current = hands;
  }, []);

  // Process hand landmarks and make predictions
  const onResults = useCallback((results: Results) => {
    if (!modelRef.current || !canvasRef.current || !results.multiHandLandmarks?.[0]) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw hand landmarks
    const landmarks = results.multiHandLandmarks[0];
    drawHandLandmarks(ctx, landmarks, canvas.width, canvas.height);

    // Convert landmarks to model input format (similar to your Python script)
    const modelInput = processLandmarksForModel(landmarks);
    
    // Make prediction
    makePrediction(modelInput, landmarks);
  }, []);

  // Draw hand landmarks on canvas
  const drawHandLandmarks = (
    ctx: CanvasRenderingContext2D, 
    landmarks: any[], 
    width: number, 
    height: number
  ) => {
    // Draw connections between landmarks (similar to your Python script)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    
    // Define hand connections based on MediaPipe hand model
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [5, 9], [9, 10], [10, 11], [11, 12], // middle
      [9, 13], [13, 14], [14, 15], [15, 16], // ring
      [13, 17], [17, 18], [18, 19], [19, 20], // pinky
      [0, 17] // palm
    ];

    // Draw connections
    connections.forEach(([start, end]) => {
      if (landmarks[start] && landmarks[end]) {
        ctx.beginPath();
        ctx.moveTo(landmarks[start].x * width, landmarks[start].y * height);
        ctx.lineTo(landmarks[end].x * width, landmarks[end].y * height);
        ctx.stroke();
      }
    });

    // Draw landmark points
    ctx.fillStyle = '#ff0000';
    landmarks.forEach((landmark) => {
      ctx.beginPath();
      ctx.arc(landmark.x * width, landmark.y * height, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // Process landmarks for model input (convert to format similar to your script)
  const processLandmarksForModel = (landmarks: any[]) => {
    // Create a 400x400 white image and draw landmarks
    const size = 400;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) return null;

    // Fill with white background
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, size, size);

    // Draw landmarks scaled to 400x400
    drawHandLandmarks(tempCtx, landmarks, size, size);

    // Get image data and convert to tensor
    const imageData = tempCtx.getImageData(0, 0, size, size);
    const tensor = tf.browser.fromPixels(imageData)
      .expandDims(0)
      .div(255.0); // Normalize to [0, 1]

    return tensor;
  };

  // Make prediction using the loaded model
  const makePrediction = async (modelInput: tf.Tensor | null, landmarks: any[]) => {
    if (!modelInput || !modelRef.current) return;

    try {
      const currentTime = Date.now();
      
      // Throttle predictions to avoid overwhelming the system
      if (currentTime - lastPredictionTimeRef.current < 200) {
        modelInput.dispose();
        return;
      }
      
      lastPredictionTimeRef.current = currentTime;

      // Make prediction
      const prediction = await modelRef.current.predict(modelInput) as tf.Tensor;
      const probabilities = await prediction.data();
      const maxIndex = probabilities.indexOf(Math.max(...probabilities));
      const confidence = probabilities[maxIndex];

      // Apply your gesture classification logic from the Python script
      let gesture = classifyGesture(maxIndex, landmarks, confidence);

      // Add to prediction buffer for stability
      predictionBufferRef.current.push(gesture);
      if (predictionBufferRef.current.length > bufferSize) {
        predictionBufferRef.current.shift();
      }

      // Check if buffer has consistent predictions
      const consistentGesture = getConsistentPrediction();
      
      if (consistentGesture && confidence > predictionThreshold) {
        const result: GestureResult = {
          gesture: consistentGesture,
          confidence,
          landmarks: landmarks.map(l => [l.x, l.y, l.z])
        };
        
        setCurrentGesture(result);
        onGestureDetected?.(result);
      }

      // Clean up tensors
      prediction.dispose();
      modelInput.dispose();
    } catch (err) {
      console.error('Prediction error:', err);
      modelInput.dispose();
    }
  };

  // Apply gesture classification logic from your Python script
  const classifyGesture = (prediction: number, landmarks: any[], confidence: number): string => {
    // This is a simplified version of your complex gesture classification
    // You'll need to adapt the full logic from your Python script
    
    if (confidence < predictionThreshold) return 'UNCERTAIN';
    
    // Basic mapping - extend this with your full classification logic
    let gesture = GESTURE_MAPPING[prediction] || 'UNKNOWN';
    
    // Apply some of your landmark-based refinements
    if (gesture === 'S') {
      // Check for specific hand positions to distinguish between S, A, T, E, M, N
      const thumb = landmarks[4];
      const fingers = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
      
      // Example: if thumb is below fingers, it might be 'A'
      if (thumb.x < fingers[0].x && thumb.x < fingers[1].x) {
        gesture = 'A';
      }
    }
    
    // Add space gesture detection
    if (prediction === 1 && 
        landmarks[6].y > landmarks[8].y && 
        landmarks[10].y < landmarks[12].y && 
        landmarks[14].y < landmarks[16].y && 
        landmarks[18].y > landmarks[20].y) {
      gesture = ' ';
    }

    return gesture;
  };

  // Get consistent prediction from buffer
  const getConsistentPrediction = (): string | null => {
    if (predictionBufferRef.current.length < bufferSize) return null;
    
    const mostCommon = predictionBufferRef.current.reduce((acc, gesture) => {
      acc[gesture] = (acc[gesture] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const sortedGestures = Object.entries(mostCommon).sort(([,a], [,b]) => b - a);
    const [topGesture, count] = sortedGestures[0];
    
    // Require majority consensus
    return count >= Math.ceil(bufferSize * 0.6) ? topGesture : null;
  };

  // Start camera and processing
  const startRecognition = useCallback(async () => {
    try {
      setError(null);
      
      // Get camera stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Initialize camera for MediaPipe
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
        
        cameraRef.current = camera;
        camera.start();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start camera';
      setError(errorMessage);
      console.error('Camera error:', err);
    }
  }, []);

  // Stop recognition and cleanup
  const stopRecognition = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    
    predictionBufferRef.current = [];
    setCurrentGesture(null);
  }, [stream]);

  // Initialize on mount
  useEffect(() => {
    initializeHands();
    loadModel();
    
    return () => {
      stopRecognition();
    };
  }, [initializeHands, loadModel, stopRecognition]);

  return {
    videoRef,
    canvasRef,
    startRecognition,
    stopRecognition,
    isLoading,
    isModelLoaded,
    error,
    currentGesture,
    stream
  };
};