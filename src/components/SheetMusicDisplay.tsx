import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Formatter, Accidental, Voice } from 'vexflow'
import type { DetectedNote } from '@/hooks/useAudioRecorder'

interface SheetMusicDisplayProps {
  notes: DetectedNote[]
  currentNote?: string | null
  keySignature?: string
  timeSignature?: string
}

// Convert a MIDI number / note name to VexFlow-compatible key string
function noteToVexKey(note: string, octave: number): string {
  // VexFlow uses format "c/4", "c#/4", etc.
  return `${note.toLowerCase()}/${octave}`
}

// Convert duration (ms) to VexFlow duration string
function durationToVexDuration(durationMs?: number): string {
  if (!durationMs) return 'q'
  if (durationMs >= 1800) return 'w'
  if (durationMs >= 900) return 'h'
  if (durationMs >= 450) return 'q'
  return '8'
}

const MAX_RENDER_NOTES = 64
const MEASURES_PER_LINE_WIDE = 4
const MEASURES_PER_LINE_NARROW = 2
const STAVE_WIDTH_WIDE = 1040
const STAVE_WIDTH_NARROW = 720
const STAVE_HEIGHT = 120

function getMeasureBeatCapacity(timeSignature: string): number {
  const [beatsPart, beatTypePart] = timeSignature.split('/')
  const beats = Number(beatsPart) || 4
  const beatType = Number(beatTypePart) || 4
  return (beats * 4) / beatType
}

function noteDurationToBeats(durationMs?: number): number {
  if (!durationMs) return 1
  if (durationMs >= 1800) return 4
  if (durationMs >= 900) return 2
  if (durationMs >= 450) return 1
  return 0.5
}

export function SheetMusicDisplay({
  notes,
  currentNote,
  keySignature = 'C',
  timeSignature = '4/4',
}: SheetMusicDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!containerRef.current) return

    containerRef.current.innerHTML = ''

    const displayNotes = notes.slice(-MAX_RENDER_NOTES)
    if (displayNotes.length === 0 && !currentNote) {
      // Draw empty staff
      renderEmptyStave(containerRef.current, keySignature, timeSignature)
      return
    }

    try {
      const measureBeatCapacity = getMeasureBeatCapacity(timeSignature)
      const measures: DetectedNote[][] = []
      let currentMeasure: DetectedNote[] = []
      let currentBeats = 0

      const pushCurrentMeasure = () => {
        if (currentMeasure.length > 0) {
          measures.push(currentMeasure)
          currentMeasure = []
          currentBeats = 0
        }
      }

      for (const note of displayNotes) {
        const noteBeats = noteDurationToBeats(note.duration)
        const wouldOverflow = currentMeasure.length > 0 && currentBeats + noteBeats > measureBeatCapacity + 0.001

        if (wouldOverflow) {
          pushCurrentMeasure()
        }

        currentMeasure.push(note)
        currentBeats += noteBeats

        if (Math.abs(currentBeats - measureBeatCapacity) <= 0.001 || currentBeats > measureBeatCapacity) {
          pushCurrentMeasure()
        }
      }

      pushCurrentMeasure()

      if (measures.length === 0) {
        measures.push([])
      }

      if (currentNote) {
        const noteMatch = currentNote.match(/^([A-G]#?)(\d+)$/)
        if (noteMatch) {
          const [, noteName, oct] = noteMatch
          const currentDetectedNote: DetectedNote = {
            note: noteName,
            octave: parseInt(oct),
            midi: 0,
            frequency: 0,
            timestamp: performance.now(),
            clarity: 1,
            duration: 500,
          }

          const previewBeats = noteDurationToBeats(currentDetectedNote.duration)
          const lastMeasure = measures[measures.length - 1]
          const lastMeasureBeats = lastMeasure.reduce((sum, note) => sum + noteDurationToBeats(note.duration), 0)

          if (lastMeasureBeats + previewBeats > measureBeatCapacity + 0.001) {
            measures.push([currentDetectedNote])
          } else {
            lastMeasure.push(currentDetectedNote)
          }
        }
      }

      const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG)
      const containerWidth = containerRef.current.clientWidth
      const measuresPerLine = containerWidth < 900 ? MEASURES_PER_LINE_NARROW : MEASURES_PER_LINE_WIDE
      const staveLineWidth = measuresPerLine === MEASURES_PER_LINE_WIDE ? STAVE_WIDTH_WIDE : STAVE_WIDTH_NARROW

      const rowCount = Math.max(1, Math.ceil(measures.length / measuresPerLine))
      renderer.resize(staveLineWidth + 50, rowCount * STAVE_HEIGHT + 40)
      const context = renderer.getContext()
      context.setFont('Arial', 10, '')

      const measureWidth = Math.floor(staveLineWidth / measuresPerLine)

      measures.forEach((measureNotes, measureIndex) => {
        const rowIndex = Math.floor(measureIndex / measuresPerLine)
        const colIndex = measureIndex % measuresPerLine
        const y = 20 + rowIndex * STAVE_HEIGHT
        const x = 10 + colIndex * measureWidth
        const stave = new Stave(x, y, measureWidth)

        if (colIndex === 0) {
          stave.addClef('treble')
          if (keySignature && keySignature !== 'C') {
            stave.addKeySignature(keySignature)
          }
        }
        if (measureIndex === 0) {
          stave.addTimeSignature(timeSignature)
        }

        stave.setContext(context).draw()

        const vexNotes: StaveNote[] = measureNotes.map((n, idx) => {
          const key = noteToVexKey(n.note, n.octave)
          const dur = durationToVexDuration(n.duration)
          const staveNote = new StaveNote({
            keys: [key],
            duration: dur,
          })

          if (n.note.includes('#')) {
            staveNote.addModifier(new Accidental('#'))
          }

          const isCurrentPreview =
            !!currentNote && measureIndex === measures.length - 1 && idx === measureNotes.length - 1 && n.frequency === 0

          if (isCurrentPreview) {
            staveNote.setStyle({ fillStyle: '#7c3aed', strokeStyle: '#7c3aed' })
          }

          return staveNote
        })

        if (vexNotes.length > 0) {
          const [beatsPart, beatTypePart] = timeSignature.split('/')
          const voice = new Voice({
            numBeats: Number(beatsPart) || 4,
            beatValue: Number(beatTypePart) || 4,
          })
          voice.setStrict(false)
          voice.addTickables(vexNotes)
          new Formatter().joinVoices([voice]).formatToStave([voice], stave)
          voice.draw(context, stave)
        }
      })
    } catch {
      // If rendering fails (e.g., note out of range), fallback to empty stave
      renderEmptyStave(containerRef.current!, keySignature, timeSignature)
    }
  }, [notes, currentNote, keySignature, timeSignature])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto rounded-lg bg-white p-2 shadow-inner"
      style={{ minHeight: STAVE_HEIGHT + 40 }}
    />
  )
}

function renderEmptyStave(container: HTMLDivElement, keySignature: string, timeSignature: string) {
  try {
    const containerWidth = container.clientWidth
    const staveWidth = containerWidth < 900 ? STAVE_WIDTH_NARROW : STAVE_WIDTH_WIDE
    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(staveWidth + 50, STAVE_HEIGHT + 40)
    const context = renderer.getContext()
    const stave = new Stave(10, 20, staveWidth)
    stave.addClef('treble')
    if (keySignature && keySignature !== 'C') {
      stave.addKeySignature(keySignature)
    }
    stave.addTimeSignature(timeSignature)
    stave.setContext(context).draw()
  } catch {
    // ignore
  }
}
