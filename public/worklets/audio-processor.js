// Note: AudioWorkletProcessor is available in the worklet scope
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;  // Reduced from 4096 to 2048 for faster response
    this.accumulatedSamples = new Float32Array(this.bufferSize);
    this.sampleCount = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0][0];
    if (!input) return true;

    // Accumulate samples
    for (let i = 0; i < input.length && this.sampleCount < this.bufferSize; i++) {
      this.accumulatedSamples[this.sampleCount++] = input[i];
    }

    // Process when we have enough samples
    if (this.sampleCount >= this.bufferSize) {
      const pcm16 = new Int16Array(this.bufferSize);
      let sum = 0;
      
      // Simple conversion like in the original implementation
      for (let i = 0; i < this.bufferSize; i++) {
        // Scale to 16-bit range directly
        pcm16[i] = this.accumulatedSamples[i] * 0x7FFF;
        sum += Math.abs(pcm16[i]);
      }

      const buffer = new ArrayBuffer(this.bufferSize * 2);
      const view = new DataView(buffer);
      pcm16.forEach((value, index) => {
        view.setInt16(index * 2, value, true);
      });

      // Simplified level calculation
      const level = (sum / (this.bufferSize * 0x7FFF)) * 100;

      this.port.postMessage({
        pcmData: buffer,
        level: Math.min(level * 5, 100)
      }, [buffer]);

      this.sampleCount = 0;
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor); 