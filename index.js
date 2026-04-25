import { FFT } from './maths.js';

function audioBufferToMonoPcm(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
        return audioBuffer.getChannelData(0);
    }
    const pcm = new Float32Array(audioBuffer.length);
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < pcm.length; i++) {
            pcm[i] += channelData[i];
        }
    }
    for (let i = 0; i < pcm.length; i++) {
        pcm[i] /= audioBuffer.numberOfChannels;
    }
    return pcm;
}

function createMonoAudioBuffer(audioContext, pcm, sampleRate) {
    const buffer = audioContext.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(pcm, 0);
    return buffer;
}

const TWO_PI = 2 * Math.PI;
const EPS = 1e-8;

function princ(angle) {
    let wrapped = (angle + Math.PI) % TWO_PI;
    if (wrapped < 0) wrapped += TWO_PI;
    return wrapped - Math.PI;
}

function hanning(length) {
    const window = new Float32Array(length);
    if (length <= 1) {
        window.fill(1);
        return window;
    }
    for (let i = 0; i < length; i++) {
        window[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / (length - 1));
    }
    return window;
}

function sanitizePcm(pcm) {
    const out = Float32Array.from(pcm || []);
    for (let i = 0; i < out.length; i++) {
        const value = out[i];
        out[i] = Number.isFinite(value) ? value : 0;
    }
    return out;
}

function fftForwardReal(fft, frame) {
    const input = new Float64Array(frame.length);
    input.set(frame);
    const output = new Float64Array(fft.outputBufferSize);
    fft.realTransform(output, input);
    return output;
}

function fftInverseComplex(fft, complex) {
    const conjugated = new Float64Array(complex.length);
    for (let i = 0; i < complex.length; i += 2) {
        conjugated[i] = complex[i];
        conjugated[i + 1] = -complex[i + 1];
    }

    const transformed = new Float64Array(complex.length);
    fft.transform(transformed, conjugated);

    const out = new Float64Array(complex.length);
    for (let i = 0; i < transformed.length; i += 2) {
        out[i] = transformed[i] / fft.fft_length;
        out[i + 1] = -transformed[i + 1] / fft.fft_length;
    }
    return out;
}

function stft(pcm, nfft, hop, window) {
    const frameCount = pcm.length <= nfft ? 1 : Math.ceil((pcm.length - nfft) / hop) + 1;
    const neededLength = ((frameCount - 1) * hop) + nfft;
    const padded = new Float32Array(neededLength);
    padded.set(pcm);

    const fft = new FFT(nfft);
    const binCount = Math.floor(nfft / 2) + 1;
    const real = new Array(frameCount);
    const imag = new Array(frameCount);
    const magnitudes = new Array(frameCount);
    const phases = new Array(frameCount);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const offset = frameIndex * hop;
        const frame = new Float32Array(nfft);
        for (let i = 0; i < nfft; i++) {
            frame[i] = padded[offset + i] * window[i];
        }

        const transformed = fftForwardReal(fft, frame);
        const re = new Float64Array(binCount);
        const im = new Float64Array(binCount);
        const mag = new Float64Array(binCount);
        const phase = new Float64Array(binCount);
        for (let bin = 0; bin < binCount; bin++) {
            const idx = bin * 2;
            const realPart = transformed[idx];
            const imagPart = transformed[idx + 1];
            re[bin] = realPart;
            im[bin] = imagPart;
            mag[bin] = Math.hypot(realPart, imagPart);
            phase[bin] = Math.atan2(imagPart, realPart);
        }

        real[frameIndex] = re;
        imag[frameIndex] = im;
        magnitudes[frameIndex] = mag;
        phases[frameIndex] = phase;
    }

    return {
        fft,
        frameCount,
        binCount,
        real,
        imag,
        magnitudes,
        phases
    };
}

function peaks(magnitudes) {
    const peaksFound = [];
    for (let i = 1; i < magnitudes.length - 1; i++) {
        if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] >= magnitudes[i + 1]) {
            peaksFound.push(i);
        }
    }
    if (!peaksFound.length) {
        let maxIndex = 0;
        for (let i = 1; i < magnitudes.length; i++) {
            if (magnitudes[i] > magnitudes[maxIndex]) {
                maxIndex = i;
            }
        }
        peaksFound.push(maxIndex);
    }
    return peaksFound;
}

