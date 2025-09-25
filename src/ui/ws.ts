export type AggregatorEvent =
	| { type: 'telemetry'; speed_kmph: number; imu: { ax: number; ay: number; az: number }; gps: { lat: number; lon: number }; chainage_m: number }
	| { type: 'defect'; class: string; severity: 'low' | 'medium' | 'high'; gps: { lat: number; lon: number }; chainage_m: number; snapshot_url: string | null }

export function connectAggregator(onEvent: (evt: AggregatorEvent) => void) {
	const envUrl = (import.meta as any).env?.VITE_AGG_URL as string | undefined
	const url = envUrl && typeof envUrl === 'string' && envUrl.length > 0 ? envUrl : 'ws://localhost:8080/ws'
	let ws: WebSocket | null = null

	function open() {
		ws = new WebSocket(url)
		ws.onopen = () => {
			console.info('[AggregatorWS] connected', url)
		}
		ws.onmessage = (m) => {
			try {
				const parsed = JSON.parse(m.data as string)
				if (parsed && typeof parsed === 'object' && (parsed.type === 'telemetry' || parsed.type === 'defect')) {
					onEvent(parsed as AggregatorEvent)
				}
			} catch {
				// ignore malformed
			}
		}
		ws.onerror = (err) => {
			console.warn('[AggregatorWS] error', err)
		}
		ws.onclose = () => setTimeout(open, 1000)
	}
	open()
	return () => { ws?.close() }
}
