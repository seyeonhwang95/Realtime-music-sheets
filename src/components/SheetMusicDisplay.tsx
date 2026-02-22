import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Formatter, Accidental, Voice } from 'vexflow'
import type { DetectedNote } from '@/hooks/useAudioRecorder'

interface SheetMusicDisplayProps {
  notes: DetectedNote[]
  currentNote?: string | null
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

const NOTES_PER_MEASURE = 8
const MAX_RENDER_NOTES = 64
const STAVE_WIDTH = 700
const STAVE_HEIGHT = 120

export function SheetMusicDisplay({ notes, currentNote }: SheetMusicDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!containerRef.current) return

    containerRef.current.innerHTML = ''

    const displayNotes = notes.slice(-MAX_RENDER_NOTES)
    if (displayNotes.length === 0 && !currentNote) {
      // Draw empty staff
      renderEmptyStave(containerRef.current)
      return
    }

    try {
      const noteRows: DetectedNote[][] = []
      for (let i = 0; i < displayNotes.length; i += NOTES_PER_MEASURE) {
        noteRows.push(displayNotes.slice(i, i + NOTES_PER_MEASURE))
      }

      if (noteRows.length === 0) {
        noteRows.push([])
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

          const lastRow = noteRows[noteRows.length - 1]
          if (lastRow.length >= NOTES_PER_MEASURE) {
            noteRows.push([currentDetectedNote])
          } else {
            lastRow.push(currentDetectedNote)
          }
        }
      }

      const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG)
      renderer.resize(STAVE_WIDTH + 50, noteRows.length * STAVE_HEIGHT + 40)
      const context = renderer.getContext()
      context.setFont('Arial', 10, '')

      noteRows.forEach((rowNotes, rowIndex) => {
        const y = 20 + rowIndex * STAVE_HEIGHT
        const stave = new Stave(10, y, STAVE_WIDTH)
        stave.addClef('treble')
        if (rowIndex === 0) {
          stave.addTimeSignature('4/4')
        }
        stave.setContext(context).draw()

        const vexNotes: StaveNote[] = rowNotes.map((n, idx) => {
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
            !!currentNote && rowIndex === noteRows.length - 1 && idx === rowNotes.length - 1 && n.frequency === 0

          if (isCurrentPreview) {
            staveNote.setStyle({ fillStyle: '#7c3aed', strokeStyle: '#7c3aed' })
          }

          return staveNote
        })

        if (vexNotes.length > 0) {
          const voice = new Voice({ numBeats: Math.max(4, vexNotes.length), beatValue: 4 })
          voice.setStrict(false)
          voice.addTickables(vexNotes)
          new Formatter().joinVoices([voice]).format([voice], STAVE_WIDTH - 60)
          voice.draw(context, stave)
        }
      })
    } catch {
      // If rendering fails (e.g., note out of range), fallback to empty stave
      renderEmptyStave(containerRef.current!)
    }
  }, [notes, currentNote])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto rounded-lg bg-white p-2 shadow-inner"
      style={{ minHeight: STAVE_HEIGHT + 40 }}
    />
  )
}

function renderEmptyStave(container: HTMLDivElement) {
  try {
    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(STAVE_WIDTH + 50, STAVE_HEIGHT + 40)
    const context = renderer.getContext()
    const stave = new Stave(10, 20, STAVE_WIDTH)
    stave.addClef('treble').addTimeSignature('4/4')
    stave.setContext(context).draw()
  } catch {
    // ignore
  }
}
