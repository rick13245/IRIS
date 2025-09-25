/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AGG_URL?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare global {
	interface Window {
		itms: {
			openSaveDialog: (defaultPath: string) => Promise<string | null>
		}
	}
}

export {}