function groups(binCount, peakBins, radius = null) {
    const sorted = peakBins.slice().sort((a, b) => a - b);
    const grouped = new Int32Array(binCount);

    if (sorted.length === 1) {
        grouped.fill(sorted[0]);
    } else {
        const mids = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            mids.push(Math.floor((sorted[i] + sorted[i + 1]) / 2));
        }
        grouped.fill(sorted[0], 0, mids[0] + 1);
        for (let i = 1; i < sorted.length - 1; i++) {
            grouped.fill(sorted[i], mids[i - 1] + 1, mids[i] + 1);
        }
        grouped.fill(sorted[sorted.length - 1], mids[mids.length - 1] + 1);
    }

    if (radius != null && radius > 0) {
        for (let i = 0; i < binCount; i++) {
            if (Math.abs(i - grouped[i]) > radius) {
                grouped[i] = i;
            }
        }
    }
    return grouped;
}

function spectralFlux(magnitudesByFrame) {
    const frameCount = magnitudesByFrame.length;
    const flux = new Float64Array(Math.max(0, frameCount - 1));
    for (let frameIndex = 1; frameIndex < frameCount; frameIndex++) {
        const prev = magnitudesByFrame[frameIndex - 1];
        const next = magnitudesByFrame[frameIndex];
        let sum = 0;
        for (let bin = 0; bin < next.length; bin++) {
            const delta = next[bin] - prev[bin];
            if (delta > 0) {
                sum += delta;
            }
        }
        flux[frameIndex - 1] = sum;
    }
    return flux;
}

function smooth(values, kernelSize = 9) {
    if (kernelSize <= 1 || values.length === 0) {
        return Float64Array.from(values);
    }
    const pad = Math.floor(kernelSize / 2);
    const out = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = -pad; j <= pad; j++) {
            const idx = Math.min(values.length - 1, Math.max(0, i + j));
            sum += values[idx];
            count += 1;
        }
        out[i] = sum / count;
    }
    return out;
}

function slerp(phaseA, phaseB, alpha) {
    const ax = Math.cos(phaseA);
    const ay = Math.sin(phaseA);
    const bx = Math.cos(phaseB);
    const by = Math.sin(phaseB);
    return Math.atan2(((1 - alpha) * ay) + (alpha * by), ((1 - alpha) * ax) + (alpha * bx));
}

function pvIplTransient({ magnitudes, phases, real, imag }, rate, hop, nfft, { lock, fluxK, fluxZ, trans }) {
    const frameCount = magnitudes.length;
    const binCount = magnitudes[0]?.length || 0;
    const steps = [];
    for (let value = 0; value < frameCount - 1; value += rate) {
        steps.push(value);
    }
    if (!steps.length) {
        steps.push(0);
    }

    const outputReal = new Array(steps.length);
    const outputImag = new Array(steps.length);
    outputReal[0] = Float64Array.from(real[0] || []);
    outputImag[0] = Float64Array.from(imag[0] || []);

    const omega = new Float64Array(binCount);
    for (let bin = 0; bin < binCount; bin++) {
        omega[bin] = TWO_PI * hop * bin / nfft;
    }

    const flux = smooth(spectralFlux(magnitudes), fluxK);
    let mean = 0;
    for (const value of flux) mean += value;
    mean = flux.length ? mean / flux.length : 0;

    let variance = 0;
    for (const value of flux) variance += (value - mean) ** 2;
    variance = flux.length ? variance / flux.length : 0;
    const threshold = mean + (fluxZ * Math.sqrt(variance));
    const isTransient = new Array(frameCount).fill(false);
    for (let i = 1; i < frameCount; i++) {
        isTransient[i] = flux[i - 1] > threshold;
    }

    let phi = Float64Array.from(phases[0] || []);
    for (let stepIndex = 1; stepIndex < steps.length; stepIndex++) {
        const step = steps[stepIndex];
        const frameIndex = Math.floor(step);
        const frac = step - frameIndex;
        if (frameIndex >= frameCount - 1) {
            break;
        }

        const mag0 = magnitudes[frameIndex];
        const mag1 = magnitudes[frameIndex + 1];
        const phase0 = phases[frameIndex];
        const phase1 = phases[frameIndex + 1];
        const nextPhi = new Float64Array(binCount);
        const outputMag = new Float64Array(binCount);

        for (let bin = 0; bin < binCount; bin++) {
            const delta = princ((phase1[bin] - phase0[bin]) - omega[bin]);
            nextPhi[bin] = phi[bin] + omega[bin] + delta;
            outputMag[bin] = isTransient[frameIndex + 1]
                ? mag1[bin]
                : ((1 - frac) * mag0[bin]) + (frac * mag1[bin]);
        }

        const peakBins = peaks(mag0);
        const groupAssignments = groups(binCount, peakBins, lock);
        for (const peakBin of peakBins) {
            const delta = princ((phase1[peakBin] - phase0[peakBin]) - omega[peakBin]);
            const pvPhase = phi[peakBin] + omega[peakBin] + delta;
            nextPhi[peakBin] =
                isTransient[frameIndex + 1] && trans > 0
                    ? slerp(pvPhase, phase1[peakBin], trans)
                    : pvPhase;

            for (let bin = 0; bin < binCount; bin++) {
                if (groupAssignments[bin] !== peakBin || bin === peakBin) continue;
                const relative = princ(phase0[bin] - phase0[peakBin]);
                nextPhi[bin] = nextPhi[peakBin] + relative;
            }
        }

        const outRe = new Float64Array(binCount);
        const outIm = new Float64Array(binCount);
        for (let bin = 0; bin < binCount; bin++) {
            outRe[bin] = outputMag[bin] * Math.cos(nextPhi[bin]);
            outIm[bin] = outputMag[bin] * Math.sin(nextPhi[bin]);
        }
        outputReal[stepIndex] = outRe;
        outputImag[stepIndex] = outIm;
        phi = nextPhi;
    }

    for (let i = 0; i < outputReal.length; i++) {
        if (!outputReal[i]) {
            outputReal[i] = Float64Array.from(outputReal[i - 1] || real[frameCount - 1] || []);
            outputImag[i] = Float64Array.from(outputImag[i - 1] || imag[frameCount - 1] || []);
        }
    }

    return { real: outputReal, imag: outputImag };
}

