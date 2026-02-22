import * as Tone from 'tone'
import type { DetectedNote } from '@/hooks/useAudioRecorder'

export type SheetInstrument = 'piano' | 'violin' | 'cello' | 'bass' | 'oboe' | 'french-horn' | 'flute'

export const SHEET_INSTRUMENTS: Array<{ id: SheetInstrument; label: string }> = [
  { id: 'piano', label: 'Piano' },
  { id: 'violin', label: 'Violin' },
  { id: 'cello', label: 'Cello' },
  { id: 'bass', label: 'Bass (Base)' },
  { id: 'oboe', label: 'Oboe' },
  { id: 'french-horn', label: 'French Horn' },
  { id: 'flute', label: 'Flute (Fluit)' },
]

const FALLBACK_NOTE_DURATION_MS = 600

export function noteDurationToSeconds(durationMs: number | undefined, bpm: number): number {
  if (durationMs && durationMs > 0) {
    return Math.max(0.08, durationMs / 1000)
  }
  const quarterNoteSeconds = 60 / bpm
  return Math.max(0.08, quarterNoteSeconds || FALLBACK_NOTE_DURATION_MS / 1000)
}

export function createSheetSynth(instrument: SheetInstrument): Tone.PolySynth {
  switch (instrument) {
    case 'piano':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.25, release: 0.7 },
      }).toDestination()
    case 'violin':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.06, decay: 0.1, sustain: 0.8, release: 0.5 },
      }).toDestination()
    case 'cello':
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 1.5,
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.7 },
      }).toDestination()
    case 'bass':
      return new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: 'square' },
        filter: { Q: 2, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.35 },
      }).toDestination()
    case 'oboe':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.55, release: 0.25 },
      }).toDestination()
    case 'french-horn':
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 0.8,
        modulationIndex: 4,
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.65, release: 0.45 },
      }).toDestination()
    case 'flute':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.03, decay: 0.08, sustain: 0.5, release: 0.2 },
      }).toDestination()
    default:
      return new Tone.PolySynth(Tone.Synth).toDestination()
  }
}

export function getTotalPlaybackSeconds(notes: DetectedNote[], bpm: number): number {
  return notes.reduce((sum, note) => sum + noteDurationToSeconds(note.duration, bpm), 0)
}
