import { useRef, useCallback, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';

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
  const predictionBufferRef = useRef<string[]>([]);
  const lastPredictionTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  
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
      
      console.log('Attempting to load model from:', modelPath);
      
      // Check if model files exist first
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`Model file not found at ${modelPath}. Please ensure you have:\n1. model.json\n2. group1-shard1of2.bin\n3. group1-shard2of2.bin\n\nPlace these files in the /public/models/ directory.`);
      }
      
      // Load model from public directory
      const model = await tf.loadLayersModel(modelPath);
      modelRef.current = model;
      setIsModelLoaded(true);
      
      console.log('✅ Model loaded successfully:', model);
      console.log('Model input shape:', model.inputs[0].shape);
      console.log('Model output shape:', model.outputs[0].shape);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model';
      setError(errorMessage);
      console.error('❌ Error loading model:', err);
    } finally {
      setIsLoading(false);
    }
  }, [modelPath]);

  // Simple demo gesture detection (works without real model)
  const simulateGestureDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    ctx.save();
    ctx.scale(-1, 1); // Mirror the video
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Simulate gesture detection every 2 seconds
    const currentTime = Date.now();
    if (currentTime - lastPredictionTimeRef.current > 2000) {
      lastPredictionTimeRef.current = currentTime;
      
      // Simulate random gesture detection
      const gestures = ['A', 'B', 'C', 'G', 'L', 'P', 'X', 'Y', ' '];
      const randomGesture = gestures[Math.floor(Math.random() * gestures.length)];
      const confidence = 0.8 + Math.random() * 0.2; // 80-100% confidence
      
      const result: GestureResult = {
        gesture: randomGesture,
        confidence,
        landmarks: []
      };
      
      setCurrentGesture(result);
      onGestureDetected?.(result);
      
      console.log('🤖 Demo gesture detected:', randomGesture, `(${(confidence * 100).toFixed(0)}%)`);
    }
    
    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(simulateGestureDetection);
  }, [stream, onGestureDetected]);

  // Real model prediction (when model is loaded)
  const realGestureDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !modelRef.current || !stream) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    try {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame (mirrored)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
      
      // Process frame for model prediction
      const currentTime = Date.now();
      if (currentTime - lastPredictionTimeRef.current > 500) { // Predict every 500ms
        lastPredictionTimeRef.current = currentTime;
        
        // Create tensor from video frame
        const tensor = tf.browser.fromPixels(canvas)
          .resizeNearestNeighbor([400, 400]) // Resize to model input size
          .expandDims(0)
          .div(255.0); // Normalize
        
        // Make prediction
        try {
          const prediction = modelRef.current.predict(tensor) as tf.Tensor;
          const probabilities = await prediction.data();
          const maxIndex = Array.from(probabilities).indexOf(Math.max(...probabilities));
          const confidence = probabilities[maxIndex];
          
          if (confidence > predictionThreshold) {
            const gesture = GESTURE_MAPPING[maxIndex] || 'UNKNOWN';
            
            const result: GestureResult = {
              gesture,
              confidence,
              landmarks: []
            };
            
            setCurrentGesture(result);
            onGestureDetected?.(result);
            
            console.log('🧠 Real model prediction:', gesture, `(${(confidence * 100).toFixed(0)}%)`);
          }
          
          // Clean up tensors
          tensor.dispose();
          prediction.dispose();
        } catch (err) {
          console.error('Prediction error:', err);
          tensor.dispose();
        }
      }
      
    } catch (err) {
      console.error('Detection error:', err);
    }
    
    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(() => realGestureDetection());
  }, [stream, onGestureDetected, predictionThreshold]);

  // Start camera and processing
  const startRecognition = useCallback(async () => {
    try {
      setError(null);
      
      // Get camera stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 640, 
          height: 480, 
          facingMode: 'user' // Front camera
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Start detection loop once video is ready
        videoRef.current.onloadedmetadata = () => {
          if (canvasRef.current) {
            canvasRef.current.width = 640;
            canvasRef.current.height = 480;
          }
          
          // Use real model detection if available, otherwise demo mode
          if (isModelLoaded && modelRef.current) {
            console.log('🧠 Starting real model detection');
            realGestureDetection();
          } else {
            console.log('🤖 Starting demo mode (no model loaded)');
            simulateGestureDetection();
          }
        };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start camera';
      setError(errorMessage);
      console.error('Camera error:', err);
    }
  }, [isModelLoaded, realGestureDetection, simulateGestureDetection]);

  // Stop recognition and cleanup
  const stopRecognition = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    predictionBufferRef.current = [];
    setCurrentGesture(null);
  }, [stream]);

  // Initialize on mount
  useEffect(() => {
    loadModel();
    
    return () => {
      stopRecognition();
    };
  }, [loadModel, stopRecognition]);

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