import React, { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import Lenis from 'lenis'
import { connectAggregator, type AggregatorEvent } from './ws'
import L from 'leaflet'
import { WelcomeScreen } from './WelcomeScreen'
import { createVideoAnomalyDetector } from './ai'

const Header: React.FC<{ gps?: boolean; cam?: boolean; sensors?: boolean; onCamClick?: () => void }> = ({ gps = true, cam = true, sensors = true, onCamClick }) => {
	return (
		<div className="w-full px-5 py-3 flex items-center justify-between glass neon-edge mb-3">
			<div className="flex items-center gap-3">
				<div className="text-2xl tracking-widest font-bold text-gray-800">🇮🇳 ITMS COCKPIT</div>
				<div className="text-sm font-semibold text-gray-700">INDIAN RAILWAY INTELLIGENT SCANNER (IRIS)</div>
			</div>
			<div className="flex items-center gap-4">
				<div className="flex items-center gap-4 text-sm font-semibold">
					<span className={"px-3 py-1 rounded bg-gray-800 font-bold " + (gps ? 'text-white shadow-lg' : 'text-red-500')}>GPS</span>
					<button
						className={"px-3 py-1 rounded bg-gray-800 font-bold " + (cam ? 'text-white shadow-lg' : 'text-red-500')}
						onClick={onCamClick}
						title="Restart camera"
					>
						{cam ? 'CAM' : 'CAM OFF'}
					</button>
					<span className={"px-3 py-1 rounded bg-gray-800 font-bold " + (sensors ? 'text-white shadow-lg' : 'text-red-500')}>SENSORS</span>
				</div>
				<div className="flex items-center gap-2">
					<div className="w-8 h-5 rounded-sm shadow-lg overflow-hidden flex flex-col">
						<div className="h-1/3 bg-orange-500"></div>
						<div className="h-1/3 bg-white flex items-center justify-center">
							<div className="w-1 h-1 bg-blue-600 rounded-full"></div>
						</div>
						<div className="h-1/3 bg-green-500"></div>
					</div>
					<div className="text-sm font-bold text-gray-800">भारत</div>
				</div>
			</div>
		</div>
	)
}

const BadgeCard: React.FC<{ title: string; level: 'LOW' | 'MEDIUM' | 'HIGH'; location: string; chainage: string; time: string; panel: string }> = ({ title, level, location, chainage, time, panel }) => {
	const levelColor = level === 'HIGH' ? 'bg-pink-600 text-white' : level === 'MEDIUM' ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'
	return (
		<div className="glass neon-edge px-4 py-3 min-w-[360px]">
			<div className="flex items-center justify-between">
				<div className="text-lg text-gray-800 font-bold">{title}</div>
				<span className={`text-xs px-2 py-0.5 rounded font-semibold ${levelColor}`}>{level}</span>
			</div>
			<div className="mt-2 text-sm font-semibold text-gray-700 leading-5">
				<div>Location: {location}</div>
				<div>Chainage: {chainage}</div>
				<div>Time: {time}</div>
				<div>Panel: {panel}</div>
			</div>
		</div>
	)
}

type PanelId =
	| 'lidar'
	| 'track-front'
	| 'track-rear'
	| 'dpcm'
	| 'speedo'
	| 'imu'
	| 'map'
	| 'rfid'
	| 'export'
	| 'notifications'

export const App: React.FC = () => {
	const [showWelcome, setShowWelcome] = useState<boolean>(true)
	const [zoomed, setZoomed] = useState<PanelId | null>(null)
	const [camEnabled, setCamEnabled] = useState<boolean>(true)
	const [camRefreshKey, setCamRefreshKey] = useState<number>(0)
	const [speedKmph, setSpeedKmph] = useState<number>(0)
	const [chainage, setChainage] = useState<number>(0)
	const [imu, setImu] = useState<{ ax: number; ay: number; az: number } | null>(null)
	const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null)
	const [lastDefect, setLastDefect] = useState<AggregatorEvent | null>(null)
	const [toasts, setToasts] = useState<Array<{ id: number; title: string; level: 'LOW'|'MEDIUM'|'HIGH'; location: string; chainage: string; time: string; panel: string }>>([])
	const [notifLog, setNotifLog] = useState<Array<{ id: number; title: string; level: 'LOW'|'MEDIUM'|'HIGH'; location: string; chainage: string; time: string; panel: string }>>([])
    // When using upload playback, reflect play/pause to drive LIDAR animation
    const [playActive, setPlayActive] = useState<boolean>(false)
const panelRefs = useRef<Record<PanelId, HTMLDivElement | null>>({
		lidar: null, 'track-front': null, 'track-rear': null, dpcm: null, speedo: null, imu: null, map: null, rfid: null, export: null, notifications: null
})

	// Toggle zoom state for a given panel id
	function handleZoom(id: PanelId) {
		setZoomed((prev) => (prev === id ? null : id))
	}

	useEffect(() => {
		// Browser geolocation for laptop location
		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition((pos) => {
				setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude })
			})
			navigator.geolocation.watchPosition((pos) => {
				setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude })
			}, undefined, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 })
		}
		const lenis = new Lenis({ smoothWheel: true })
		function raf(time: number) { lenis.raf(time); requestAnimationFrame(raf) }
		requestAnimationFrame(raf)
		return () => { /* lenis cleanup handled internally */ }
	}, [])

    // Keep latest camEnabled for WS callback
	const camEnabledRef = useRef<boolean>(camEnabled)
	useEffect(() => { camEnabledRef.current = camEnabled }, [camEnabled])
    // Keep latest playActive for WS callback
    const playActiveRef = useRef<boolean>(playActive)
    useEffect(() => { playActiveRef.current = playActive }, [playActive])

	// Connect aggregator WebSocket
	useEffect(() => {
		const disconnect = connectAggregator((evt) => {
			if (evt.type === 'telemetry') {
				setSpeedKmph(evt.speed_kmph)
				setChainage(evt.chainage_m)
				setImu(evt.imu)
				setGps(evt.gps)
            } else if (evt.type === 'defect') {
                // Suppress backend defects when camera is ON, or when camera is OFF but upload is not playing
                if (camEnabledRef.current || !playActiveRef.current) return
				setLastDefect(evt)
				flashAlert(['track-front', 'map'])
				beep()
				const toast = {
					title: evt.class.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
					level: evt.severity.toUpperCase() as any,
					location: gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : '--',
					chainage: `${evt.chainage_m} m`,
					time: new Date().toLocaleTimeString(),
					panel: 'TRACK-MAPPING'
				}
				appendNotification(toast)
			}
		})
		return () => { disconnect() }
	}, [])

	useEffect(() => {
		// When no panel is zoomed, clear any prior effects and skip
		if (!zoomed) {
			gsap.set('.panel', { clearProps: 'filter,boxShadow,scale,zIndex' })
			return
		}
		const el = panelRefs.current[zoomed]
		if (!el) return
		const tl = gsap.timeline()
		tllabels(tl)
		// Backdrop to dim the UI and capture outside clicks
		const backdrop = document.createElement('div')
		backdrop.id = 'zoom-backdrop'
		backdrop.style.position = 'fixed'
		backdrop.style.inset = '0'
		backdrop.style.background = 'rgba(0,0,0,0.45)'
		backdrop.style.zIndex = '49'
		backdrop.style.opacity = '0'
		document.body.appendChild(backdrop)
		// prevent page scroll while zoomed
		const prevOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'

		// Animate the chosen panel to fullscreen using its starting rect
		const r = el.getBoundingClientRect()
		const targetPad = 12 // px padding around fullscreen panel
		const target = {
			left: targetPad,
			top: targetPad,
			width: Math.max(0, window.innerWidth - targetPad * 2),
			height: Math.max(0, window.innerHeight - targetPad * 2)
		}
		// Set initial fixed positioning matching current location so the tween is smooth
		gsap.set(el, { position: 'fixed', margin: 0, left: r.left, top: r.top, width: r.width, height: r.height, zIndex: 50 })
		tl.to(backdrop, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 'enter')
			.to(el, { left: target.left, top: target.top, width: target.width, height: target.height, boxShadow: '0 0 42px rgba(0,229,255,0.6)', duration: 0.35, ease: 'power2.out' }, 'enter')

		// Close on ESC or outside click while zoomed
		function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setZoomed(null) }
		function onDocClick(e: MouseEvent) { if (e.target === backdrop) setZoomed(null) }
		document.addEventListener('keydown', onKey)
		backdrop.addEventListener('mousedown', onDocClick, true)
		return () => {
			// Animate back to original flow position before clearing
			try {
				const end = el.getBoundingClientRect()
				gsap.set(el, { left: end.left, top: end.top })
			} catch {}
			tl.kill()
			document.removeEventListener('keydown', onKey)
			backdrop.removeEventListener('mousedown', onDocClick, true)
			if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop)
			document.body.style.overflow = prevOverflow
			gsap.set('.panel', { clearProps: 'filter,boxShadow,scale,zIndex,left,top,width,height,position,margin' })
		}
	}, [zoomed])

	function tllabels(tl: gsap.core.Timeline) { return tl.addLabel('enter', 0) }

	// Helper: reflow Leaflet map and recenter to latest GPS if available
	function reflowLeaflet() {
		try {
			const container = document.getElementById('mini-map') as any
			const map: L.Map | null = container?._leaflet_map || null
			const marker: L.Marker | null = container?._leaflet_marker || null
			if (!map) return
			map.invalidateSize()
			if (gps) {
				marker?.setLatLng([gps.lat, gps.lon])
				map.setView([gps.lat, gps.lon], map.getZoom() || 14, { animate: false })
			}
		} catch {}
	}

	// Ensure Leaflet resizes when the panel is zoomed to fullscreen
	useEffect(() => {
		if (zoomed !== 'map') return
		const kick = () => reflowLeaflet()
		// multiple passes to catch end of animation/layout
		const t0 = requestAnimationFrame(kick)
		const t1 = setTimeout(kick, 120)
		const t2 = setTimeout(kick, 320)
		window.addEventListener('resize', kick)
		return () => { cancelAnimationFrame(t0); clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', kick) }
	}, [zoomed])

	// After exiting zoom, reflow and recenter so current location is visible
	useEffect(() => {
		if (zoomed) return
		const kick = () => reflowLeaflet()
		const t1 = setTimeout(kick, 120)
		const t2 = setTimeout(kick, 360)
		return () => { clearTimeout(t1); clearTimeout(t2) }
	}, [zoomed])

	function flashAlert(ids: PanelId[]) {
		ids.forEach((id) => {
			const el = panelRefs.current[id]
			if (!el) return
			const tl = gsap.timeline()
			tl.to(el, { duration: 0.05, onStart: () => el.classList.add('warning-glow') })
				.to(el, { duration: 0.35, boxShadow: '0 0 32px rgba(255,59,59,0.8)' })
				.to(el, { duration: 0.35, clearProps: 'boxShadow', onComplete: () => el.classList.remove('warning-glow') })
		})
	}

	const audioCtx = useMemo(() => {
		if (typeof window === 'undefined') return null
		try { return new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null }
	}, [])

    function beep() {
        // Suppress sound when camera is ON, or when camera is OFF and no upload is playing
        if (camEnabledRef.current || !playActiveRef.current) return
        if (!audioCtx) return
		const o = audioCtx.createOscillator()
		const g = audioCtx.createGain()
		o.type = 'sawtooth'
		o.frequency.value = 880
		g.gain.setValueAtTime(0.001, audioCtx.currentTime)
		g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.01)
		g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35)
		o.connect(g).connect(audioCtx.destination)
		o.start()
		o.stop(audioCtx.currentTime + 0.4)
	}

	// Initialize Leaflet map once and update marker on GPS changes
	useEffect(() => {
		let map: L.Map | null = null
		let marker: L.Marker | null = null
		const container = document.getElementById('mini-map')
		if (!container) return
		
		// Create custom Indian Railways marker
		const indianMarker = L.divIcon({
			className: 'custom-indian-marker',
			html: '<div style="background: #FF9933; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #138808; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">🇮🇳</div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		})
		
		// Create map only once
		if (!(container as any)._leaflet_map) {
			map = L.map(container, { zoomControl: false, attributionControl: false })
			;(container as any)._leaflet_map = map
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
			
			marker = L.marker([22.57, 88.36], { icon: indianMarker }).addTo(map)
			;(container as any)._leaflet_marker = marker
			map.setView([22.57, 88.36], 14)
			setTimeout(() => {
				if (map) {
					map.invalidateSize()
					map.setView([22.57, 88.36], 14)
				}
			}, 100)
		} else {
			map = (container as any)._leaflet_map
			marker = (container as any)._leaflet_marker
		}
		
		if (gps && marker && map) {
			marker.setLatLng([gps.lat, gps.lon])
			map.setView([gps.lat, gps.lon], map.getZoom() || 14)
		}
		return () => { /* keep map persistent */ }
	}, [gps?.lat, gps?.lon])

	function pushToast(t: { title: string; level: 'LOW'|'MEDIUM'|'HIGH'; location: string; chainage: string; time: string; panel: string }) {
		const id = Date.now() + Math.floor(Math.random() * 1000)
		setToasts((prev) => [{ id, ...t }, ...prev].slice(0, 5))
		// auto-dismiss after 6 seconds
		setTimeout(() => { setToasts((prev) => prev.filter((x) => x.id !== id)) }, 6000)
	}

	function appendNotification(t: { title: string; level: 'LOW'|'MEDIUM'|'HIGH'; location: string; chainage: string; time: string; panel: string }) {
		const id = Date.now() + Math.floor(Math.random() * 1000)
		setNotifLog((prev) => [{ id, ...t }, ...prev].slice(0, 100))
	}

	// Show welcome screen first
	if (showWelcome) {
		return <WelcomeScreen onComplete={() => setShowWelcome(false)} />
	}

return (
	<>

		<Header
			onCamClick={() => {
				setCamEnabled((prev) => {
					const next = !prev
					if (next) setCamRefreshKey((k) => k + 1)
					return next
				})
			}}
			cam={camEnabled}
		/>

		<div className="hud-grid">
		<Panel id={'lidar'} title="LIDAR" onZoom={handleZoom} refCb={(el) => (panelRefs.current['lidar'] = el)}>
				<LidarBox active={playActive} />
			</Panel>
		<Panel id={'track-front'} title="Track View" onZoom={handleZoom} refCb={(el) => (panelRefs.current['track-front'] = el)}>
				{camEnabled ? (
					<CameraView
						key={`front-${camRefreshKey}`}
						label="Front High-FPS"
						mode="front-high-fps"
						initialFlip={true}
					/>
				) : (
					<UploadLoopPlayer
						onPlayChange={(p) => setPlayActive(p)}
						onIrregularity={(score) => {
							flashAlert(['track-front'])
							beep()
							const toast = {
								title: `Irregularity Detected (score ${score.toFixed(2)})`,
								level: 'MEDIUM' as const,
								location: gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : '--',
								chainage: `${chainage} m`,
								time: new Date().toLocaleTimeString(),
								panel: 'TRACK VIEW'
							}
							appendNotification(toast)
							pushToast(toast)
						}}
					/>
				)}
			</Panel>
		<Panel id={'track-rear'} title="Rear View" onZoom={handleZoom} refCb={(el) => (panelRefs.current['track-rear'] = el)}>
				{camEnabled ? (
					<CameraView
						key={`rear-${camRefreshKey}`}
						label="Rear Camera"
						mode="rear-normal"
						initialFlip={false}
					/>
				) : (
					<UploadLoopPlayer
						onPlayChange={(p) => setPlayActive(p)}
						onIrregularity={(score) => {
							flashAlert(['track-rear'])
							beep()
							const toast = {
								title: `Irregularity Detected (score ${score.toFixed(2)})`,
								level: 'MEDIUM' as const,
								location: gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : '--',
								chainage: `${chainage} m`,
								time: new Date().toLocaleTimeString(),
								panel: 'REAR VIEW'
							}
							appendNotification(toast)
							pushToast(toast)
						}}
					/>
				)}
			</Panel>
		<Panel id={'dpcm'} title="DPCM PULSE" onZoom={handleZoom} refCb={(el) => (panelRefs.current['dpcm'] = el)}>
				<DpcmGraph />
			</Panel>
		<Panel id={'speedo'} title="SPEEDOMETER" onZoom={handleZoom} refCb={(el) => (panelRefs.current['speedo'] = el)}>
				<Speedometer value={speedKmph} />
			</Panel>
		<Panel id={'imu'} title="IMU STUDY" onZoom={handleZoom} refCb={(el) => (panelRefs.current['imu'] = el)}>
			<ImuPanel imu={imu} />
		</Panel>
		<Panel id={'map'} title="map" onZoom={handleZoom} refCb={(el) => (panelRefs.current['map'] = el)}>
				<div className="w-full h-full flex flex-col p-1">
					<div id="mini-map" className="w-full flex-1" />
					<div className="text-xs font-semibold mt-1 text-gray-700 flex-shrink-0 pb-1">
						<div className="flex flex-col space-y-0.5">
							<div>📍 GPS: {gps ? `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}` : '--'}</div>
							<div>📏 Chainage: {chainage} m</div>
						</div>
						{gps && (
							<div className="text-xs font-medium mt-1 text-gray-600">
								🇮🇳 Indian Railways Network | Live Tracking Active
							</div>
						)}
					</div>
				</div>
			</Panel>
		<Panel id={'rfid'} title="RFID SYSTEM" onZoom={handleZoom} refCb={(el) => (panelRefs.current['rfid'] = el)}>
				<RfidCard />
			</Panel>
		<Panel id={'notifications'} title="NOTIFICATIONS" onZoom={handleZoom} refCb={(el) => (panelRefs.current['notifications'] = el)}>
				<div className="w-full h-full overflow-auto space-y-2 pr-2">
					{notifLog.length === 0 && <div className="text-sm font-semibold text-gray-700">No notifications yet</div>}
					{notifLog.map((n) => (
						<div key={n.id} className="glass px-3 py-2">
							<div className="flex items-center justify-between">
								<div className="text-sm text-gray-800 font-bold">{n.title}</div>
								<span className={`text-xs px-2 py-0.5 rounded font-semibold ${n.level === 'HIGH' ? 'bg-pink-600 text-white' : n.level === 'MEDIUM' ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'}`}>{n.level}</span>
							</div>
							<div className="mt-1 text-xs font-semibold text-gray-700 grid grid-cols-2 gap-x-3">
								<div>Location: {n.location}</div>
								<div>Chainage: {n.chainage}</div>
								<div>Time: {n.time}</div>
								<div>Panel: {n.panel}</div>
							</div>
						</div>
					))}
				</div>
			</Panel>
		</div>
	</>
	)
}

const Panel: React.FC<{ id: PanelId, title: string, onZoom: (id: PanelId) => void, refCb: (el: HTMLDivElement | null) => void, children?: React.ReactNode }> = ({ id, title, onZoom, refCb, children }) => {
	return (
		<div ref={refCb} className="panel glass neon-edge p-2">
			<div className="flex items-center justify-between text-xs uppercase tracking-wider mb-1">
				<span className="text-gray-800 font-bold text-lg">{title}</span>
				<button className="px-2 py-1 bg-gray-800 rounded hover:shadow-lg text-white font-semibold" onClick={() => onZoom(id)}>Zoom</button>
			</div>
			<div className="h-full min-h-28 flex items-center justify-center">
				{children ?? <span className="text-gray-700 font-semibold text-sm">Coming soon…</span>}
			</div>
		</div>
	)
}

const Speedometer: React.FC<{ value: number }> = ({ value }) => {
	const clamped = Math.max(0, Math.min(250, value || 0))
	const progressPercentage = (clamped / 250) * 100
	
	// Determine speed zone color (replaced yellow with blue)
	const getSpeedZoneColor = (speed: number) => {
		if (speed <= 50) return 'text-green-600'
		if (speed <= 100) return 'text-blue-600'
		if (speed <= 150) return 'text-orange-600'
		return 'text-red-600'
	}

	const getProgressBarColor = (speed: number) => {
		if (speed <= 50) return 'bg-green-500'
		if (speed <= 100) return 'bg-blue-500'
		if (speed <= 150) return 'bg-orange-500'
		return 'bg-red-500'
	}

	return (
		<div className="relative w-full h-full flex flex-col items-center justify-center p-4">
			{/* Main Digital Speed Display */}
			<div className="text-center mb-4">
				<div 
					className={`text-6xl font-bold font-mono ${getSpeedZoneColor(clamped)}`}
					style={{ 
						textShadow: '0 0 20px rgba(0,0,0,0.3)',
						fontFamily: 'Orbitron, monospace'
					}}
				>
					{clamped.toFixed(1)}
				</div>
				<div className="text-2xl font-semibold text-gray-600 mt-2">
					km/h
				</div>
			</div>

			{/* Speed Progress Bar */}
			<div className="w-full max-w-48 mb-4">
				<div className="flex justify-between text-xs text-gray-500 mb-1">
					<span>0</span>
					<span>50</span>
					<span>100</span>
					<span>150</span>
					<span>200</span>
					<span>250</span>
				</div>
				<div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
					<div 
						className={`h-full transition-all duration-500 ease-out ${getProgressBarColor(clamped)}`}
						style={{ width: `${progressPercentage}%` }}
					/>
				</div>
			</div>

			{/* Speed Zone Indicator */}
			<div className="text-center">
				<div className={`text-sm font-semibold ${getSpeedZoneColor(clamped)}`}>
					{clamped <= 50 ? 'SAFE ZONE' : 
					 clamped <= 100 ? 'NORMAL SPEED' : 
					 clamped <= 150 ? 'CAUTION ZONE' : 'HIGH SPEED'}
				</div>
				<div className="text-xs text-gray-500 mt-1">
					Max: 250 km/h
				</div>
			</div>
		</div>
	)
}

// DPCM pulse graph driven by 'ai-score' events
const DpcmGraph: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [defectDensity, setDefectDensity] = useState<number>(0)
    const [pulseRateHz, setPulseRateHz] = useState<number>(0)
    const valuesRef = useRef<number[]>([])
    const timesRef = useRef<number[]>([])
    const actValsRef = useRef<number[]>([]) // activation samples (0/1)
    const actTimesRef = useRef<number[]>([])

    useEffect(() => {
        function onScore(e: Event) {
            const detail = (e as CustomEvent).detail as { score: number; ts: number; threshold?: number }
            const score = Math.max(0, Math.min(1, detail.score || 0))
            const ts = detail.ts || Date.now()
            if (typeof detail.threshold === 'number') (window as any).__ai_threshold = detail.threshold
            valuesRef.current.push(score)
            timesRef.current.push(ts)
            if (valuesRef.current.length > 300) { valuesRef.current.shift(); timesRef.current.shift() }

            // compute defect density over last 8s using current threshold (with small tolerance)
            const windowMs = 8000
            const cutoff = ts - windowMs
            let startIdx = 0
            while (startIdx < timesRef.current.length && timesRef.current[startIdx] < cutoff) startIdx++
            const vals = valuesRef.current.slice(startIdx)
            const thrUse = (window as any).__ai_threshold ?? 0.4
            const tol = 0.04
            const over = vals.filter((v) => v > Math.max(0, thrUse - tol)).length
            const pct = (over / Math.max(1, vals.length)) * 100
            const rounded = Math.round(pct * 10) / 10
            setDefectDensity(over > 0 && rounded < 0.1 ? 0.1 : rounded)

            // pulse rate ~ number of crossings per second
            const now = ts
            const prWindow = 4000
            let prStart = 0
            while (prStart < timesRef.current.length && now - timesRef.current[prStart] > prWindow) prStart++
            let crossings = 0
            const thr = (window as any).__ai_threshold ?? 0.4
            let prev = valuesRef.current[prStart]
            for (let i = prStart + 1; i < valuesRef.current.length; i++) {
                const curr = valuesRef.current[i]
                if ((prev <= thr && curr > thr) || (prev >= thr && curr < thr)) crossings++
                prev = curr
            }
            setPulseRateHz(Math.round((crossings / (prWindow / 1000)) * 10) / 10)

            draw()
        }
        document.addEventListener('ai-score', onScore as any)
        const onActive = (e: Event) => {
            const d = (e as CustomEvent).detail as { active: boolean; ts: number }
            const ts = d?.ts || Date.now()
            const val = d?.active ? 1 : 0
            actTimesRef.current.push(ts)
            actValsRef.current.push(val)
            if (actValsRef.current.length > 600) { actValsRef.current.shift(); actTimesRef.current.shift() }
            // recompute density from last 8s purely from activation timeline
            const windowMs = 8000
            const cutoff = ts - windowMs
            let start = 0
            while (start < actTimesRef.current.length && actTimesRef.current[start] < cutoff) start++
            const vals = actValsRef.current.slice(start)
            const sum = vals.reduce((a, b) => a + b, 0)
            const pct = (sum / Math.max(1, vals.length)) * 100
            setDefectDensity(Math.round(pct * 10) / 10)
            draw()
        }
        document.addEventListener('ai-active', onActive as any)
        const onThr = (e: Event) => {
            const t = (e as CustomEvent).detail?.threshold
            if (typeof t === 'number') { (window as any).__ai_threshold = t; draw() }
        }
        document.addEventListener('ai-threshold', onThr as any)
        // Periodic recompute to keep density shown during loop gaps
        const tick = setInterval(() => {
            const ts = Date.now()
            const windowMs = 8000
            // Prefer activation-based density if available
            if (actTimesRef.current.length > 0) {
                let start = 0
                while (start < actTimesRef.current.length && ts - actTimesRef.current[start] > windowMs) start++
                const vals = actValsRef.current.slice(start)
                const pct = (vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)) * 100
                const rounded = Math.round(pct * 10) / 10
                setDefectDensity(rounded)
            } else if (timesRef.current.length > 0) {
                let startIdx = 0
                while (startIdx < timesRef.current.length && ts - timesRef.current[startIdx] > windowMs) startIdx++
                const vals = valuesRef.current.slice(startIdx)
                const thrUse = (window as any).__ai_threshold ?? 0.4
                const tol = 0.04
                const over = vals.filter((v) => v > Math.max(0, thrUse - tol)).length
                const pct = (over / Math.max(1, vals.length)) * 100
                setDefectDensity(Math.round(pct * 10) / 10)
            }
            draw()
        }, 500)
        return () => { clearInterval(tick); document.removeEventListener('ai-score', onScore as any); document.removeEventListener('ai-active', onActive as any); document.removeEventListener('ai-threshold', onThr as any) }
    }, [])

    function draw() {
        const cvs = canvasRef.current
        if (!cvs) return
        const ctx = cvs.getContext('2d')!
        const W = cvs.width
        const H = cvs.height
        ctx.clearRect(0, 0, W, H)

        // threshold line (uses last AI threshold)
        const thr = (window as any).__ai_threshold ?? 0.4
        const thrY = 12
        ctx.strokeStyle = '#d97706'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, thrY)
        ctx.lineTo(W, thrY)
        ctx.stroke()
        ctx.setLineDash([])

        // bars drawn UPWARD from a lower baseline for better visibility
        const data = valuesRef.current
        const n = Math.min(data.length, Math.floor(W / 2))
        const start = data.length - n
        const barW = Math.max(2, Math.floor(W / Math.max(1, n)))
        const bottomPad = 10
        const baselineY = Math.min(H - bottomPad, Math.floor(H * 0.75)) // 75% from top
        const maxUp = Math.max(8, baselineY - 8) // space above baseline
        for (let i = 0; i < n; i++) {
            const v = data[start + i]
            const x = i * barW
            const h = Math.max(2, maxUp * v)
            const y = Math.max(0, baselineY - h)
            ctx.fillStyle = '#ef4444' // red bars
            ctx.fillRect(x, y, barW - 1, h)
        }
    }

    useEffect(() => {
        const onResize = () => {
            const cvs = canvasRef.current
            if (!cvs) return
            const parent = cvs.parentElement
            if (!parent) return
            cvs.width = parent.clientWidth - 8
            cvs.height = parent.clientHeight - 20
            draw()
        }
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return (
        <div className="w-full h-full flex flex-col">
            <div className="text-xs text-gray-700 font-semibold px-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span>Threshold</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-gray-600">DEFECT DENSITY <span className="text-green-600 font-bold">{defectDensity.toFixed(1)}%</span></span>
                    <span className="text-gray-600">PULSE RATE <span className="text-blue-600 font-bold">{pulseRateHz.toFixed(1)} Hz</span></span>
                </div>
            </div>
            <div className="flex-1 px-1">
                <canvas ref={canvasRef} className="w-full h-full" />
            </div>
        </div>
    )
}

// Enhanced LIDAR railtrack-style simulation. Visual-only; API unchanged.
const LidarBox: React.FC<{ active: boolean }> = ({ active }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const scrollPhaseRef = useRef<number>(0)
    const cloudRef = useRef<Array<{ x: number; y: number; z: number; w: number }>>([])
    const seedRef = useRef<number>(12345)
    const aiActiveRef = useRef<boolean>(false)
    const aiLevelRef = useRef<number>(0)

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return
        const parent = cvs.parentElement
        const resize = () => {
            if (!parent) return
            cvs.width = parent.clientWidth - 8
            cvs.height = parent.clientHeight - 8
            regenerateCloud()
            draw(0)
        }
        resize()
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
    }, [])

    function rand() {
        // xorshift32
        let x = seedRef.current | 0
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5
        seedRef.current = x
        return ((x >>> 0) % 1000000) / 1000000
    }

    function regenerateCloud() {
        const cvs = canvasRef.current
        if (!cvs) return
        const W = cvs.width
        const H = cvs.height
        const n = Math.max(2500, Math.min(12000, Math.floor((W * H) / 28)))
        cloudRef.current = []
        for (let i = 0; i < n; i++) {
            // world coords: y depth (0 near, 1 far), x lateral (-1.5..1.5 meters), z height (ballast profile)
            const y = rand() // random depth bucket
            const lane = rand() < 0.6 ? 0 : (rand() < 0.5 ? -1 : 1) // more density in center
            const x = (lane + (rand() - 0.5) * 0.9) // meters offset from centerline
            const bed = 0.3 + 0.15 * Math.sin(x * 2.0) + 0.05 * (rand() - 0.5) // roughness
            const sleeper = Math.pow(Math.max(0, Math.sin(40 * y + rand() * 0.2)), 6) * 0.15 // periodic bumps
            const z = bed + sleeper
            const w = 0.5 + 0.6 * (1 - y) // point size weight
            cloudRef.current.push({ x, y, z, w })
        }
    }

    function colorMap(v: number) {
        // simple turbo-like ramp (0..1)
        const t = Math.max(0, Math.min(1, v))
        const r = Math.min(1, Math.max(0, 1.7 * t - 0.3))
        const g = Math.min(1, Math.max(0, 1.7 * (1 - Math.abs(t - 0.5) * 2)))
        const b = Math.min(1, Math.max(0, 1.7 * (1 - t) - 0.3))
        return `rgba(${Math.floor(r * 255)},${Math.floor(g * 255)},${Math.floor(b * 255)},0.95)`
    }

    function project(xm: number, yy: number, W: number, H: number) {
        // perspective: rails converge towards top; slight curve to right
        const curve = 0.25 * Math.pow(yy, 2)
        const left = lerp(W * 0.24, W * 0.40, yy) + curve * 12
        const right = lerp(W * 0.76, W * 0.60, yy) + curve * 12
        const mid = (left + right) / 2
        const span = (right - left)
        const x = mid + xm * (span * 0.28)
        const y = lerp(H * 0.95, H * 0.08, yy)
        return { x, y, left, right }
    }

    function draw(dt: number) {
        const cvs = canvasRef.current
        if (!cvs) return
        const ctx = cvs.getContext('2d')!
        const W = cvs.width
        const H = cvs.height
        ctx.clearRect(0, 0, W, H)

        // backdrop
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, '#e5e7eb')
        g.addColorStop(1, '#f8fafc')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)

        // animate scroll along track
        const speed = active ? 0.55 : 0.12
        scrollPhaseRef.current = (scrollPhaseRef.current + speed * (dt / 16.6667)) % 1

        // AI level easing (for glow/pulse)
        const ai = Math.max(0, Math.min(1, aiLevelRef.current))
        const glow = aiActiveRef.current ? Math.max(0.15, ai * 0.9) : ai * 0.6

        // draw sleepers (stylized)
        ctx.lineWidth = 2
        for (let k = 0; k < 40; k++) {
            const yy = (k / 40 + (1 - scrollPhaseRef.current)) % 1
            const p = project(0, yy, W, H)
            // sleeper color modulated by AI level
            const base = 0x8b5cf6
            const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255
            const rr = Math.min(255, Math.floor(r + glow * 140))
            const gg = Math.min(255, Math.floor(g * (0.9 + glow * 0.2)))
            const bb = Math.min(255, Math.floor(b * (0.9 + glow * 0.2)))
            ctx.strokeStyle = `rgb(${rr},${gg},${bb})`
            ctx.beginPath()
            ctx.moveTo(p.left, p.y)
            ctx.lineTo(p.right, p.y)
            ctx.stroke()
        }

        // rails
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(W * 0.25, H)
        ctx.lineTo(W * 0.40, 0)
        ctx.moveTo(W * 0.75, H)
        ctx.lineTo(W * 0.60, 0)
        ctx.stroke()

        // centerline highlight with AI glow
        const cx0 = W * 0.5 - 1
        const cx1 = W * 0.5 + 1
        const grad = ctx.createLinearGradient(cx0, 0, cx1, H)
        grad.addColorStop(0, `rgba(16,185,129,${0.15 + glow * 0.25})`)
        grad.addColorStop(1, `rgba(59,130,246,${0.15 + glow * 0.25})`)
        ctx.fillStyle = grad
        ctx.fillRect(cx0, 0, 2, H)

        // point cloud (ballast) with height -> color
        const pts = cloudRef.current
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i]
            let yy = p.y + scrollPhaseRef.current
            yy = yy > 1 ? yy - 1 : yy
            const pr = project(p.x, yy, W, H)
            // amplify saturation slightly with AI level
            const c = colorMap((p.z - 0.2) / 0.6)
            const size = Math.max(1, Math.floor(p.w * (1 - yy) * 2))
            ctx.fillStyle = c
            ctx.fillRect(pr.x - size * 0.5, pr.y - size * 0.5, size, size)
        }

        // soft AI glow overlay
        if (glow > 0.01) {
            ctx.save()
            ctx.globalCompositeOperation = 'lighter'
            ctx.fillStyle = `rgba(255,0,0,${0.06 + glow * 0.08})`
            ctx.beginPath()
            ctx.ellipse(W * 0.5, H * 0.55, Math.max(40, W * 0.18), Math.max(24, H * 0.12), 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        }

        // title with backdrop for readability
        const title = 'LIDAR SCAN GEOMETRY – RAILTRACK'
        ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto'
        const tw = ctx.measureText(title).width
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillRect(8, 6, tw + 8, 16)
        ctx.fillStyle = '#111827'
        ctx.fillText(title, 12, 18)

        // color bar
        const barH = Math.min(140, Math.floor(H * 0.35))
        const barW = 10
        const bx = W - barW - 10
        const by = H - barH - 14
        const cg = ctx.createLinearGradient(0, by, 0, by + barH)
        for (let i = 0; i <= 10; i++) cg.addColorStop(i / 10, colorMap(1 - i / 10))
        ctx.fillStyle = cg
        ctx.fillRect(bx, by, barW, barH)
        ctx.strokeStyle = '#334155'
        ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1)
        // labels
        ctx.fillStyle = '#334155'
        ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto'
        ctx.fillText('High', bx - 28, by + 10)
        ctx.fillText('Low', bx - 24, by + barH - 2)
    }

    useEffect(() => {
        let last = performance.now()
        function loop(now: number) {
            const dt = now - last
            last = now
            draw(dt)
            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [])

    // Listen to AI events to modulate visualization
    useEffect(() => {
        const onScore = (e: Event) => {
            const detail = (e as CustomEvent).detail as { score: number }
            if (typeof detail?.score === 'number') {
                // exponential smoothing for stability
                aiLevelRef.current = Math.max(0, Math.min(1, 0.85 * aiLevelRef.current + 0.15 * detail.score))
            }
        }
        const onActive = (e: Event) => {
            const d = (e as CustomEvent).detail as { active: boolean }
            aiActiveRef.current = !!d?.active
        }
        document.addEventListener('ai-score', onScore as any)
        document.addEventListener('ai-active', onActive as any)
        return () => {
            document.removeEventListener('ai-score', onScore as any)
            document.removeEventListener('ai-active', onActive as any)
        }
    }, [])

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

    return (
        <div className="w-full h-full flex flex-col p-1">
            <div className="text-sm font-semibold text-gray-700 mb-1">Geometry anomaly detection</div>
            <div className="flex-1">
                <canvas ref={canvasRef} className="w-full h-full" />
            </div>
        </div>
    )
}

const RfidCard: React.FC = () => {
	return (
		<div className="w-full h-full flex flex-col p-1">
			<div className="glass px-2 py-1 flex-1 mb-1">
				<div className="flex items-center justify-between mb-1">
					<div className="text-gray-800 font-bold text-xs">Rajdhani Express</div>
					<span className="text-xs font-semibold text-gray-600">STANDBY</span>
				</div>
				<div className="text-xs font-semibold text-gray-700 mb-1">ID: ICF-22439</div>
				<div className="grid grid-cols-2 gap-1 text-xs font-semibold text-gray-700 mb-2">
					<div>
						<div>Type: <span className="text-blue-600 font-bold">Passenger</span></div>
						<div>Coaches: <span className="text-blue-600 font-bold">16</span></div>
						<div>Route: <span className="text-green-600 font-bold">DEL-BOM</span></div>
					</div>
					<div>
						<div>Engine: <span className="text-blue-600 font-bold">WAP-7</span></div>
						<div>Max Speed: <span className="text-green-600 font-bold">130 km/h</span></div>
					</div>
				</div>
			</div>
			<div className="text-xs font-semibold text-gray-700 space-y-0.5 flex-shrink-0">
				<div className="flex items-center gap-1">
					<span>Signal Strength:</span>
					<div className="flex-1 h-1 bg-gray-300 rounded">
						<div className="h-1 bg-green-500 rounded" style={{ width: '85%' }} />
					</div>
					<span className="font-bold text-xs">85%</span>
				</div>
				<div className="grid grid-cols-2 gap-1">
					<div>Frequency: <span className="text-blue-600 font-bold">13.56 MHz</span></div>
					<div>Last Scan: <span className="text-blue-600 font-bold">19:54:25</span></div>
				</div>
				<div>Data Rate: <span className="text-blue-600 font-bold">424 kbps</span></div>
			</div>
		</div>
	)
}


const ImuPanel: React.FC<{ imu: { ax: number; ay: number; az: number } | null }> = ({ imu }) => {
	const ax = imu?.ax ?? 0
	const ay = imu?.ay ?? 0
	const az = imu?.az ?? 0
	const histRef = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] })
	const sparkRef = useRef<HTMLCanvasElement | null>(null)

	useEffect(() => {
		const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > 80) arr.shift() }
		push(histRef.current.x, ax)
		push(histRef.current.y, ay)
		push(histRef.current.z, az)
		draw()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ax, ay, az])

	useEffect(() => {
		const onResize = () => draw()
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	}, [])

	function draw() {
		const cvs = sparkRef.current
		if (!cvs) return
		const parent = cvs.parentElement
		if (!parent) return
		cvs.width = parent.clientWidth - 8
		cvs.height = 48
		const ctx = cvs.getContext('2d')!
		ctx.clearRect(0, 0, cvs.width, cvs.height)
		const series: Array<{ data: number[]; color: string }> = [
			{ data: histRef.current.x, color: '#2563eb' },
			{ data: histRef.current.y, color: '#16a34a' },
			{ data: histRef.current.z, color: '#dc2626' }
		]
		const W = cvs.width, H = cvs.height
		const mapY = (v: number) => {
			const clamped = Math.max(-2, Math.min(2, v))
			return H * 0.5 - (clamped / 2) * (H * 0.8)
		}
		series.forEach((s) => {
			ctx.strokeStyle = s.color
			ctx.lineWidth = 1.5
			ctx.beginPath()
			const n = s.data.length
			for (let i = 0; i < n; i++) {
				const x = (i / Math.max(1, n - 1)) * W
				const y = mapY(s.data[i])
				if (i === 0) ctx.moveTo(x, y)
				else ctx.lineTo(x, y)
			}
			ctx.stroke()
		})
		// midline
		ctx.strokeStyle = 'rgba(0,0,0,0.15)'
		ctx.setLineDash([4, 4])
		ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5); ctx.stroke(); ctx.setLineDash([])
	}

	function Bar({ label, value, color }: { label: string; value: number; color: string }) {
		const pct = Math.max(-1, Math.min(1, value))
		const pos = (pct + 1) * 50 // 0..100
		return (
			<div className="flex flex-col items-center gap-1">
				<div className="text-[10px] font-semibold text-gray-600">{label}</div>
				<div className="w-2 h-14 bg-gray-200 rounded relative overflow-hidden">
					<div className="absolute left-0 right-0 top-1/2 h-px bg-gray-300" />
					<div className="absolute bottom-0 w-full" style={{ height: `${pos}%`, backgroundColor: color }} />
				</div>
				<div className="text-xs font-bold text-gray-700" style={{ color }}>{value.toFixed(2)}</div>
			</div>
		)
	}

	return (
		<div className="w-full h-full flex flex-col gap-2 p-1">
			<div className="grid grid-cols-3 gap-3 items-center justify-items-center">
				<Bar label="ax" value={ax} color="#2563eb" />
				<Bar label="ay" value={ay} color="#16a34a" />
				<Bar label="az" value={az} color="#dc2626" />
			</div>
			<div className="flex-1 w-full">
				<canvas ref={sparkRef} className="w-full h-12" />
			</div>
		</div>
	)
}

