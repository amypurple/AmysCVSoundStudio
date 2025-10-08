
/**
 * @file Speaker class (AudioWorklet version with fallback)
 * Uses AudioWorkletNode for modern browsers, falls back to ScriptProcessorNode
 * Pull-based rendering using the audio callback to avoid timer drift.
 * Keeps original emulation intact (SoundChip/SoundEngine unchanged).
 */
class Speaker {
  constructor(sndchip) {
    this.snd = sndchip;
    this.audioContext = null;
    this.node = null;
    this.gain = null;
    this.useWorklet = false;
    this.workletNode = null;
    this.sampleBuffer = [];
    this.isGenerating = false;
  }

  async play() {
    if (this.audioContext) return 0;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sampleRate = this.audioContext.sampleRate;
    const bufferSize = 1024;
    const dt = 1.0 / sampleRate;

    this.gain = this.audioContext.createGain();
    this.gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    this.gain.connect(this.audioContext.destination);

    // Try AudioWorklet first (modern approach)
    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule('speaker-processor.js');
        this.workletNode = new AudioWorkletNode(this.audioContext, 'speaker-processor');

        // Handle messages from worklet
        this.workletNode.port.onmessage = (e) => {
          if (e.data.type === 'needSamples') {
            this.generateSamples(dt, 1024);
          }
        };

        this.workletNode.connect(this.gain);
        this.useWorklet = true;

        // Start generating initial samples
        this.generateSamples(dt, 2048);

        console.log('Using AudioWorklet for audio playback');
        return;
      } catch (err) {
        console.warn('AudioWorklet failed, falling back to ScriptProcessor:', err);
      }
    }

    // Fallback to ScriptProcessorNode (deprecated but widely supported)
    console.log('Using ScriptProcessorNode (deprecated) for audio playback');
    this.node = this.audioContext.createScriptProcessor(bufferSize, 0, 1);
    this.node.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i++) {
        out[i] = this.snd.output();
        this.snd.update(dt);
      }
    };
    this.node.connect(this.gain);
  }

  generateSamples(dt, count) {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      samples[i] = this.snd.output();
      this.snd.update(dt);
    }

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'samples',
        samples: samples
      });
    }

    this.isGenerating = false;
  }

  stop() {
    try { if (this.workletNode) this.workletNode.disconnect(); } catch {}
    try { if (this.node) this.node.disconnect(); } catch {}
    try { if (this.gain) this.gain.disconnect(); } catch {}
    try { if (this.audioContext) this.audioContext.close(); } catch {}
    this.workletNode = null;
    this.node = null;
    this.gain = null;
    this.audioContext = null;
    this.useWorklet = false;
  }
}
