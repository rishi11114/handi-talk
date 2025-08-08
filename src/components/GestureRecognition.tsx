import React, { useState, useEffect } from 'react';
import { useHandGestureRecognition } from '@/hooks/useHandGestureRecognition';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { 
  Camera, 
  CameraOff, 
  Mic, 
  MicOff, 
  RotateCcw, 
  Volume2,
  Hand,
  Brain,
  Activity,
  Timer,
  Zap,
  Eye
} from 'lucide-react';

interface GestureRecognitionProps {
  modelPath?: string;
}

export const GestureRecognition: React.FC<GestureRecognitionProps> = ({
  modelPath = '/models/model.json'
}) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [gestureHistory, setGestureHistory] = useState<Array<{id: string, gesture: string, timestamp: number, confidence: number}>>([]);

  const {
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
    spaceGestureStartTime
  } = useHandGestureRecognition({
    modelPath,
    onGestureDetected: (result) => {
      handleGestureDetected(result);
    },
    predictionThreshold: 0.7,
    bufferSize: 5
  });

  const handleGestureDetected = (result: any) => {
    // Handle auto actions
    if (result.gesture === 'AUTO_SPEAK') {
      speakFullText();
      toast({
        title: "Auto Speech",
        description: "No gestures detected for 6 seconds - speaking text automatically",
      });
      return;
    }

    if (result.gesture === 'AUTO_CLEAR') {
      clearText();
      toast({
        title: "Auto Clear", 
        description: "Space gesture held for 5 seconds - text cleared automatically",
      });
      return;
    }

    const newGestureEntry = {
      id: Date.now().toString(),
      gesture: result.gesture,
      timestamp: Date.now(),
      confidence: result.confidence
    };

    setGestureHistory(prev => [newGestureEntry, ...prev.slice(0, 9)]);

    if (result.gesture === ' ') {
      setRecognizedText(prev => prev + ' ');
    } else if (result.gesture === 'Backspace') {
      setRecognizedText(prev => prev.slice(0, -1));
    } else if (result.gesture === 'next') {
      toast({
        title: "Command Detected",
        description: "Next gesture command recognized",
      });
    } else if (result.gesture && result.gesture !== 'UNCERTAIN' && result.gesture !== 'UNKNOWN') {
      setRecognizedText(prev => prev + result.gesture);
    }

    if (speechEnabled && result.gesture && result.gesture.length === 1) {
      speakText(result.gesture);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    }
  };

  const handleStartStop = async () => {
    if (isRecording) {
      stopRecognition();
      setIsRecording(false);
      toast({
        title: "Recognition Stopped",
        description: "Hand gesture recognition has been stopped",
      });
    } else {
      try {
        await startRecognition();
        setIsRecording(true);
        toast({
          title: "Recognition Started",
          description: "Hand gesture recognition is now active",
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to start camera or recognition",
          variant: "destructive"
        });
      }
    }
  };

  const clearText = () => {
    setRecognizedText('');
    setGestureHistory([]);
    toast({
      title: "Text Cleared",
      description: "Recognition text has been cleared",
    });
  };

  const speakFullText = () => {
    if (recognizedText.trim()) {
      speakText(recognizedText);
      toast({
        title: "Speaking Text",
        description: "Reading the recognized text aloud",
      });
    } else {
      toast({
        title: "No Text to Speak",
        description: "Please recognize some gestures first",
        variant: "destructive"
      });
    }
  };

  const getSpaceProgress = () => {
    if (!spaceGestureStartTime) return 0;
    const elapsed = Date.now() - spaceGestureStartTime;
    return Math.min((elapsed / 5000) * 100, 100);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (spaceGestureStartTime) {
      interval = setInterval(() => {
        // Force re-render to update progress
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [spaceGestureStartTime]);

  const formatConfidence = (confidence: number) => {
    return `${(confidence * 100).toFixed(0)}%`;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center p-4">
        <Alert className="max-w-md border-destructive">
          <AlertDescription className="text-center">
            <h3 className="font-semibold text-lg mb-2">Recognition Error</h3>
            <p className="text-sm">{error}</p>
            <Button 
              variant="destructive" 
              className="mt-4" 
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            AI Sign Language Recognition
          </h1>
          <p className="text-lg text-muted-foreground">
            Real-time hand gesture recognition powered by TensorFlow.js
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-ai-glow/20 bg-ai-surface/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-ai-glow" />
                  Camera Feed
                  {isModelLoaded && (
                    <Badge variant="secondary" className="ml-auto">
                      <Brain className="w-3 h-3 mr-1" />
                      Real AI Model
                    </Badge>
                  )}
                  {!isModelLoaded && (
                    <Badge variant="outline" className="ml-auto">
                      <Zap className="w-3 h-3 mr-1" />
                      Demo Mode
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-64 w-full" />
                    <div className="flex justify-center">
                      <Skeleton className="h-10 w-32" />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative bg-black rounded-lg overflow-hidden">
                      {/* Main video display - NOT MIRRORED for user viewing */}
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-64 object-cover"
                        style={{ display: stream ? 'block' : 'none' }}
                      />
                      
                      {/* Hidden canvas for processing - MIRRORED for correct model input */}
                      <canvas
                        ref={canvasRef}
                        width={640}
                        height={480}
                        className="hidden"
                      />
                      
                      {/* Overlay canvas for hand visualization - NOT MIRRORED */}
                      <canvas
                        ref={overlayCanvasRef}
                        width={640}
                        height={480}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                      />
                      
                      {!stream && (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <CameraOff className="w-12 h-12 mx-auto mb-2" />
                            <p>Camera not active</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Gesture Info Display */}
                    {currentGesture && isRecording && (
                      <div className="absolute top-4 left-4 bg-ai-primary/90 backdrop-blur rounded-lg p-3">
                        <div className="flex items-center gap-2 text-white">
                          <Hand className="w-4 h-4" />
                          <span className="font-bold text-lg">{currentGesture.gesture}</span>
                          <Badge variant="secondary" className="text-xs">
                            {formatConfidence(currentGesture.confidence)}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Space Gesture Timer */}
                    {spaceGestureStartTime && (
                      <div className="absolute top-4 right-4 bg-ai-warning/90 backdrop-blur rounded-lg p-3">
                        <div className="flex items-center gap-2 text-white">
                          <Timer className="w-4 h-4" />
                          <span className="text-sm font-medium">Auto-Clear</span>
                        </div>
                        <Progress value={getSpaceProgress()} className="mt-2 w-24" />
                        <p className="text-xs text-center mt-1">{(5 - (Date.now() - spaceGestureStartTime) / 1000).toFixed(1)}s</p>
                      </div>
                    )}

                    {/* Hand Detection Box Preview */}
                    <div className="absolute bottom-4 right-4">
                      <Card className="bg-background/80 backdrop-blur border-ai-glow/30">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Eye className="w-4 h-4 text-ai-glow" />
                            <span>Hand Detection Active</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    variant={isRecording ? "destructive" : "ai"}
                    size="lg"
                    onClick={handleStartStop}
                    disabled={isLoading}
                  >
                    {isRecording ? <CameraOff className="w-4 h-4 mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                    {isRecording ? 'Stop Recognition' : 'Start Recognition'}
                  </Button>
                  
                  <Button
                    variant={speechEnabled ? "glow" : "outline"}
                    size="lg"
                    onClick={() => setSpeechEnabled(!speechEnabled)}
                  >
                    {speechEnabled ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                    Speech {speechEnabled ? 'On' : 'Off'}
                  </Button>
                  
                  <Button variant="outline" size="lg" onClick={clearText}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                  
                  <Button 
                    variant="tech" 
                    size="lg" 
                    onClick={speakFullText}
                    disabled={!recognizedText.trim()}
                  >
                    <Volume2 className="w-4 h-4 mr-2" />
                    Speak Text
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Recognized Text */}
            <Card className="border-ai-glow/20">
              <CardHeader>
                <CardTitle className="text-lg">Recognized Text</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-h-24 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {recognizedText || (
                    <span className="text-muted-foreground italic">
                      Start recognition to see text here...
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {recognizedText.length} characters
                </div>
              </CardContent>
            </Card>

            {/* Gesture History */}
            <Card className="border-ai-glow/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Gestures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {gestureHistory.length === 0 ? (
                    <p className="text-muted-foreground text-sm italic text-center py-4">
                      No gestures detected yet
                    </p>
                  ) : (
                    gestureHistory.map((entry) => (
                      <div 
                        key={entry.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {entry.gesture === ' ' ? 'SPACE' : entry.gesture}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(entry.confidence)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Auto Features */}
            <Card className="border-ai-glow/20">
              <CardHeader>
                <CardTitle className="text-lg">Auto Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-ai-success/10 rounded-lg border border-ai-success/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Timer className="w-4 h-4 text-ai-success" />
                    <span className="text-sm font-medium">Auto-Clear</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hold space gesture for 5 seconds to auto-clear text
                  </p>
                </div>
                <div className="p-3 bg-ai-warning/10 rounded-lg border border-ai-warning/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Volume2 className="w-4 h-4 text-ai-warning" />
                    <span className="text-sm font-medium">Auto-Speak</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No gestures for 6 seconds triggers automatic speech
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card className="border-ai-glow/20">
              <CardHeader>
                <CardTitle className="text-lg">System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Model Status</span>
                  <Badge variant={isModelLoaded ? "default" : "secondary"}>
                    {isModelLoaded ? "Real AI" : "Demo Mode"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Camera</span>
                  <Badge variant={stream ? "default" : "secondary"}>
                    {stream ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Recognition</span>
                  <Badge variant={isRecording ? "default" : "secondary"}>
                    {isRecording ? "Running" : "Stopped"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Speech</span>
                  <Badge variant={speechEnabled ? "default" : "secondary"}>
                    {speechEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};