type CameraMode = 'front-high-fps' | 'rear-normal'

const CameraView: React.FC<{ label?: string; mode: CameraMode; initialFlip?: boolean }> = ({ label, mode, initialFlip = false }) => {
	const videoRef = useRef<HTMLVideoElement | null>(null)
	const [status, setStatus] = useState<string>('Initializing…')
	const [fps, setFps] = useState<number | null>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const [flipped, setFlipped] = useState<boolean>(initialFlip)

	// Simple in-memory stream cache so both panels can share a single camera
	const cacheRef = useRef<{ key: string | null } & Record<string, MediaStream | null>>({ key: null })

	useEffect(() => {
		let isMounted = true

		async function stopStream() {
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop()
				}
				streamRef.current = null
			}
		}

		async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices()
				return devices.filter((d) => d.kind === 'videoinput')
			} catch {
				return []
			}
		}

		async function pickRearDeviceId(): Promise<string | undefined> {
			try {
				const videos = await listVideoInputs()
				// Prefer labels containing 'back', 'rear', or 'environment'
				const preferred = videos.find((d) => /back|rear|environment/i.test(d.label))
				return preferred?.deviceId || videos[1]?.deviceId || videos[0]?.deviceId
			} catch {
				return undefined
			}
		}

		async function openStream() {
			setStatus('Requesting camera…')
			await stopStream()

			const isFront = mode === 'front-high-fps'
			const desiredFpsList = isFront ? [440, 360, 300, 240, 120, 90, 60, 30] : [60, 30]
			let facingMode: 'user' | 'environment' = isFront ? 'user' : 'environment'
			// If only one integrated camera exists, use it for both and share stream
			const videos = await listVideoInputs()
			const singleCam = videos.length <= 1
			if (!isFront && singleCam) facingMode = 'user'
			const rearDeviceId = !isFront && !singleCam ? await pickRearDeviceId() : undefined

			const cacheKey = singleCam ? 'singlecam' : isFront ? 'front' : 'rear'
			const cached = (cacheRef.current as any)[cacheKey] as MediaStream | null
			if (cached) {
				// Reuse existing stream by cloning tracks for this element
				const cloned = new MediaStream(cached.getVideoTracks().map((t) => t.clone()))
				streamRef.current = cloned
				if (videoRef.current) {
					videoRef.current.srcObject = cloned
					videoRef.current.muted = true
					videoRef.current.play().catch(() => {});
				}
				setFps(null);
				setStatus('Live');
				return
			}

			let lastError: any = null
			for (const targetFps of desiredFpsList) {
				try {
					const constraints: MediaStreamConstraints = {
						video: {
							width: { ideal: 1280 },
							height: { ideal: 720 },
							frameRate: { ideal: targetFps },
							// Try facingMode first; desktop cams may ignore it
							facingMode: facingMode as any,
							...(rearDeviceId ? { deviceId: { exact: rearDeviceId } } : {})
						} as MediaTrackConstraints,
						audio: false
					}
					const stream = await navigator.mediaDevices.getUserMedia(constraints)
					if (!isMounted) {
						for (const track of stream.getTracks()) track.stop()
						return
					}
					streamRef.current = stream
					if (videoRef.current) {
						videoRef.current.srcObject = stream
						// Autoplay can fail unless muted
						videoRef.current.muted = true
					videoRef.current.play().catch(() => {});
					}
				setFps(targetFps);
				setStatus('Live');
					// Cache for reuse by other panels
					(cacheRef.current as any)[cacheKey] = stream
					return
				} catch (err) {
					lastError = err
					continue
				}
			}
			// Last resort: try any available camera with default constraints
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
				if (!isMounted) {
					for (const track of stream.getTracks()) track.stop()
					return
				}
				streamRef.current = stream
				if (videoRef.current) {
					videoRef.current.srcObject = stream
					videoRef.current.muted = true
					videoRef.current.play().catch(() => {});
				}
				setFps(null);
				setStatus('Live');
				(cacheRef.current as any)['fallback'] = stream
				return
			} catch (fallbackErr) {
				setStatus(`Failed to start camera${lastError?.name ? `: ${lastError.name}` : ''}`)
				console.error('Camera start failed:', lastError || fallbackErr)
			}
		}

		openStream()
		return () => {
			isMounted = false
			stopStream()
		}
	}, [mode])

	return (
		<div className="w-full h-full flex flex-col gap-1">
			<div className="flex items-center justify-between text-xs text-gray-700 font-semibold">
				<span>{label ?? 'Camera'}</span>
				<span>{status}{fps ? ` • requested ${fps} fps` : ''}</span>
			</div>
			<div className="relative w-full h-full rounded overflow-hidden bg-black">
				<button
					className="absolute z-10 top-2 left-2 px-2 py-1 bg-gray-800/80 text-white text-xs font-semibold rounded"
					onClick={() => setFlipped((v) => !v)}
					title="Flip left/right"
				>
					Flip
				</button>
				{status.startsWith('Failed') && (
					<button
						className="absolute z-10 top-2 right-2 px-2 py-1 bg-pink-600 text-white text-xs font-semibold rounded"
						onClick={() => {
							// Retry on user gesture
							setStatus('Retrying…')
							// Force re-init by tweaking a local state via play()
							if (videoRef.current && videoRef.current.srcObject) {
								try { (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop()) } catch {}
								videoRef.current.srcObject = null as any
							}
							// Toggle mode dependency by a no-op set to trigger effect via state below if needed
							setTimeout(() => setStatus('Initializing…'), 10)
						}}
					>
						Grant/Retry
					</button>
				)}
				<video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: flipped ? 'scaleX(-1)' as any : undefined }} />
			</div>
		</div>
	)
}

