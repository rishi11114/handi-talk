import { useRef, useCallback, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';

interface GestureResult {
  gesture: string;
  confidence: number;
  landmarks?: number[][];
  bbox?: { x: number; y: number; width: number; height: number };
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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const predictionBufferRef = useRef<string[]>([]);
  const lastPredictionTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<GestureResult | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [lastDetectionTime, setLastDetectionTime] = useState<number>(Date.now());
  const [spaceGestureStartTime, setSpaceGestureStartTime] = useState<number | null>(null);

  const GESTURE_MAPPING: { [key: number]: string } = {
    0: 'S', 1: 'B', 2: 'C', 3: 'G', 4: 'L', 5: 'P', 6: 'X', 7: 'Y'
  };

  // Auto-clear and auto-speak timers
  const autoSpeakTimerRef = useRef<NodeJS.Timeout>();
  const autoClearTimerRef = useRef<NodeJS.Timeout>();

  const loadModel = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Attempting to load model from:', modelPath);

      // Check if model file exists first
      const response = await fetch(modelPath);
      if (!response.ok) {
        console.warn('Model file not found, using demo mode');
        setIsModelLoaded(false);
        setIsLoading(false);
        return;
      }

      const model = await tf.loadLayersModel(modelPath);
      modelRef.current = model;
      setIsModelLoaded(true);

      console.log('✅ Model loaded successfully');
    } catch (err) {
      console.warn('Model loading failed, using demo mode:', err);
      setIsModelLoaded(false);
    } finally {
      setIsLoading(false);
    }
  }, [modelPath]);

  const checkAutoActions = useCallback((currentTime: number) => {
    // Auto-speak if no detection for 6 seconds
    if (currentTime - lastDetectionTime > 6000) {
      if (autoSpeakTimerRef.current) {
        clearTimeout(autoSpeakTimerRef.current);
      }
      autoSpeakTimerRef.current = setTimeout(() => {
        onGestureDetected?.({ gesture: 'AUTO_SPEAK', confidence: 1.0 });
      }, 100);
      setLastDetectionTime(currentTime); // Reset to prevent repeated triggers
    }

    // Auto-clear if space gesture held for 5 seconds
    if (spaceGestureStartTime && currentTime - spaceGestureStartTime > 5000) {
      if (autoClearTimerRef.current) {
        clearTimeout(autoClearTimerRef.current);
      }
      autoClearTimerRef.current = setTimeout(() => {
        onGestureDetected?.({ gesture: 'AUTO_CLEAR', confidence: 1.0 });
        setSpaceGestureStartTime(null);
      }, 100);
    }
  }, [lastDetectionTime, spaceGestureStartTime, onGestureDetected]);

  const drawHandVisualization = useCallback((bbox: any, gesture: string, confidence: number) => {
    if (!overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (bbox) {
      // Draw bounding box
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 3;
      ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

      // Draw gesture label
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 20px Arial';
      const text = `${gesture} (${(confidence * 100).toFixed(0)}%)`;
      const textMetrics = ctx.measureText(text);
      
      // Background for text
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bbox.x, bbox.y - 35, textMetrics.width + 20, 30);
      
      // Text
      ctx.fillStyle = '#00ff88';
      ctx.fillText(text, bbox.x + 10, bbox.y - 10);

      // Draw corner indicators
      const cornerSize = 20;
      ctx.strokeStyle = '#ff4488';
      ctx.lineWidth = 4;
      
      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(bbox.x, bbox.y + cornerSize);
      ctx.lineTo(bbox.x, bbox.y);
      ctx.lineTo(bbox.x + cornerSize, bbox.y);
      ctx.stroke();
      
      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(bbox.x + bbox.width - cornerSize, bbox.y);
      ctx.lineTo(bbox.x + bbox.width, bbox.y);
      ctx.lineTo(bbox.x + bbox.width, bbox.y + cornerSize);
      ctx.stroke();
      
      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(bbox.x, bbox.y + bbox.height - cornerSize);
      ctx.lineTo(bbox.x, bbox.y + bbox.height);
      ctx.lineTo(bbox.x + cornerSize, bbox.y + bbox.height);
      ctx.stroke();
      
      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(bbox.x + bbox.width - cornerSize, bbox.y + bbox.height);
      ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height);
      ctx.lineTo(bbox.x + bbox.width, bbox.y + bbox.height - cornerSize);
      ctx.stroke();
    }
  }, []);

  const simulateGestureDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw mirrored video for processing (but not displayed)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    const currentTime = Date.now();
    if (currentTime - lastPredictionTimeRef.current > 2000) {
      lastPredictionTimeRef.current = currentTime;
      setLastDetectionTime(currentTime);

      const gestures = ['A', 'B', 'C', 'G', 'L', 'P', 'X', 'Y', ' '];
      const randomGesture = gestures[Math.floor(Math.random() * gestures.length)];
      const confidence = 0.8 + Math.random() * 0.2;

      // Simulate hand detection area
      const bbox = {
        x: 150 + Math.random() * 300,
        y: 100 + Math.random() * 200,
        width: 100 + Math.random() * 50,
        height: 120 + Math.random() * 60
      };

      const result: GestureResult = {
        gesture: randomGesture,
        confidence,
        landmarks: [],
        bbox
      };

      setCurrentGesture(result);
      
      // Handle space gesture timing
      if (randomGesture === ' ') {
        if (!spaceGestureStartTime) {
          setSpaceGestureStartTime(currentTime);
        }
      } else {
        setSpaceGestureStartTime(null);
      }

      // Draw hand visualization
      drawHandVisualization(bbox, randomGesture, confidence);

      onGestureDetected?.(result);
      console.log('🤖 Simulated gesture:', randomGesture, `(${(confidence * 100).toFixed(0)}%)`);
    }

    // Check for auto-actions
    checkAutoActions(currentTime);

    animationFrameRef.current = requestAnimationFrame(simulateGestureDetection);
  }, [stream, onGestureDetected, spaceGestureStartTime, checkAutoActions, drawHandVisualization]);

  const realGestureDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !modelRef.current || !stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Draw mirrored video for processing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      const currentTime = Date.now();
      if (currentTime - lastPredictionTimeRef.current > 500) {
        lastPredictionTimeRef.current = currentTime;

        const tensor = tf.browser.fromPixels(canvas)
          .resizeNearestNeighbor([400, 400])
          .expandDims(0)
          .div(255.0);

        try {
          const prediction = modelRef.current.predict(tensor) as tf.Tensor;
          const probabilities = await prediction.data();
          const maxIndex = Array.from(probabilities).indexOf(Math.max(...probabilities));
          const confidence = probabilities[maxIndex];

          if (confidence > predictionThreshold) {
            const gesture = GESTURE_MAPPING[maxIndex] || 'UNKNOWN';
            setLastDetectionTime(currentTime);

            // Simulate hand detection area for real model
            const bbox = {
              x: 200 + Math.random() * 200,
              y: 120 + Math.random() * 160,
              width: 120,
              height: 140
            };

            const result: GestureResult = {
              gesture,
              confidence,
              landmarks: [],
              bbox
            };

            setCurrentGesture(result);
            
            // Handle space gesture timing
            if (gesture === ' ') {
              if (!spaceGestureStartTime) {
                setSpaceGestureStartTime(currentTime);
              }
            } else {
              setSpaceGestureStartTime(null);
            }

            // Draw hand visualization
            drawHandVisualization(bbox, gesture, confidence);

            onGestureDetected?.(result);
            console.log('🧠 Predicted:', gesture, `(${(confidence * 100).toFixed(0)}%)`);
          }

          tensor.dispose();
          prediction.dispose();
        } catch (err) {
          console.error('Prediction error:', err);
          tensor.dispose();
        }
      }

      // Check for auto-actions
      checkAutoActions(currentTime);
    } catch (err) {
      console.error('Detection error:', err);
    }

    animationFrameRef.current = requestAnimationFrame(() => realGestureDetection());
  }, [stream, onGestureDetected, predictionThreshold, spaceGestureStartTime, lastDetectionTime, checkAutoActions, drawHandVisualization]);

  const startRecognition = useCallback(async () => {
    try {
      setError(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;

        videoRef.current.onloadedmetadata = async () => {
          if (canvasRef.current && overlayCanvasRef.current) {
            canvasRef.current.width = 640;
            canvasRef.current.height = 480;
            overlayCanvasRef.current.width = 640;
            overlayCanvasRef.current.height = 480;
          }

          try {
            if (videoRef.current?.srcObject) {
              await videoRef.current.play();
              console.log('📷 Video started successfully');

              if (isModelLoaded && modelRef.current) {
                console.log('🧠 Starting real AI model detection');
                realGestureDetection();
              } else {
                console.log('🤖 Starting demo mode with simulated gestures');
                simulateGestureDetection();
              }
            }
          } catch (playError) {
            console.error('Video play error:', playError);
            setError('Failed to start video. Please check camera permissions.');
          }
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMessage);
      console.error('Camera error:', err);
    }
  }, [isModelLoaded, realGestureDetection, simulateGestureDetection]);

  const stopRecognition = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (autoSpeakTimerRef.current) {
      clearTimeout(autoSpeakTimerRef.current);
    }
    
    if (autoClearTimerRef.current) {
      clearTimeout(autoClearTimerRef.current);
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }

    predictionBufferRef.current = [];
    setCurrentGesture(null);
    setSpaceGestureStartTime(null);
    setError(null);

    // Clear overlay canvas
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    }
  }, [stream]);

  useEffect(() => {
    loadModel();
    return () => stopRecognition();
  }, [loadModel, stopRecognition]);

  return {
    videoRef,
    canvasRef,
    overlayCanvasRef,
    startRecognition,
    stopRecognition,
    isLoading,
    isModelLoaded,
    error,
    currentGesture,
    stream,
    lastDetectionTime,
    spaceGestureStartTime
  };
};