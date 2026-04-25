import { KokoroTTS } from 'kokoro-js';
import fs from 'fs';
import path from 'path';
import pkg from 'wavefile';
import { retimeMonoPcm } from './fast-phase-vocoder/index.js';

const { WaveFile } = pkg;

async function generateSamples() {
    const text = "This is a demonstration of the fast phase vocoder library. It provides high quality time stretching entirely in pure JavaScript.";
    
    console.log("Loading TTS model...");
    const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp16' });
    
    console.log("Generating baseline audio (1.0x)...");
    const audio = await tts.generate(text, { voice: 'af_heart' });
    
    const sampleRate = audio.sampling_rate;
    const originalPcm = audio.audio; // Float32Array
    
    const samplesDir = path.join(process.cwd(), 'samples');
    if (!fs.existsSync(samplesDir)) {
        fs.mkdirSync(samplesDir);
    }
    
    // Save original
    let wav = new WaveFile();
    wav.fromScratch(1, sampleRate, '32f', originalPcm);
    fs.writeFileSync(path.join(samplesDir, 'baseline_1.0x.wav'), wav.toBuffer());
    console.log("Saved baseline_1.0x.wav");
    
    const speeds = [0.8, 1.5, 2.0];
    
    for (const speed of speeds) {
        console.log(`Generating ${speed}x retimed audio...`);
        const start = performance.now();
        const retimedPcm = retimeMonoPcm(originalPcm, sampleRate, speed);
        const time = performance.now() - start;
        console.log(`Retimed to ${speed}x in ${time.toFixed(2)} ms`);
        
        let outWav = new WaveFile();
        outWav.fromScratch(1, sampleRate, '32f', retimedPcm);
        fs.writeFileSync(path.join(samplesDir, `retimed_${speed}x.wav`), outWav.toBuffer());
        console.log(`Saved retimed_${speed}x.wav`);
    }
    
    console.log("All samples generated successfully in the 'samples' folder.");
}

generateSamples().catch(console.error);
