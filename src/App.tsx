import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Square, Play, Pause, RotateCcw, Download, Music } from 'lucide-react'
import * as Tone from 'tone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SheetMusicDisplay } from '@/components/SheetMusicDisplay'
import { AudioVisualizer } from '@/components/AudioVisualizer'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { exportToMidi, exportToMusicXml, exportToPdf } from '@/lib/exportUtils'
import { createSheetSynth, getTotalPlaybackSeconds, SHEET_INSTRUMENTS, type SheetInstrument, noteDurationToSeconds } from '@/lib/sheetPlayer'
import { inferMusicalContext } from '@/lib/musicAnalysis'

const BPM_DEFAULT = 120
type MetronomeSound = 'click' | 'beep' | 'wood'

export default function App() {
  const {
    recordingState,
    detectedNotes,
    currentFrequency,
    currentNote,
    volume,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder()

  const [bpm, setBpm] = useState(BPM_DEFAULT)
  const [isMetronomeOn, setIsMetronomeOn] = useState(false)
  const [metronomeTempo, setMetronomeTempo] = useState(BPM_DEFAULT)
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>('click')
  const [metronomeVolume, setMetronomeVolume] = useState(0.65)
  const [metronomeBeatsPerBar, setMetronomeBeatsPerBar] = useState(4)
  const [metronomeAccent, setMetronomeAccent] = useState(true)
  const [instrument, setInstrument] = useState<SheetInstrument>('piano')
  const [isPlayingSheet, setIsPlayingSheet] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [audioProbeUrl, setAudioProbeUrl] = useState<string | null>(null)
  const sheetSynthRef = useRef<Tone.PolySynth | null>(null)
  const fallbackAudioContextRef = useRef<AudioContext | null>(null)
  const fallbackOscillatorsRef = useRef<OscillatorNode[]>([])
  const fallbackAudioElementRef = useRef<HTMLAudioElement | null>(null)
  const fallbackAudioUrlRef = useRef<string | null>(null)
  const metronomeContextRef = useRef<AudioContext | null>(null)
  const metronomeTimerRef = useRef<number | null>(null)
  const metronomeNextTickRef = useRef(0)
  const metronomeBeatRef = useRef(0)
  const metronomeTempoRef = useRef(metronomeTempo)
  const metronomeSoundRef = useRef<MetronomeSound>(metronomeSound)
  const metronomeVolumeRef = useRef(metronomeVolume)
  const metronomeBeatsRef = useRef(metronomeBeatsPerBar)
  const metronomeAccentRef = useRef(metronomeAccent)
  const stopTimerRef = useRef<number | null>(null)

  const isIdle = recordingState === 'idle'
  const isRecording = recordingState === 'recording'
  const isPaused = recordingState === 'paused'
  const isStopped = recordingState === 'stopped'
  const hasNotes = detectedNotes.length > 0
  const musicalContext = useMemo(() => inferMusicalContext(detectedNotes, bpm), [detectedNotes, bpm])

  useEffect(() => {
    metronomeTempoRef.current = metronomeTempo
  }, [metronomeTempo])

  useEffect(() => {
    metronomeSoundRef.current = metronomeSound
  }, [metronomeSound])

  useEffect(() => {
    metronomeVolumeRef.current = metronomeVolume
  }, [metronomeVolume])

  useEffect(() => {
    metronomeBeatsRef.current = metronomeBeatsPerBar
  }, [metronomeBeatsPerBar])

  useEffect(() => {
    metronomeAccentRef.current = metronomeAccent
  }, [metronomeAccent])

  const stopSheetPlayback = () => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
    if (sheetSynthRef.current) {
      sheetSynthRef.current.dispose()
      sheetSynthRef.current = null
    }
    if (fallbackOscillatorsRef.current.length > 0) {
      fallbackOscillatorsRef.current.forEach(osc => {
        try {
          osc.stop()
        } catch {
          // ignore
        }
        try {
          osc.disconnect()
        } catch {
          // ignore
        }
      })
      fallbackOscillatorsRef.current = []
    }
    if (fallbackAudioContextRef.current) {
      fallbackAudioContextRef.current.close().catch(() => {
        // ignore
      })
      fallbackAudioContextRef.current = null
    }
    if (fallbackAudioElementRef.current) {
      fallbackAudioElementRef.current.pause()
      fallbackAudioElementRef.current.currentTime = 0
      fallbackAudioElementRef.current = null
    }
    if (fallbackAudioUrlRef.current) {
      URL.revokeObjectURL(fallbackAudioUrlRef.current)
      fallbackAudioUrlRef.current = null
    }

    setIsPlayingSheet(false)
  }

  const stopMetronome = () => {
    if (metronomeTimerRef.current !== null) {
      window.clearTimeout(metronomeTimerRef.current)
      metronomeTimerRef.current = null
    }
    if (metronomeContextRef.current) {
      metronomeContextRef.current.close().catch(() => {
        // ignore
      })
      metronomeContextRef.current = null
    }
    metronomeNextTickRef.current = 0
    metronomeBeatRef.current = 0
    setIsMetronomeOn(false)
  }

  const playMetronomeTick = (audioContext: AudioContext, atTime: number, isAccentBeat: boolean) => {
    const sound = metronomeSoundRef.current
    const volume = Math.max(0, Math.min(1, metronomeVolumeRef.current))
    const accentGain = isAccentBeat && metronomeAccentRef.current ? 1.35 : 1

    const gainNode = audioContext.createGain()
    gainNode.gain.setValueAtTime(0.0001, atTime)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * accentGain), atTime + 0.003)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.08)
    gainNode.connect(audioContext.destination)

    const oscillator = audioContext.createOscillator()
    oscillator.connect(gainNode)

    if (sound === 'beep') {
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(isAccentBeat ? 1120 : 820, atTime)
    } else if (sound === 'wood') {
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(isAccentBeat ? 980 : 730, atTime)
    } else {
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(isAccentBeat ? 1650 : 1250, atTime)
    }

    oscillator.start(atTime)
    oscillator.stop(atTime + 0.09)
  }

  const startMetronome = async () => {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      setPlaybackError('Metronome unavailable: Web Audio API not supported')
      return
    }

    const context = new AudioCtx()
    try {
      await context.resume()
    } catch {
      setPlaybackError('Metronome failed to start audio context')
      context.close().catch(() => {
        // ignore
      })
      return
    }

    metronomeContextRef.current = context
    metronomeNextTickRef.current = context.currentTime + 0.05
    metronomeBeatRef.current = 0
    setIsMetronomeOn(true)

    const lookaheadSeconds = 0.12

    const schedule = () => {
      const activeContext = metronomeContextRef.current
      if (!activeContext) return

      while (metronomeNextTickRef.current < activeContext.currentTime + lookaheadSeconds) {
        const beats = Math.max(1, metronomeBeatsRef.current)
        const beatIndex = metronomeBeatRef.current % beats
        const isAccentBeat = beatIndex === 0

        playMetronomeTick(activeContext, metronomeNextTickRef.current, isAccentBeat)

        const safeTempo = Math.max(30, metronomeTempoRef.current)
        const beatDuration = 60 / safeTempo
        metronomeNextTickRef.current += beatDuration
        metronomeBeatRef.current += 1
      }

      metronomeTimerRef.current = window.setTimeout(schedule, 25)
    }

    schedule()
  }

  const toggleMetronome = async () => {
    setPlaybackError(null)
    if (isMetronomeOn) {
      stopMetronome()
      return
    }
    await startMetronome()
  }

  const noteFrequencyHz = (note: { frequency: number; midi: number }) => {
    if (note.frequency > 0 && Number.isFinite(note.frequency)) {
      return note.frequency
    }
    if (note.midi > 0) {
      return 440 * Math.pow(2, (note.midi - 69) / 12)
    }
    return 440
  }

  const notePlaybackSeconds = (note: { duration?: number }) => {
    const baseDuration = noteDurationToSeconds(note.duration, bpm)
    const tempoScale = BPM_DEFAULT / Math.max(1, bpm)
    return Math.max(0.06, baseDuration * tempoScale)
  }

  const encodeWavPcm16 = (samples: Float32Array, sampleRate: number): Blob => {
    const bytesPerSample = 2
    const blockAlign = bytesPerSample
    const byteRate = sampleRate * blockAlign
    const dataSize = samples.length * bytesPerSample
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    let offset = 44
    for (let i = 0; i < samples.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[i]))
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }

  const instrumentHarmonics: Record<SheetInstrument, number[]> = {
    piano: [0.7, 0.2, 0.08, 0.02],
    violin: [0.45, 0.3, 0.18, 0.07],
    cello: [0.6, 0.22, 0.12, 0.06],
    bass: [0.75, 0.18, 0.06, 0.01],
    oboe: [0.5, 0.3, 0.14, 0.06],
    'french-horn': [0.55, 0.28, 0.1, 0.05],
    flute: [0.9, 0.08, 0.02, 0],
  }

  const sampleInstrumentWave = (frequency: number, t: number, selectedInstrument: SheetInstrument) => {
    const harmonics = instrumentHarmonics[selectedInstrument] ?? instrumentHarmonics.piano
    let value = 0
    for (let h = 0; h < harmonics.length; h += 1) {
      const weight = harmonics[h]
      if (weight <= 0) continue
      value += Math.sin(2 * Math.PI * frequency * (h + 1) * t) * weight
    }
    return value
  }

  const generateAudioProbe = () => {
    const sampleRate = 44100
    const seconds = 0.6
    const totalSamples = Math.floor(sampleRate * seconds)
    const samples = new Float32Array(totalSamples)

    for (let i = 0; i < totalSamples; i += 1) {
      const t = i / sampleRate
      const envelope = Math.min(1, i / 800) * Math.min(1, (totalSamples - i) / 1200)
      samples[i] = Math.sin(2 * Math.PI * 440 * t) * envelope * 0.5
    }

    const blob = encodeWavPcm16(samples, sampleRate)
    const url = URL.createObjectURL(blob)

    if (audioProbeUrl) {
      URL.revokeObjectURL(audioProbeUrl)
    }
    setAudioProbeUrl(url)
  }

  const playAiGeneratedMelody = async () => {
    setPlaybackError(null)
    stopSheetPlayback()

    const sampleRate = 44100
    const totalSeconds = 15
    const totalSamples = Math.floor(sampleRate * totalSeconds)
    const samples = new Float32Array(totalSamples)

    const scale = [0, 2, 4, 5, 7, 9, 11]
    const progression = [
      [0, 4, 7],
      [9, 0, 4],
      [5, 9, 0],
      [7, 11, 2],
    ]

    const tempo = 96
    const beatSec = 60 / tempo
    const stepSec = beatSec / 2
    const steps = Math.floor(totalSeconds / stepSec)
    let scaleIndex = 0

    const events: Array<{ startSec: number; durationSec: number; midi: number; velocity: number }> = []

    for (let step = 0; step < steps; step += 1) {
      const chord = progression[Math.floor(step / 8) % progression.length]
      const random = Math.random()

      if (step % 8 === 0 || random < 0.24) {
        const chordPitch = chord[Math.floor(Math.random() * chord.length)]
        const octave = Math.random() < 0.22 ? 5 : 4
        const midi = 12 * (octave + 1) + chordPitch
        events.push({
          startSec: step * stepSec,
          durationSec: stepSec * (1.7 + Math.random() * 0.4),
          midi,
          velocity: 0.8,
        })
      } else {
        const movement = Math.floor(Math.random() * 3) - 1
        scaleIndex = Math.max(0, Math.min(scale.length - 1, scaleIndex + movement))
        const octave = scaleIndex >= 5 ? 5 : 4
        const midi = 12 * (octave + 1) + scale[scaleIndex]
        events.push({
          startSec: step * stepSec,
          durationSec: stepSec * (0.9 + Math.random() * 0.45),
          midi,
          velocity: 0.65,
        })
      }
    }

    events.push({
      startSec: 0,
      durationSec: totalSeconds,
      midi: 48,
      velocity: 0.16,
    })

    for (const event of events) {
      const startSample = Math.floor(event.startSec * sampleRate)
      const eventSamples = Math.floor(event.durationSec * sampleRate)
      const frequency = 440 * Math.pow(2, (event.midi - 69) / 12)

      const attack = Math.max(1, Math.floor(eventSamples * 0.08))
      const release = Math.max(1, Math.floor(eventSamples * 0.18))

      for (let i = 0; i < eventSamples; i += 1) {
        const index = startSample + i
        if (index >= samples.length) break

        let envelope = 1
        if (i < attack) {
          envelope = i / attack
        } else if (i > eventSamples - release) {
          envelope = (eventSamples - i) / release
        }

        const t = i / sampleRate
        const harmonic =
          Math.sin(2 * Math.PI * frequency * t) * 0.68 +
          Math.sin(2 * Math.PI * frequency * 2 * t) * 0.18 +
          Math.sin(2 * Math.PI * frequency * 0.5 * t) * 0.14

        samples[index] += harmonic * envelope * event.velocity * 0.45
      }
    }

    let peak = 0
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]))
    }
    if (peak > 1) {
      const normalize = 1 / peak
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] *= normalize
      }
    }

    const blob = encodeWavPcm16(samples, sampleRate)
    const url = URL.createObjectURL(blob)
    fallbackAudioUrlRef.current = url

    const audio = new Audio(url)
    audio.volume = 1
    fallbackAudioElementRef.current = audio

    try {
      await audio.play()
      setIsPlayingSheet(true)
      stopTimerRef.current = window.setTimeout(() => {
        stopSheetPlayback()
      }, totalSeconds * 1000 + 150)
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Unable to play AI melody')
      stopSheetPlayback()
    }
  }

  const playDisturbingMusic = async () => {
    setPlaybackError(null)
    stopSheetPlayback()

    const sampleRate = 44100
    const totalSeconds = 10
    const totalSamples = Math.floor(sampleRate * totalSeconds)
    const samples = new Float32Array(totalSamples)

    const seedArray = new Uint32Array(1)
    crypto.getRandomValues(seedArray)
    let seed = seedArray[0] || Date.now()
    const rng = () => {
      seed += 0x6D2B79F5
      let temp = seed
      temp = Math.imul(temp ^ (temp >>> 15), temp | 1)
      temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61)
      return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296
    }
    const randomInRange = (min: number, max: number) => min + rng() * (max - min)
    const eventCount = 26

    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const startSec = randomInRange(0, totalSeconds - 0.2)
      const durationSec = randomInRange(0.18, 1.1)
      const startSample = Math.floor(startSec * sampleRate)
      const eventSamples = Math.floor(durationSec * sampleRate)

      const baseFreq = randomInRange(90, 980)
      const detuneRatio = randomInRange(1.03, 1.18)
      const fmFreq = randomInRange(3, 27)
      const fmDepth = randomInRange(8, 90)
      const noiseMix = randomInRange(0.08, 0.32)
      const gain = randomInRange(0.2, 0.55)

      for (let i = 0; i < eventSamples; i += 1) {
        const idx = startSample + i
        if (idx >= samples.length) break

        const t = i / sampleRate
        const globalT = (startSample + i) / sampleRate
        const envelope = Math.exp(-3.2 * (i / Math.max(1, eventSamples)))

        const fm = Math.sin(2 * Math.PI * fmFreq * t) * fmDepth
        const carrierA = Math.sin(2 * Math.PI * (baseFreq + fm) * t)
        const carrierB = Math.sin(2 * Math.PI * ((baseFreq * detuneRatio) - fm * 0.6) * t)
        const sub = Math.sin(2 * Math.PI * (baseFreq * 0.5) * t + Math.sin(globalT * 0.7))
        const noise = (rng() * 2 - 1) * noiseMix

        const value = (carrierA * 0.48 + carrierB * 0.34 + sub * 0.18 + noise) * envelope * gain
        samples[idx] += value
      }
    }

    const fartBursts = 8
    for (let burstIndex = 0; burstIndex < fartBursts; burstIndex += 1) {
      const startSec = randomInRange(0.1, totalSeconds - 0.25)
      const durationSec = randomInRange(0.14, 0.38)
      const startSample = Math.floor(startSec * sampleRate)
      const burstSamples = Math.floor(durationSec * sampleRate)

      const startFreq = randomInRange(110, 190)
      const endFreq = randomInRange(35, 70)
      const noiseAmount = randomInRange(0.22, 0.5)
      const burstGain = randomInRange(0.18, 0.36)

      for (let i = 0; i < burstSamples; i += 1) {
        const idx = startSample + i
        if (idx >= samples.length) break

        const progress = i / Math.max(1, burstSamples - 1)
        const freq = startFreq + (endFreq - startFreq) * progress
        const t = i / sampleRate

        const body = Math.sin(2 * Math.PI * freq * t)
        const wobble = Math.sin(2 * Math.PI * freq * 1.8 * t + Math.sin(progress * 16))
        const sputterNoise = (rng() * 2 - 1) * noiseAmount

        const attack = Math.min(1, i / Math.max(1, Math.floor(burstSamples * 0.18)))
        const decay = Math.max(0, 1 - progress)
        const envelope = attack * decay

        const burstSample = (body * 0.5 + wobble * 0.3 + sputterNoise * 0.45) * envelope * burstGain
        samples[idx] += burstSample
      }
    }

    let peak = 0
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]))
    }
    if (peak > 1) {
      const normalize = 1 / peak
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] *= normalize
      }
    }

    const blob = encodeWavPcm16(samples, sampleRate)
    const url = URL.createObjectURL(blob)
    fallbackAudioUrlRef.current = url

    const audio = new Audio(url)
    audio.volume = 1
    fallbackAudioElementRef.current = audio

    try {
      await audio.play()
      setIsPlayingSheet(true)
      stopTimerRef.current = window.setTimeout(() => {
        stopSheetPlayback()
      }, totalSeconds * 1000 + 150)
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Unable to play disturbing music')
      stopSheetPlayback()
    }
  }

  const playWithHtmlAudioFallback = async () => {
    const sampleRate = 44100
    const totalSeconds = getTotalPlaybackSeconds(detectedNotes, bpm)
    const totalSamples = Math.max(1, Math.ceil(totalSeconds * sampleRate))
    const samples = new Float32Array(totalSamples)

    let cursor = 0
    for (const note of detectedNotes) {
      const durationSec = notePlaybackSeconds(note)
      const noteSamples = Math.max(1, Math.floor(durationSec * sampleRate))
      const frequency = noteFrequencyHz(note)
      const attackSamples = Math.max(1, Math.floor(noteSamples * 0.05))
      const releaseSamples = Math.max(1, Math.floor(noteSamples * 0.1))

      for (let i = 0; i < noteSamples && cursor + i < samples.length; i += 1) {
        let envelope = 1
        if (i < attackSamples) {
          envelope = i / attackSamples
        } else if (i > noteSamples - releaseSamples) {
          envelope = (noteSamples - i) / releaseSamples
        }

        const t = i / sampleRate
        const wave = sampleInstrumentWave(frequency, t, instrument)
        samples[cursor + i] += wave * envelope * 0.35
      }

      cursor += noteSamples
      if (cursor >= samples.length) {
        break
      }
    }

    let peak = 0
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]))
    }
    if (peak > 1) {
      const normalizer = 1 / peak
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] *= normalizer
      }
    }

    const wavBlob = encodeWavPcm16(samples, sampleRate)
    const url = URL.createObjectURL(wavBlob)
    fallbackAudioUrlRef.current = url

    const audio = new Audio(url)
    audio.volume = 1
    fallbackAudioElementRef.current = audio

    await audio.play()

    const totalMs = Math.ceil((cursor / sampleRate) * 1000)
    setIsPlayingSheet(true)
    stopTimerRef.current = window.setTimeout(() => {
      stopSheetPlayback()
    }, totalMs + 120)
  }

  const playWithWebAudioFallback = async () => {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      throw new Error('Web Audio API is not available in this browser')
    }

    const audioContext = new AudioCtx()
    fallbackAudioContextRef.current = audioContext
    await audioContext.resume()

    const masterGain = audioContext.createGain()
    masterGain.gain.value = 0.25
    masterGain.connect(audioContext.destination)

    let startAt = audioContext.currentTime + 0.05
    let totalDuration = 0
    for (const note of detectedNotes) {
      const durationSec = notePlaybackSeconds(note)
      const frequency = note.frequency > 0 ? note.frequency : 440

      const osc = audioContext.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = frequency

      const env = audioContext.createGain()
      env.gain.setValueAtTime(0.0001, startAt)
      env.gain.exponentialRampToValueAtTime(0.8, startAt + 0.015)
      env.gain.exponentialRampToValueAtTime(0.0001, startAt + Math.max(0.08, durationSec))

      osc.connect(env)
      env.connect(masterGain)
      osc.start(startAt)
      osc.stop(startAt + Math.max(0.1, durationSec) + 0.02)
      fallbackOscillatorsRef.current.push(osc)

      startAt += durationSec
      totalDuration += durationSec
    }

    const totalMs = Math.ceil(totalDuration * 1000)
    setIsPlayingSheet(true)
    stopTimerRef.current = window.setTimeout(() => {
      stopSheetPlayback()
    }, totalMs + 120)
  }

  const playSheetNotes = async () => {
    if (!hasNotes || isPlayingSheet) return

    setPlaybackError(null)
    stopSheetPlayback()

    try {
      await playWithHtmlAudioFallback()
    } catch (htmlErr) {
      try {
        await playWithWebAudioFallback()
      } catch (webAudioErr) {
        const htmlMessage = htmlErr instanceof Error ? htmlErr.message : 'Audio element playback failed'
        const webAudioMessage = webAudioErr instanceof Error ? webAudioErr.message : 'WebAudio playback failed'
        setPlaybackError(`Playback failed (${htmlMessage}; ${webAudioMessage})`)
        stopSheetPlayback()
      }
    }
  }

  useEffect(() => {
    if (isPlayingSheet) {
      stopSheetPlayback()
    }
  }, [instrument])

  useEffect(() => {
    return () => {
      stopSheetPlayback()
      stopMetronome()
    }
  }, [])

  const stateColor: Record<string, string> = {
    idle: 'secondary',
    recording: 'default',
    paused: 'outline',
    stopped: 'secondary',
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
            <Music className="h-7 w-7 text-purple-400" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Realtime Music Sheets</h1>
              <p className="text-xs text-purple-300/70">Sing → Score · AI-powered audio transcription</p>
            </div>
            <div className="ml-auto">
              <Badge variant={stateColor[recordingState] as 'default' | 'secondary' | 'outline'}>
                {recordingState === 'idle' && 'Ready'}
                {recordingState === 'recording' && '● Recording'}
                {recordingState === 'paused' && '⏸ Paused'}
                {recordingState === 'stopped' && '■ Stopped'}
              </Badge>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <strong>Microphone Error:</strong> {error}. Please allow microphone access and try again.
            </div>
          )}

          {/* Controls Card */}
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm text-white">
            <CardHeader className="pb-4">
              <CardTitle className="text-white">Recording Controls</CardTitle>
              <CardDescription className="text-purple-300/70">
                Start singing or playing an instrument to generate your sheet music in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* BPM Slider */}
              <div className="flex items-center gap-4">
                <label className="text-sm text-purple-200 w-24 shrink-0">
                  Tempo: <strong>{bpm} BPM</strong>
                </label>
                <input
                  type="range"
                  min={40}
                  max={240}
                  value={bpm}
                  onChange={e => setBpm(Number(e.target.value))}
                  disabled={isRecording || isPaused}
                  className="flex-1 accent-purple-500"
                />
              </div>

              {/* Volume Meter */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Input Level</p>
                <Progress value={volume} className="h-2 bg-white/10" />
              </div>

              {/* Visualizer */}
              <div className="flex justify-center">
                <AudioVisualizer
                  volume={volume}
                  isActive={isRecording}
                  currentNote={currentNote}
                  currentFrequency={currentFrequency}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {isIdle && (
                  <Button size="lg" onClick={startRecording} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    <Mic className="h-5 w-5" />
                    Start Recording
                  </Button>
                )}

                {isRecording && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="lg" variant="outline" onClick={pauseRecording} className="gap-2 border-white/20 text-white hover:bg-white/10">
                          <Pause className="h-5 w-5" />
                          Pause
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Pause recording</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="lg" variant="destructive" onClick={stopRecording} className="gap-2">
                          <Square className="h-5 w-5" />
                          Stop
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Stop and finalise</TooltipContent>
                    </Tooltip>
                  </>
                )}

                {isPaused && (
                  <>
                    <Button size="lg" onClick={resumeRecording} className="gap-2 bg-purple-600 hover:bg-purple-700">
                      <Play className="h-5 w-5" />
                      Resume
                    </Button>
                    <Button size="lg" variant="destructive" onClick={stopRecording} className="gap-2">
                      <Square className="h-5 w-5" />
                      Stop
                    </Button>
                  </>
                )}

                {isStopped && (
                  <Button size="lg" variant="outline" onClick={resetRecording} className="gap-2 border-white/20 text-white hover:bg-white/10">
                    <RotateCcw className="h-5 w-5" />
                    New Recording
                  </Button>
                )}

                {(isRecording || isPaused) && (
                  <Button size="sm" variant="ghost" onClick={resetRecording} className="text-muted-foreground hover:text-white">
                    <MicOff className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>

              <div className="rounded-md border border-white/10 bg-slate-900/40 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-purple-100">Metronome</p>
                  <Button
                    size="sm"
                    onClick={toggleMetronome}
                    className="gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    {isMetronomeOn ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isMetronomeOn ? 'Stop Metronome' : 'Start Metronome'}
                  </Button>
                  <Badge variant="outline" className="border-white/20 text-white">
                    {metronomeTempo} BPM · {metronomeBeatsPerBar}/4
                  </Badge>
                </div>

                <div className="flex items-center gap-4">
                  <label className="text-sm text-purple-200 w-32 shrink-0">
                    Tempo: <strong>{metronomeTempo}</strong>
                  </label>
                  <input
                    type="range"
                    min={40}
                    max={240}
                    value={metronomeTempo}
                    onChange={e => setMetronomeTempo(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-purple-200">Sound</label>
                  <select
                    value={metronomeSound}
                    onChange={e => setMetronomeSound(e.target.value as MetronomeSound)}
                    className="rounded-md border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    <option value="click">Click</option>
                    <option value="beep">Beep</option>
                    <option value="wood">Wood</option>
                  </select>

                  <label className="text-sm text-purple-200">Beats / Bar</label>
                  <select
                    value={metronomeBeatsPerBar}
                    onChange={e => setMetronomeBeatsPerBar(Number(e.target.value))}
                    className="rounded-md border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    <option value={2}>2/4</option>
                    <option value={3}>3/4</option>
                    <option value={4}>4/4</option>
                    <option value={6}>6/4</option>
                  </select>

                  <label className="text-sm text-purple-200">Volume</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(metronomeVolume * 100)}
                    onChange={e => setMetronomeVolume(Number(e.target.value) / 100)}
                    className="w-36 accent-purple-500"
                  />

                  <label className="inline-flex items-center gap-2 text-sm text-purple-200">
                    <input
                      type="checkbox"
                      checked={metronomeAccent}
                      onChange={e => setMetronomeAccent(e.target.checked)}
                      className="accent-purple-500"
                    />
                    Accent 1st Beat
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sheet Music + Notes */}
          <Tabs defaultValue="sheet">
            <TabsList className="bg-white/10 text-purple-200">
              <TabsTrigger value="sheet" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Sheet Music
              </TabsTrigger>
              <TabsTrigger value="notes" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                Note Log ({detectedNotes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sheet">
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white text-base">Live Transcription</CardTitle>
                  <CardDescription className="text-purple-300/70">
                    {hasNotes
                      ? `${detectedNotes.length} note${detectedNotes.length !== 1 ? 's' : ''} detected — showing live multi-measure score`
                      : 'Start recording to see notes appear here in real time'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {playbackError && (
                    <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                      {playbackError}
                    </div>
                  )}
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-purple-200">
                    <Badge variant="outline" className="border-white/20 text-white">
                      Key: {musicalContext.keySignatureLabel}
                    </Badge>
                    <Badge variant="outline" className="border-white/20 text-white">
                      Time: {musicalContext.timeSignature}
                    </Badge>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label className="text-sm text-purple-200">
                      Instrument
                    </label>
                    <select
                      value={instrument}
                      onChange={e => setInstrument(e.target.value as SheetInstrument)}
                      disabled={isPlayingSheet}
                      className="rounded-md border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                    >
                      {SHEET_INSTRUMENTS.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={playSheetNotes}
                      disabled={!hasNotes || isPlayingSheet}
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      <Play className="h-4 w-4" />
                      Play Sheet
                    </Button>
                    <Button
                      variant="outline"
                      onClick={stopSheetPlayback}
                      disabled={!isPlayingSheet}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Square className="h-4 w-4" />
                      Stop Playback
                    </Button>
                    <Button
                      variant="outline"
                      onClick={generateAudioProbe}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Play className="h-4 w-4" />
                      Generate Test Tone
                    </Button>
                    <Button
                      variant="outline"
                      onClick={playAiGeneratedMelody}
                      disabled={isPlayingSheet}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Play className="h-4 w-4" />
                      Play AI Melody (15s)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={playDisturbingMusic}
                      disabled={isPlayingSheet}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Play className="h-4 w-4" />
                      Play Disturbing Music (10s)
                    </Button>
                  </div>
                  {audioProbeUrl && (
                    <div className="mb-4">
                      <p className="mb-1 text-xs text-purple-300/80">Audio Probe (click play on this control):</p>
                      <audio controls src={audioProbeUrl} className="w-full" />
                    </div>
                  )}
                  <div id="sheet-music-export-target">
                    <SheetMusicDisplay
                      notes={detectedNotes}
                      currentNote={isRecording ? currentNote : null}
                      keySignature={musicalContext.keySignature}
                      timeSignature={musicalContext.timeSignature}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white text-base">Detected Notes</CardTitle>
                  <CardDescription className="text-purple-300/70">
                    All notes captured during this session
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hasNotes ? (
                    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                      {detectedNotes.map((n, i) => (
                        <div
                          key={i}
                          className="rounded-md bg-purple-900/50 border border-purple-500/30 px-3 py-1.5 text-center"
                        >
                          <div className="font-bold text-purple-200 text-sm">{n.note}{n.octave}</div>
                          <div className="text-xs text-purple-400">{n.frequency.toFixed(0)} Hz</div>
                          {n.duration && (
                            <div className="text-xs text-purple-500/70">{n.duration.toFixed(0)} ms</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      No notes detected yet. Start recording and sing or play!
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Export Card */}
          {hasNotes && (
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white text-base">Export</CardTitle>
                <CardDescription className="text-purple-300/70">
                  Download your transcription in standard music formats
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => exportToMidi(detectedNotes, bpm)}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" />
                      Export MIDI
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download as .mid file for use in any DAW</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => exportToMusicXml(detectedNotes, bpm, musicalContext)}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" />
                      Export MusicXML
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download as .xml — open in MuseScore, Finale, Sibelius</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => exportToPdf(detectedNotes, bpm)}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" />
                      Export PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download the current sheet as .pdf</TooltipContent>
                </Tooltip>
              </CardContent>
            </Card>
          )}

          {/* Tips */}
          <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white text-sm">💡 Tips for Best Accuracy</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-purple-200/80">
                <li>🔇 <strong>Minimize background noise</strong> — a quiet environment gives cleaner results</li>
                <li>🎵 <strong>Sing "Ah" or "Dah"</strong> — neutral syllables help pitch tracking</li>
                <li>⏱ <strong>Set the right tempo</strong> before recording to align rhythms correctly</li>
                <li>✅ <strong>Check the key</strong> — export to MusicXML and refine in MuseScore</li>
              </ul>
            </CardContent>
          </Card>
        </main>
      </div>
    </TooltipProvider>
  )
}

