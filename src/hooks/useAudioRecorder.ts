import { useRef, useState, useCallback } from 'react'
import { PitchDetector } from 'pitchy'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export interface DetectedNote {
  frequency: number
  note: string
  octave: number
  midi: number
  timestamp: number
  duration?: number
  clarity: number
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function frequencyToNote(frequency: number): { note: string; octave: number; midi: number } {
  const midi = Math.round(12 * Math.log2(frequency / 440) + 69)
  const octave = Math.floor(midi / 12) - 1
  const noteIndex = ((midi % 12) + 12) % 12
  return { note: NOTE_NAMES[noteIndex], octave, midi }
}

export function useAudioRecorder() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [detectedNotes, setDetectedNotes] = useState<DetectedNote[]>([])
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null)
  const [currentNote, setCurrentNote] = useState<string | null>(null)
  const [volume, setVolume] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastNoteRef = useRef<DetectedNote | null>(null)
  const noteStartTimeRef = useRef<number | null>(null)
  const minNoteDurationMs = 80
  const clarityThreshold = 0.92

  const stopAnalysis = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const startAnalysis = useCallback((analyser: AnalyserNode) => {
    const bufferLength = analyser.fftSize
    const buffer = new Float32Array(bufferLength)
    const detector = PitchDetector.forFloat32Array(bufferLength)
    const sampleRate = analyser.context.sampleRate

    const analyse = () => {
      analyser.getFloatTimeDomainData(buffer)

      // Calculate RMS volume
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += buffer[i] * buffer[i]
      }
      const rms = Math.sqrt(sum / bufferLength)
      setVolume(Math.min(100, Math.round(rms * 400)))

      const [frequency, clarity] = detector.findPitch(buffer, sampleRate)

      if (clarity > clarityThreshold && frequency > 50 && frequency < 2000) {
        const { note, octave, midi } = frequencyToNote(frequency)
        const noteWithOctave = `${note}${octave}`
        setCurrentFrequency(frequency)
        setCurrentNote(noteWithOctave)

        const now = performance.now()

        if (
          lastNoteRef.current?.note !== noteWithOctave ||
          !noteStartTimeRef.current
        ) {
          // New note detected
          if (lastNoteRef.current && noteStartTimeRef.current) {
            const duration = now - noteStartTimeRef.current
            if (duration >= minNoteDurationMs) {
              setDetectedNotes(prev => [
                ...prev,
                { ...lastNoteRef.current!, duration },
              ])
            }
          }
          lastNoteRef.current = {
            frequency,
            note,
            octave,
            midi,
            timestamp: now,
            clarity,
          }
          noteStartTimeRef.current = now
        }
      } else {
        // Silence / unclear
        if (lastNoteRef.current && noteStartTimeRef.current) {
          const duration = performance.now() - noteStartTimeRef.current
          if (duration >= minNoteDurationMs) {
            const note = lastNoteRef.current
            setDetectedNotes(prev => [...prev, { ...note, duration }])
          }
          lastNoteRef.current = null
          noteStartTimeRef.current = null
        }
        setCurrentFrequency(null)
        setCurrentNote(null)
      }

      animationFrameRef.current = requestAnimationFrame(analyse)
    }

    animationFrameRef.current = requestAnimationFrame(analyse)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      analyserRef.current = analyser

      setDetectedNotes([])
      setRecordingState('recording')
      startAnalysis(analyser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [startAnalysis])

  const pauseRecording = useCallback(() => {
    stopAnalysis()
    audioContextRef.current?.suspend()
    setRecordingState('paused')
    setCurrentFrequency(null)
    setCurrentNote(null)
    setVolume(0)
  }, [stopAnalysis])

  const resumeRecording = useCallback(() => {
    if (analyserRef.current && audioContextRef.current) {
      audioContextRef.current.resume()
      startAnalysis(analyserRef.current)
      setRecordingState('recording')
    }
  }, [startAnalysis])

  const stopRecording = useCallback(() => {
    stopAnalysis()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    streamRef.current = null
    audioContextRef.current = null
    analyserRef.current = null
    lastNoteRef.current = null
    noteStartTimeRef.current = null
    setRecordingState('stopped')
    setCurrentFrequency(null)
    setCurrentNote(null)
    setVolume(0)
  }, [stopAnalysis])

  const resetRecording = useCallback(() => {
    stopAnalysis()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    streamRef.current = null
    audioContextRef.current = null
    analyserRef.current = null
    lastNoteRef.current = null
    noteStartTimeRef.current = null
    setDetectedNotes([])
    setRecordingState('idle')
    setCurrentFrequency(null)
    setCurrentNote(null)
    setVolume(0)
    setError(null)
  }, [stopAnalysis])

  return {
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
  }
}
