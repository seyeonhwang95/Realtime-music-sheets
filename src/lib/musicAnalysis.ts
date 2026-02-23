import type { DetectedNote } from '@/hooks/useAudioRecorder'

export interface MusicalContext {
  keySignature: string
  keySignatureLabel: string
  timeSignature: string
}

const FIFTHS_TO_MAJOR_KEY: Record<number, string> = {
  [-7]: 'Cb',
  [-6]: 'Gb',
  [-5]: 'Db',
  [-4]: 'Ab',
  [-3]: 'Eb',
  [-2]: 'Bb',
  [-1]: 'F',
  [0]: 'C',
  [1]: 'G',
  [2]: 'D',
  [3]: 'A',
  [4]: 'E',
  [5]: 'B',
  [6]: 'F#',
  [7]: 'C#',
}

const NOTE_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
}

const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11]

function normalizeMsDuration(durationMs?: number): number {
  if (!durationMs || durationMs <= 0) {
    return 500
  }
  return durationMs
}

function inferKeySignature(notes: DetectedNote[]): { keySignature: string; keySignatureLabel: string } {
  if (notes.length === 0) {
    return { keySignature: 'C', keySignatureLabel: 'C major' }
  }

  const pitchClassCounts = new Array<number>(12).fill(0)

  for (const note of notes) {
    const pitchClass = NOTE_TO_PITCH_CLASS[note.note]
    if (pitchClass !== undefined) {
      const weight = Math.max(1, normalizeMsDuration(note.duration) / 350)
      pitchClassCounts[pitchClass] += weight
    }
  }

  let bestFifths = 0
  let bestScore = Number.NEGATIVE_INFINITY

  for (let fifths = -7; fifths <= 7; fifths += 1) {
    const tonicPitchClass = ((7 * fifths) % 12 + 12) % 12
    const majorScalePitchClasses = new Set(MAJOR_SCALE_OFFSETS.map(offset => (tonicPitchClass + offset) % 12))

    let inScaleScore = 0
    let outScalePenalty = 0
    for (let pc = 0; pc < 12; pc += 1) {
      if (majorScalePitchClasses.has(pc)) {
        inScaleScore += pitchClassCounts[pc]
      } else {
        outScalePenalty += pitchClassCounts[pc] * 1.1
      }
    }

    const score = inScaleScore - outScalePenalty
    if (score > bestScore) {
      bestScore = score
      bestFifths = fifths
    }
  }

  const key = FIFTHS_TO_MAJOR_KEY[bestFifths] ?? 'C'
  return { keySignature: key, keySignatureLabel: `${key} major` }
}

function inferTimeSignature(notes: DetectedNote[], bpm: number): string {
  if (notes.length < 3) {
    return '4/4'
  }

  const safeBpm = bpm > 0 ? bpm : 120
  const quarterMs = 60000 / safeBpm

  const durationsInQuarterBeats = notes.map(note => {
    const duration = normalizeMsDuration(note.duration)
    const raw = duration / quarterMs
    return Math.max(0.5, Math.round(raw * 2) / 2)
  })

  const candidates: Array<{ signature: string; beats: number }> = [
    { signature: '2/4', beats: 2 },
    { signature: '3/4', beats: 3 },
    { signature: '4/4', beats: 4 },
    { signature: '6/8', beats: 3 },
  ]

  let bestSignature = '4/4'
  let bestPenalty = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    let position = 0
    let penalty = 0

    for (const duration of durationsInQuarterBeats) {
      const nextPosition = position + duration

      if (nextPosition > candidate.beats + 0.001) {
        const overflow = nextPosition - candidate.beats
        penalty += overflow * overflow
        position = duration % candidate.beats
      } else if (Math.abs(nextPosition - candidate.beats) < 0.08) {
        position = 0
      } else {
        position = nextPosition
      }
    }

    penalty += Math.abs(position) * 0.3

    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestSignature = candidate.signature
    }
  }

  return bestSignature
}

export function inferMusicalContext(notes: DetectedNote[], bpm: number): MusicalContext {
  const keyInfo = inferKeySignature(notes)
  const timeSignature = inferTimeSignature(notes, bpm)

  return {
    keySignature: keyInfo.keySignature,
    keySignatureLabel: keyInfo.keySignatureLabel,
    timeSignature,
  }
}

export function keySignatureToFifths(keySignature: string): number {
  const entries = Object.entries(FIFTHS_TO_MAJOR_KEY)
  const matched = entries.find(([, key]) => key === keySignature)
  if (!matched) return 0
  return Number(matched[0])
}
