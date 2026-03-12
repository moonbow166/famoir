/**
 * AudioWorklet processor for capturing microphone PCM audio.
 * Captures 16-bit PCM at the AudioContext sample rate,
 * then the main thread resamples to 16kHz for Gemini Live API.
 *
 * Optimized for low latency: ~20ms chunks at native sample rate.
 * At 48kHz, 960 samples ≈ 20ms. At 44.1kHz, 882 samples ≈ 20ms.
 * We use 960 as a good default that works well at common sample rates.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Target ~20ms chunks for low-latency streaming
    // At 48kHz: 960 samples = 20ms
    // At 44.1kHz: 960 samples ≈ 21.8ms
    this._bufferSize = 960;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono channel

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex >= this._bufferSize) {
        // Convert float32 [-1, 1] to int16 [-32768, 32767]
        const pcm16 = new Int16Array(this._bufferSize);
        for (let j = 0; j < this._bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send PCM data to main thread
        this.port.postMessage({
          type: "audio",
          pcmData: pcm16.buffer,
          sampleRate: sampleRate, // AudioWorklet global
        }, [pcm16.buffer]);

        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
