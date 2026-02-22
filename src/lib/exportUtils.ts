import { Midi } from '@tonejs/midi'
import type { DetectedNote } from '@/hooks/useAudioRecorder'

export function exportToMidi(notes: DetectedNote[], bpm = 120): void {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  const track = midi.addTrack()

  let currentTime = 0
  const secondsPerBeat = 60 / bpm

  notes.forEach(note => {
    const durationSeconds = (note.duration ?? 500) / 1000
    const durationBeats = durationSeconds / secondsPerBeat

    track.addNote({
      midi: note.midi,
      time: currentTime,
      duration: durationBeats,
      velocity: Math.min(1, note.clarity),
    })

    currentTime += durationBeats
  })

  const midiArray = midi.toArray()
  const blob = new Blob([new Uint8Array(midiArray)], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'realtime-music-sheet.mid'
  a.click()
  URL.revokeObjectURL(url)
}

export function exportToMusicXml(notes: DetectedNote[], bpm = 120): void {
  const NOTE_NAMES_XML: Record<string, { step: string; alter?: number }> = {
    C: { step: 'C' },
    'C#': { step: 'C', alter: 1 },
    D: { step: 'D' },
    'D#': { step: 'D', alter: 1 },
    E: { step: 'E' },
    F: { step: 'F' },
    'F#': { step: 'F', alter: 1 },
    G: { step: 'G' },
    'G#': { step: 'G', alter: 1 },
    A: { step: 'A' },
    'A#': { step: 'A', alter: 1 },
    B: { step: 'B' },
  }

  const divisions = 4
  const secondsPerBeat = 60 / bpm

  const noteElements = notes.map(n => {
    const durationSeconds = (n.duration ?? 500) / 1000
    const durationBeats = durationSeconds / secondsPerBeat
    const xmlDuration = Math.max(1, Math.round(durationBeats * divisions))

    const noteType = xmlDuration >= 16 ? 'whole' : xmlDuration >= 8 ? 'half' : xmlDuration >= 4 ? 'quarter' : 'eighth'
    const info = NOTE_NAMES_XML[n.note] ?? { step: 'C' }

    return `    <note>
      <pitch>
        <step>${info.step}</step>
        ${info.alter !== undefined ? `<alter>${info.alter}</alter>` : ''}
        <octave>${n.octave}</octave>
      </pitch>
      <duration>${xmlDuration}</duration>
      <type>${noteType}</type>
    </note>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Voice</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no">
            <beat-unit>quarter</beat-unit>
            <per-minute>${bpm}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${bpm}"/>
      </direction>
${noteElements.join('\n')}
    </measure>
  </part>
</score-partwise>`

  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'realtime-music-sheet.xml'
  a.click()
  URL.revokeObjectURL(url)
}
