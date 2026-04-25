# fast-phase-vocoder

A pure JavaScript, zero-dependency, transient-preserving phase vocoder for high-quality audio time stretching.

## Why?
Most web developers looking for high-quality audio time-stretching (changing playback speed without altering pitch) are forced to use heavy WebAssembly (WASM) ports like `rubberband-wasm`. WASM has boot-time overhead and complicates build pipelines.

This library is a **100% pure JavaScript** implementation of a phase vocoder that locks phases on transients (sharp sounds like consonants). This prevents the "metallic" or "echoey" artifacts common in naive JS stretchers.

- **Fast:** Processes 10 seconds of 24kHz audio in <100ms (100x faster than real-time).
- **Zero Dependencies:** No WASM, no external NPM packages required.
- **Browser & Node:** Works perfectly in `AudioContext` or raw Float32Arrays.

## Installation
```bash
npm install fast-phase-vocoder
```

## Audio Samples
Listen to the phase vocoder in action. These samples were generated natively using `fast-phase-vocoder`:

- [Baseline (1.0x Speed)](https://raw.githubusercontent.com/iqmanq/fast-phase-vocoder/main/samples/baseline_1.0x.wav)
- [Slowed Down (0.8x Speed)](https://raw.githubusercontent.com/iqmanq/fast-phase-vocoder/main/samples/retimed_0.8x.wav)
- [Sped Up (1.5x Speed)](https://raw.githubusercontent.com/iqmanq/fast-phase-vocoder/main/samples/retimed_1.5x.wav)
- [Fast (2.0x Speed)](https://raw.githubusercontent.com/iqmanq/fast-phase-vocoder/main/samples/retimed_2x.wav)

## Usage

### In the Browser (Web Audio API)
```javascript
import { retimeAudioBuffer } from 'fast-phase-vocoder';

// Assuming you have an AudioContext and a decoded AudioBuffer
const newSpeed = 1.5; // 1.5x speed
const retimedBuffer = retimeAudioBuffer(audioContext, originalAudioBuffer, newSpeed);

const source = audioContext.createBufferSource();
source.buffer = retimedBuffer;
source.connect(audioContext.destination);
source.start();
```

### Raw Float32Array / PCM
```javascript
import { retimeMonoPcm } from 'fast-phase-vocoder';

const pcm = new Float32Array([...]); // Your raw mono audio data
const sampleRate = 24000;
const newSpeed = 0.8; // Slow down to 80%

const retimedPcm = retimeMonoPcm(pcm, sampleRate, newSpeed);
```

## Credits
Mathematical processing (FFT) adapted from HuggingFace Transformers JS.
