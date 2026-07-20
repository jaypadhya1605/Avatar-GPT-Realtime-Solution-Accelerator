class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetSampleRate = 24000
    this.sourcePosition = 0
    this.pending = []
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input?.length) return true

    const ratio = sampleRate / this.targetSampleRate
    let position = this.sourcePosition
    while (position < input.length) {
      const lowerIndex = Math.floor(position)
      const upperIndex = Math.min(lowerIndex + 1, input.length - 1)
      const fraction = position - lowerIndex
      const sample = input[lowerIndex] * (1 - fraction) + input[upperIndex] * fraction
      this.pending.push(Math.max(-1, Math.min(1, sample)))
      position += ratio
    }
    this.sourcePosition = position - input.length

    while (this.pending.length >= 480) {
      const pcm = new Int16Array(480)
      for (let index = 0; index < pcm.length; index += 1) {
        const sample = this.pending[index]
        pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      }
      this.pending.splice(0, pcm.length)
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }
    return true
  }
}

registerProcessor('pcm16-capture', PcmCaptureProcessor)