function istft({ fft, real, imag }, nfft, hop, window, outputLength) {
    const frameCount = real.length;
    const binCount = Math.floor(nfft / 2) + 1;
    const out = new Float32Array(nfft + ((frameCount - 1) * hop));
    const windowSums = new Float32Array(out.length);

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const spectrum = new Float64Array(2 * nfft);
        for (let bin = 0; bin < binCount; bin++) {
            const idx = bin * 2;
            spectrum[idx] = real[frameIndex][bin];
            spectrum[idx + 1] = imag[frameIndex][bin];
        }
        for (let bin = 1; bin < (nfft / 2); bin++) {
            const mirrorBin = nfft - bin;
            const src = bin * 2;
            const dst = mirrorBin * 2;
            spectrum[dst] = spectrum[src];
            spectrum[dst + 1] = -spectrum[src + 1];
        }

        const timeDomain = fftInverseComplex(fft, spectrum);
        const offset = frameIndex * hop;
        for (let i = 0; i < nfft; i++) {
            const value = timeDomain[i * 2] * window[i];
            out[offset + i] += value;
            windowSums[offset + i] += window[i] * window[i];
        }
    }

    for (let i = 0; i < out.length; i++) {
        if (windowSums[i] > EPS) {
            out[i] /= windowSums[i];
        }
    }

    if (outputLength === out.length) {
        return out;
    }

    const trimmed = new Float32Array(outputLength);
    trimmed.set(out.subarray(0, Math.min(outputLength, out.length)));
    return trimmed;
}

export function retimeMonoPcm(inputPcm, sampleRate, tempo) {
    const pcm = sanitizePcm(inputPcm);
    const safeTempo = Number.isFinite(tempo) && tempo > 0 ? tempo : 1;
    if (Math.abs(safeTempo - 1) < 1e-6 || pcm.length === 0) {
        return pcm;
    }

    // Keep the native phase-vocoder/transient-locking logic, but pin the FFT size
    // to a power-of-two so we can stay on a lightweight browser FFT backend.
    const nfft = 1024;
    const hop = nfft >> 2;
    const window = hanning(nfft);
    const spectrum = stft(pcm, nfft, hop, window);
    const retimed = pvIplTransient(spectrum, safeTempo, hop, nfft, {
        lock: safeTempo >= 1 ? 6 : 10,
        fluxK: 9,
        fluxZ: 1.0,
        trans: safeTempo >= 1 ? 0.5 : 0.8
    });
    const outputLength = Math.max(1, Math.round(pcm.length / safeTempo));
    return istft({
        fft: spectrum.fft,
        real: retimed.real,
        imag: retimed.imag
    }, nfft, hop, window, outputLength);
}

export function retimeAudioBuffer(audioContext, audioBuffer, tempo) {
    const mono = audioBufferToMonoPcm(audioBuffer);
    const retimedPcm = retimeMonoPcm(mono, audioBuffer.sampleRate, tempo);
    return createMonoAudioBuffer(audioContext, retimedPcm, audioBuffer.sampleRate);
}
