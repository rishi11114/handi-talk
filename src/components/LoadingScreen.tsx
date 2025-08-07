import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Camera, Activity } from 'lucide-react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-surface flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-ai-glow/20 bg-ai-surface/50 backdrop-blur">
        <CardContent className="p-8 text-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-primary flex items-center justify-center shadow-glow">
              <Brain className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div className="absolute -inset-2 rounded-full border-2 border-ai-glow/30 animate-spin" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Initializing AI Recognition
            </h2>
            <p className="text-muted-foreground">
              Loading TensorFlow.js model and camera systems...
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Brain className="w-5 h-5 text-ai-glow" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Loading AI Model</p>
                <Skeleton className="h-2 w-full mt-1" />
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Camera className="w-5 h-5 text-ai-accent" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Initializing Camera</p>
                <Skeleton className="h-2 w-3/4 mt-1" />
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <Activity className="w-5 h-5 text-ai-warning" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Preparing Hand Detection</p>
                <Skeleton className="h-2 w-2/3 mt-1" />
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            This may take a few moments on first load...
          </div>
        </CardContent>
      </Card>
    </div>
  );
};