// Upload-and-loop video player with lightweight anomaly detection (frame differencing)
const UploadLoopPlayer: React.FC<{ onIrregularity?: (score: number) => void; onPlayChange?: (playing: boolean) => void }> = ({ onIrregularity, onPlayChange }) => {
	const videoRef = useRef<HTMLVideoElement | null>(null)
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [status, setStatus] = useState<string>('Camera OFF • Upload a video to simulate')
	const [objectUrl, setObjectUrl] = useState<string | null>(null)
	const [analyzing, setAnalyzing] = useState<boolean>(false)
	const [hasMedia, setHasMedia] = useState<boolean>(false)
	const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true)
	const [sensitivity, setSensitivity] = useState<number>(0.20) // lower => more sensitive
	const [autoTune, setAutoTune] = useState<boolean>(true)
	const lastFireRef = useRef<number>(0)
const detectorRef = useRef<null | { start: () => void; stop: () => void; isReady: () => boolean }>(null)
	const scoreBufRef = useRef<number[]>([])
	const overlayRef = useRef<HTMLCanvasElement | null>(null)
	const warmupRef = useRef<number>(0)
	const prevTimeRef = useRef<number>(0)
	const [loopCount, setLoopCount] = useState<number>(0)
	const [aiReady, setAiReady] = useState<boolean>(false)
	// Stabilization refs
	const sustainRef = useRef<number>(0) // consecutive frames over entry threshold
	const activeRef = useRef<boolean>(false)
	const holdFramesRef = useRef<number>(0)
	const boxEmaRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
	const recentActivationsRef = useRef<number[]>([])
	const prevActiveRef = useRef<boolean>(false)
	// Lightweight tracking (view-level) — non-functional analytics
	const [detectCount, setDetectCount] = useState<number>(0)
	const [lastScore, setLastScore] = useState<number>(0)
	const [avg1m, setAvg1m] = useState<number>(0)
	const startTimeRef = useRef<number>(0)
	const recentScoresRef = useRef<Array<{ ts: number; score: number }>>([])

	useEffect(() => {
		return () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl)
			}
		}
	}, [objectUrl])

	useEffect(() => {
		let rafId: number | null = null
		let canvas: HTMLCanvasElement | null = null
		let lastFrame: ImageData | null = null

		function analyze() {
			if (!videoRef.current || !hasMedia || !analyzing || videoRef.current.readyState < 2) {
				ran()
				return
			}
			const v = videoRef.current
			if (!canvas) canvas = document.createElement('canvas')
			const w = 160
			const h = Math.max(1, Math.floor((v.videoHeight || 90) * (w / Math.max(1, v.videoWidth || 160))))
			canvas.width = w; canvas.height = h
			const ctx = canvas.getContext('2d')
			if (!ctx) { ran(); return }
			ctx.drawImage(v, 0, 0, w, h)
			const curr = ctx.getImageData(0, 0, w, h)
			let diff = 0
			let maxBlockSum = 0
			let maxBlockX = 0
			let maxBlockY = 0
			if (lastFrame) {
				// compute per-block saliency to localize movement
				const block = 8
				for (let by = 0; by < h; by += block) {
					for (let bx = 0; bx < w; bx += block) {
						let sum = 0
						for (let y = by; y < Math.min(by + block, h); y++) {
							for (let x = bx; x < Math.min(bx + block, w); x++) {
								const idx = (y * w + x) * 4
								const dr = Math.abs(curr.data[idx] - lastFrame.data[idx])
								const dg = Math.abs(curr.data[idx+1] - lastFrame.data[idx+1])
								const db = Math.abs(curr.data[idx+2] - lastFrame.data[idx+2])
								sum += dr + dg + db
								diff += dr + dg + db
							}
						}
						if (sum > maxBlockSum) { maxBlockSum = sum; maxBlockX = bx; maxBlockY = by }
					}
				}
				const norm = diff / (w * h * 3 * 255)
				const score = Math.min(1, Math.max(0, norm * 4))
				const now = Date.now()
				// Warmup: accumulate 15 frames before deciding
				if (warmupRef.current < 6) { warmupRef.current++; lastFrame = curr; ran(); return }
				// Rolling-average over recent scores to avoid rapid flashing
				scoreBufRef.current.push(score)
				if (scoreBufRef.current.length > 8) scoreBufRef.current.shift()
				const avg = scoreBufRef.current.reduce((a, b) => a + b, 0) / scoreBufRef.current.length
				// Broadcast score for DPCM graph with current threshold
                ;(window as any).__ai_threshold = sensitivity
                document.dispatchEvent(new CustomEvent('ai-threshold', { detail: { threshold: sensitivity } }))
                document.dispatchEvent(new CustomEvent('ai-score', { detail: { score: avg, ts: now, threshold: sensitivity } }))
				// Track rolling 60s average for HUD
				recentScoresRef.current.push({ ts: now, score: avg })
				const cutoff = now - 60000
				while (recentScoresRef.current.length && recentScoresRef.current[0].ts < cutoff) recentScoresRef.current.shift()
				if (recentScoresRef.current.length) {
					const s = recentScoresRef.current.reduce((a, b) => a + b.score, 0) / recentScoresRef.current.length
					setAvg1m(Math.round(s * 1000) / 1000)
					setLastScore(Math.round(avg * 1000) / 1000)
				}
				// Update stable activation via hysteresis and sustain logic
				const entryThr = sensitivity
				const exitThr = Math.max(0, sensitivity - 0.10)
				if (avg > entryThr) {
					sustainRef.current = Math.min(10, sustainRef.current + 1)
				} else if (avg < exitThr) {
					sustainRef.current = Math.max(0, sustainRef.current - 1)
				}
				if (!activeRef.current && sustainRef.current >= 3) { activeRef.current = true; holdFramesRef.current = 8 }
				if (activeRef.current && sustainRef.current === 0) {
					if (holdFramesRef.current > 0) holdFramesRef.current--;
					else activeRef.current = false
				}

				// Draw overlay box for current max block using EMA when active
				const ov = overlayRef.current
				if (ov) {
					const octx = ov.getContext('2d')!
					octx.clearRect(0, 0, ov.width, ov.height)
					if (activeRef.current && maxBlockSum > 0) {
						// scale block coords to overlay size
						const scaleX = ov.width / w
						const scaleY = ov.height / h
						const rx = Math.floor(maxBlockX * scaleX)
						const ry = Math.floor(maxBlockY * scaleY)
						const rw = Math.ceil(8 * scaleX)
						const rh = Math.ceil(8 * scaleY)
						const alpha = 0.35
						if (!boxEmaRef.current) boxEmaRef.current = { x: rx, y: ry, w: rw, h: rh }
						else boxEmaRef.current = {
							x: Math.round(alpha * rx + (1 - alpha) * boxEmaRef.current.x),
							y: Math.round(alpha * ry + (1 - alpha) * boxEmaRef.current.y),
							w: Math.round(alpha * rw + (1 - alpha) * boxEmaRef.current.w),
							h: Math.round(alpha * rh + (1 - alpha) * boxEmaRef.current.h)
						}
						const bx = boxEmaRef.current.x, by = boxEmaRef.current.y, bw = boxEmaRef.current.w, bh = boxEmaRef.current.h
						octx.lineWidth = 3
						octx.strokeStyle = 'rgba(255,0,0,0.9)'
						octx.shadowColor = 'rgba(255,0,0,0.8)'
						octx.shadowBlur = 8
						octx.strokeRect(bx, by, bw, bh)
					}
				}

				// Simple adaptive sensitivity: adjust based on recent activation rate
				if (autoTune) {
					const nowMs = now
					const windowMs = 10000
					// keep only last 10s activations
					recentActivationsRef.current = recentActivationsRef.current.filter((t) => nowMs - t <= windowMs)
					const ratePerSec = recentActivationsRef.current.length / (windowMs / 1000)
					// target ~0.5 activations/sec; nudge sensitivity each frame within bounds
					let s = sensitivity
					const target = 0.2
					const err = ratePerSec - target
					const k = 0.0025
					// Nudge sensitivity down when detections are too rare (rate < target)
					s = Math.max(0.15, Math.min(0.6, s - err * k))
					if (Math.abs(s - sensitivity) > 0.0005) {
						// update state occasionally to avoid excessive renders
						setSensitivity(s)
					}
				}
				// Broadcast stable activation for DPCM density and collect activation edges
				document.dispatchEvent(new CustomEvent('ai-active', { detail: { active: activeRef.current, ts: now } }))
				if (!prevActiveRef.current && activeRef.current) {
					recentActivationsRef.current.push(now)
					if (recentActivationsRef.current.length > 120) recentActivationsRef.current.shift()
				}
				prevActiveRef.current = activeRef.current
				if (alertsEnabled && onIrregularity && activeRef.current && avg > (sensitivity + 0.005) && now - lastFireRef.current > 5000) {
					onIrregularity(avg)
					lastFireRef.current = now
					// Emit non-functional tracking event for detections
					try { document.dispatchEvent(new CustomEvent('ai-detect', { detail: { score: avg, ts: now } })) } catch {}
					setDetectCount((c) => c + 1)
					console.debug('[AI] detection', { score: Math.round(avg * 1000) / 1000, ts: now })
				}
			}
			lastFrame = curr
			ran()
		}
		function ran() { rafId = requestAnimationFrame(analyze) }
		if (analyzing && hasMedia) ran()
		return () => { if (rafId) cancelAnimationFrame(rafId) }
	}, [analyzing, hasMedia, onIrregularity])

	// Initialize TFJS detector once video is ready
	useEffect(() => {
		async function maybeInit() {
			const v = videoRef.current
			if (!v || !hasMedia || !analyzing) return
			if (!detectorRef.current) {
				const d = await createVideoAnomalyDetector({
					video: v,
					intervalMs: 250,
					threshold: sensitivity,
					onScore: (score) => {
						// Warmup and buffer; alert on higher threshold + longer cooldown
						if (warmupRef.current < 6) { warmupRef.current++; return }
						scoreBufRef.current.push(score)
						if (scoreBufRef.current.length > 8) scoreBufRef.current.shift()
						const avg = scoreBufRef.current.reduce((a, b) => a + b, 0) / scoreBufRef.current.length
						if (alertsEnabled && onIrregularity && avg > (sensitivity + 0.01) && Date.now() - lastFireRef.current > 8000) {
							onIrregularity(avg)
							lastFireRef.current = Date.now()
							// Emit non-functional tracking event for detections
							try { document.dispatchEvent(new CustomEvent('ai-detect', { detail: { score: avg, ts: Date.now() } })) } catch {}
							setDetectCount((c) => c + 1)
						}
					}
				})
				detectorRef.current = d
				setAiReady(d.isReady())
			}
			detectorRef.current.start()
		}
		maybeInit()
		return () => { detectorRef.current?.stop() }
	}, [analyzing, hasMedia, sensitivity])

	function resetForLoop() {
		warmupRef.current = 0
		scoreBufRef.current = []
		lastFireRef.current = 0
		sustainRef.current = 0
		activeRef.current = false
		holdFramesRef.current = 0
		boxEmaRef.current = null
		recentActivationsRef.current = []
		recentScoresRef.current = []
		startTimeRef.current = Date.now()
		setDetectCount(0)
		setLastScore(0)
		setAvg1m(0)
		document.dispatchEvent(new CustomEvent('ai-active', { detail: { active: false, ts: Date.now() } }))
		// restart detector sampling immediately if available
		try { detectorRef.current?.stop() } catch {}
		try { detectorRef.current?.start() } catch {}
	}

	return (
		<div className="w-full h-full flex flex-col gap-1">
			<div className="flex items-center justify-between text-xs text-gray-700 font-semibold">
				<span>Playback</span>
				<span>{status}</span>
			</div>
			<div className="relative w-full h-full rounded overflow-hidden bg-black">
				<div className="w-full h-full relative">
					<video ref={videoRef} className="w-full h-full object-cover" loop muted playsInline onPlay={() => { setStatus('Playing • Loop'); setAnalyzing(true); resetForLoop(); prevTimeRef.current = videoRef.current?.currentTime || 0; onPlayChange && onPlayChange(true) }} onPause={() => { setStatus('Paused'); onPlayChange && onPlayChange(false) }} onLoadedMetadata={() => {
						const v = videoRef.current; const ov = overlayRef.current; if (v && ov) { ov.width = v.clientWidth || v.videoWidth; ov.height = v.clientHeight || v.videoHeight }
					}} onTimeUpdate={() => { const v = videoRef.current; if (!v) return; const t = v.currentTime; if (t + 0.1 < prevTimeRef.current) { // looped back
						resetForLoop(); setLoopCount((c) => c + 1)
					}
					prevTimeRef.current = t; }} onSeeking={() => { const v = videoRef.current; if (!v) return; if (v.currentTime + 0.05 < prevTimeRef.current) { resetForLoop(); setLoopCount((c) => c + 1) } }} />
					<canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
				</div>
				<div className="absolute top-2 left-2 flex gap-2 items-center">
					<button className="px-2 py-1 bg-gray-800/80 text-white text-xs font-semibold rounded" onClick={() => fileInputRef.current?.click()}>Upload</button>
					<button className="px-2 py-1 bg-gray-800/80 text-white text-xs font-semibold rounded" onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { v.play().catch(()=>{}); } else { v.pause(); } }}>{videoRef.current && !videoRef.current.paused ? 'Pause' : 'Play'}</button>
					<button className="px-2 py-1 bg-gray-800/80 text-white text-xs font-semibold rounded" onClick={() => { const v = videoRef.current; if (!v) return; v.pause(); v.currentTime = 0; setAnalyzing(false); setHasMedia(false); setStatus('Stopped'); onPlayChange && onPlayChange(false) }}>Stop</button>
					<button className={"px-2 py-1 text-xs font-semibold rounded " + (alertsEnabled ? "bg-green-700/80 text-white" : "bg-gray-500/70 text-white")} onClick={() => setAlertsEnabled((v) => !v)}>{alertsEnabled ? 'Alerts: ON' : 'Alerts: OFF'}</button>
					<div className="flex items-center gap-1 text-[10px] bg-white/70 text-gray-800 px-1.5 py-0.5 rounded">
						<span>AI:</span>
						<span className={aiReady ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{aiReady ? 'ON' : 'OFF'}</span>
					</div>
					<span className={"px-2 py-1 text-xs font-semibold rounded bg-blue-700/80 text-white select-none"}>Adaptive: ON</span>
					<div className="px-2 py-1 bg-white/80 text-gray-800 text-xs font-semibold rounded">Loop: {loopCount}</div>
				</div>
				{/* Non-functional AI tracking HUD (relocated to bottom-right, non-interactive) */}
				<div className="pointer-events-none absolute bottom-2 right-2 bg-white/80 text-gray-800 rounded px-2 py-1 text-[10px] font-semibold shadow z-10">
					<div>Detections: <span className="text-pink-700 font-bold">{detectCount}</span></div>
					<div>Last score: <span className="text-blue-700 font-bold">{lastScore.toFixed(3)}</span></div>
					<div>Avg(60s): <span className="text-green-700 font-bold">{avg1m.toFixed(3)}</span></div>
					<div>Uptime: <span className="font-bold">{startTimeRef.current ? Math.max(0, Math.floor((Date.now() - startTimeRef.current)/1000)) : 0}s</span></div>
				</div>
				<input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
					const file = e.target.files && e.target.files[0]
					if (!file) return
					if (objectUrl) URL.revokeObjectURL(objectUrl)
					const url = URL.createObjectURL(file)
					setObjectUrl(url)
					const v = videoRef.current
					if (v) { v.src = url; v.loop = true; v.play().catch(()=>{}); setStatus('Playing • Loop'); setHasMedia(true); setAnalyzing(true); onPlayChange && onPlayChange(true); startTimeRef.current = Date.now() }
				}} />
			</div>
		</div>
	)
}


