/**
 * @file AudioWorklet processor for ColecoVision sound
 * Runs in the audio rendering thread for glitch-free audio
 */
class SpeakerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Ring buffer size
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.samplesAvailable = 0;

    // Listen for audio samples from main thread
    this.port.onmessage = (e) => {
      if (e.data.type === 'samples') {
        const samples = e.data.samples;

        // Write samples to ring buffer
        for (let i = 0; i < samples.length; i++) {
          this.buffer[this.writePos] = samples[i];
          this.writePos = (this.writePos + 1) % this.bufferSize;
          this.samplesAvailable++;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    // Read samples from ring buffer
    for (let i = 0; i < channel.length; i++) {
      if (this.samplesAvailable > 0) {
        channel[i] = this.buffer[this.readPos];
        this.readPos = (this.readPos + 1) % this.bufferSize;
        this.samplesAvailable--;
      } else {
        // Buffer underrun - output silence
        channel[i] = 0;
      }
    }

    // Request more samples if running low
    if (this.samplesAvailable < 512) {
      this.port.postMessage({ type: 'needSamples' });
    }

    return true; // Keep processor alive
  }
}

registerProcessor('speaker-processor', SpeakerProcessor);
