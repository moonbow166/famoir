/**
 * AudioWorklet processor for low-latency PCM playback via ring buffer.
 * Accepts Int16 PCM data at 24kHz from the main thread.
 *
 * Ring buffer design eliminates per-chunk AudioBufferSourceNode creation,
 * scheduling math, and timing drift. Based on Google's bidi-demo reference.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // 24kHz * 180 seconds = 4,320,000 samples ring buffer
    this.bufferSize = 24000 * 180;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    this.port.onmessage = (event) => {
      // Instantly clear buffer on interrupt
      if (event.data.command === "endOfAudio") {
        this.readIndex = this.writeIndex;
        return;
      }
      // event.data is an ArrayBuffer of Int16 PCM
      this._enqueue(new Int16Array(event.data));
    };
  }

  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      this.buffer[this.writeIndex] = int16Samples[i] / 32768;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      // Overflow: overwrite oldest samples
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const framesPerBlock = output[0].length;
    for (let frame = 0; frame < framesPerBlock; frame++) {
      output[0][frame] = this.buffer[this.readIndex];
      if (output.length > 1) {
        output[1][frame] = this.buffer[this.readIndex];
      }
      // Only advance read if there's data to read
      if (this.readIndex !== this.writeIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
    return true;
  }
}

registerProcessor("pcm-player-processor", PCMPlayerProcessor);
