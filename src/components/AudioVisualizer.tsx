import { useEffect, useRef } from 'react'

interface AudioVisualizerProps {
  volume: number
  isActive: boolean
  currentNote?: string | null
  currentFrequency?: number | null
}

export function AudioVisualizer({
  volume,
  isActive,
  currentNote,
  currentFrequency,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barsRef = useRef<number[]>(Array(32).fill(0))
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      const bars = barsRef.current
      const barWidth = width / bars.length - 2

      // Animate bars towards target volume
      const targetMax = isActive ? volume / 2 : 0
      for (let i = 0; i < bars.length; i++) {
        const wave = Math.sin((Date.now() / 300) + i * 0.4) * 0.5 + 0.5
        const target = isActive ? targetMax * wave + Math.random() * 5 : 0
        bars[i] = bars[i] * 0.7 + target * 0.3
      }

      bars.forEach((barH, i) => {
        const x = i * (barWidth + 2)
        const h = Math.max(2, Math.min(barH, height * 0.9))
        const y = (height - h) / 2

        const gradient = ctx.createLinearGradient(0, y, 0, y + h)
        gradient.addColorStop(0, '#7c3aed')
        gradient.addColorStop(1, '#c4b5fd')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, h, 3)
        ctx.fill()
      })

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    }
  }, [volume, isActive])

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={80}
        className="rounded-lg bg-slate-900"
      />
      {currentNote && (
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-purple-400">{currentNote}</span>
          {currentFrequency && (
            <span className="text-sm text-muted-foreground">
              {currentFrequency.toFixed(1)} Hz
            </span>
          )}
        </div>
      )}
      {!currentNote && isActive && (
        <p className="text-sm text-muted-foreground animate-pulse">Listening…</p>
      )}
    </div>
  )
}
