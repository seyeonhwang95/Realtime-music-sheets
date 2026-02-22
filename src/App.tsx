import { useState } from 'react'
import { Mic, MicOff, Square, Play, Pause, RotateCcw, Download, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SheetMusicDisplay } from '@/components/SheetMusicDisplay'
import { AudioVisualizer } from '@/components/AudioVisualizer'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { exportToMidi, exportToMusicXml } from '@/lib/exportUtils'

const BPM_DEFAULT = 120

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

  const isIdle = recordingState === 'idle'
  const isRecording = recordingState === 'recording'
  const isPaused = recordingState === 'paused'
  const isStopped = recordingState === 'stopped'
  const hasNotes = detectedNotes.length > 0

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
                      ? `${detectedNotes.length} note${detectedNotes.length !== 1 ? 's' : ''} detected — showing the last 8`
                      : 'Start recording to see notes appear here in real time'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SheetMusicDisplay
                    notes={detectedNotes}
                    currentNote={isRecording ? currentNote : null}
                  />
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
                      onClick={() => exportToMusicXml(detectedNotes, bpm)}
                      className="gap-2 border-white/20 text-white hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" />
                      Export MusicXML
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download as .xml — open in MuseScore, Finale, Sibelius</TooltipContent>
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

