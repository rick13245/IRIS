// Tiny AI helper for video anomaly detection using TensorFlow.js MobileNet embeddings
// We intentionally avoid adding npm deps and instead lazy-load ESM builds at runtime.

export type AnomalyDetector = {
	start: () => void
	stop: () => void
	isReady: () => boolean
}

// Lightweight moving-average distance detector over MobileNet embeddings
export async function createVideoAnomalyDetector(opts: {
	video: HTMLVideoElement
	intervalMs?: number
	threshold?: number // cosine distance threshold to trigger
	onScore?: (score: number) => void
}): Promise<AnomalyDetector> {
	const { video, intervalMs = 200, threshold = 0.28, onScore } = opts

	let tf: any = null
	let mobilenet: any = null
	let model: any = null
	let timer: number | null = null
	let running = false

	try {
		// Lazy-load ESM builds at runtime to avoid bundling
		// @ts-ignore
		tf = (await import(/* @vite-ignore */ 'https://esm.sh/@tensorflow/tfjs@4.20.0')) as any
		// @ts-ignore
		mobilenet = (await import(/* @vite-ignore */ 'https://esm.sh/@tensorflow-models/mobilenet@2.1.1')) as any
		model = await mobilenet.load({ version: 2, alpha: 1.0 })
	} catch (err) {
		console.warn('[AI] Failed to load TFJS model; falling back', err)
		return {
			start: () => {},
			stop: () => {},
			isReady: () => false
		}
	}

	let meanVector: Float32Array | null = null
	let sampleCount = 0

	function cosineDistance(a: Float32Array, b: Float32Array): number {
		let dot = 0, na = 0, nb = 0
		for (let i = 0; i < a.length; i++) { const x = a[i]; const y = b[i]; dot += x * y; na += x * x; nb += y * y }
		return 1 - (dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8))
	}

	async function step() {
		if (!running) return
		try {
			const emb: Float32Array = await tf.tidy(() => {
				const img = tf.browser.fromPixels(video)
				const resized = tf.image.resizeBilinear(img, [224, 224]) as any
				const b = (resized as any).expandDims(0)
				const act = model.infer(b, 'conv_preds') as any // embedding tensor
				const flat = act.flatten() as any
				const data = flat.dataSync() as Float32Array
				return new Float32Array(data)
			})

			let score = 0
			if (!meanVector) {
				meanVector = emb
				sampleCount = 1
				score = 0
			} else {
				score = cosineDistance(emb, meanVector)
				// Update running mean slowly
				const lr = 0.02
				for (let i = 0; i < meanVector.length; i++) {
					meanVector[i] = (1 - lr) * meanVector[i] + lr * emb[i]
				}
				sampleCount++
			}
			onScore && onScore(score)
		} catch (err) {
			// ignore occasional read failures
		}
		finally {
			if (running) timer = window.setTimeout(step, intervalMs)
		}
	}

	return {
		start: () => { if (!running) { running = true; step() } },
		stop: () => { running = false; if (timer) { clearTimeout(timer); timer = null } },
		isReady: () => !!model
	}
}


