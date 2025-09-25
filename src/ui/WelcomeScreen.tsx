import React, { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

interface WelcomeScreenProps {
  onComplete: () => void
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const onCompleteRef = useRef(onComplete)
  const [logoError, setLogoError] = useState(false)
  const [logoSrcIndex, setLogoSrcIndex] = useState(0)
  const logoCandidates = [
    './Indian_Railways_Logo_Red_Variant.png',
    '/Indian_Railways_Logo_Red_Variant.png',
    './indian-railways-logo.png'
  ]

  // Keep latest onComplete without retriggering animations
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // Initialize audio context
  useEffect(() => {
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.warn('Audio context not supported:', error)
    }
  }, [])

  // Play welcome sound
  const playWelcomeSound = () => {
    if (!audioCtxRef.current) return

    const audioCtx = audioCtxRef.current
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()
    
    // Create a pleasant chime sound
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime) // A4 note
    oscillator.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.2) // C#5
    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.4) // E5
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2)
    
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 2)
  }

  // Play train whistle sound
  const playTrainWhistle = () => {
    if (!audioCtxRef.current) return

    const audioCtx = audioCtxRef.current
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()
    
    // Train whistle sound
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(200, audioCtx.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.5)
    oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 1)
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
    gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5)
    
    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    
    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 1.5)
  }

  // Main animation sequence (time-based ~4 seconds)
  useEffect(() => {
    // Play welcome sound immediately
    playWelcomeSound()

    const totalDurationMs = 4000
    const startTime = performance.now()
    let rafId = 0

    const tick = () => {
      const now = performance.now()
      const elapsed = now - startTime
      const pct = Math.min(100, (elapsed / totalDurationMs) * 100)
      setProgress(pct)

      if (elapsed < totalDurationMs) {
        rafId = requestAnimationFrame(tick)
      } else {
        setIsLoading(false)
        // brief pause for readability then complete
        setTimeout(() => { onCompleteRef.current() }, 250)
      }
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0a0f1f 0%, #1a2332 25%, #2d3748 50%, #1a2332 75%, #0a0f1f 100%)'
      }}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-orange-500/10 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-green-500/10 rounded-full blur-xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/5 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl bg-white/95 overflow-hidden">
            {!logoError ? (
              <img
                src={logoCandidates[logoSrcIndex]}
                alt="Indian Railways"
                className="w-20 h-20 object-contain"
                onError={() => {
                  if (logoSrcIndex < logoCandidates.length - 1) {
                    setLogoSrcIndex((i) => i + 1)
                  } else {
                    setLogoError(true)
                  }
                }}
              />
            ) : (
              <span className="text-4xl font-bold text-orange-600">🚂</span>
            )}
          </div>
          <div className="w-32 h-1 bg-gradient-to-r from-orange-500 to-green-500 rounded-full"></div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-white tracking-wider">
            <span className="bg-gradient-to-r from-orange-500 via-white to-green-500 bg-clip-text text-transparent">
              IRIS
            </span>
          </h1>
          <div className="text-2xl font-semibold text-gray-300 tracking-wide">
            INDIAN RAILWAY
          </div>
          <div className="text-xl font-medium text-gray-400 tracking-wider">
            INTELLIGENT SCANNER
          </div>
        </div>

        {/* Subtitle */}
        <div className="space-y-2">
          <div className="text-lg text-gray-300 font-medium">
            Welcome to the Future of Railway Monitoring
          </div>
          <div className="text-sm text-gray-400">
            Advanced AI-Powered Track Inspection System
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-80 mx-auto space-y-3">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Initializing Systems</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 via-white to-green-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500 text-center">
            {isLoading ? 'Loading modules...' : 'Ready to launch!'}
          </div>
        </div>
      </div>

      {/* Animated train */}
      <div className="absolute bottom-20 left-0 transform -translate-x-full animate-pulse">
        <div className="flex items-center space-x-2">
          <div className="w-16 h-8 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">🚂</span>
          </div>
          <div className="w-12 h-6 bg-gradient-to-r from-gray-600 to-gray-700 rounded"></div>
          <div className="w-12 h-6 bg-gradient-to-r from-gray-600 to-gray-700 rounded"></div>
          <div className="w-12 h-6 bg-gradient-to-r from-gray-600 to-gray-700 rounded"></div>
        </div>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-2">
        <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></div>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce delay-200"></div>
      </div>
    </div>
  )
}
