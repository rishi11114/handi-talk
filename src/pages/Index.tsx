import React, { Suspense } from 'react';
import { GestureRecognition } from '@/components/GestureRecognition';
import { LoadingScreen } from '@/components/LoadingScreen';

const Index = () => {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <GestureRecognition modelPath="/models/model.json" />
    </Suspense>
  );
};

export default Index;
