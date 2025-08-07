# TensorFlow.js Model Files

This directory should contain your converted TensorFlow.js model files:

- `model.json` - Model architecture and metadata
- `group1-shard1of2.bin` - Model weights (part 1)
- `group1-shard2of2.bin` - Model weights (part 2)

## Converting Your H5 Model

To convert your H5 model to TensorFlow.js format, use the tensorflowjs converter:

```bash
# Install the converter
pip install tensorflowjs

# Convert your H5 model
tensorflowjs_converter \
    --input_format=keras \
    --output_format=tfjs_layers_model \
    path/to/your/model.h5 \
    public/models/
```

## Model Structure

Based on your Python script, your model should:
- Accept input shape of [400, 400, 3] (400x400 RGB images)
- Output 8 classes representing different gestures
- Include the gesture classification logic you implemented

Replace the placeholder files with your actual converted model files.