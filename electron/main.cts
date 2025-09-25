import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import * as path from 'path'

let mainWindow: import('electron').BrowserWindow | null = null

// Suppress Electron security warnings in development
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

async function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 900,
		backgroundColor: '#0a0f1f',
		webPreferences: {
			preload: path.join(process.cwd(), 'electron', 'preload.cjs'),
			nodeIntegration: false,
			contextIsolation: true,
		}
	})

	const devServer = process.env.VITE_DEV_SERVER_URL
	if (devServer) {
		await mainWindow.loadURL(devServer)
		if (process.env.OPEN_DEVTOOLS === '1') {
			mainWindow.webContents.openDevTools({ mode: 'detach' })
		}
	} else {
		await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
	}

	mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
	// Allow geolocation prompts inside the app
	session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
		// Allow camera/microphone and geolocation; deny others
		if (permission === 'geolocation') { callback(true); return }
		if (permission === 'media') { callback(true); return }
		callback(false)
	})

	// Some Chromium paths check permission without prompting; explicitly allow
	session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
		if (permission === 'geolocation') return true
		if (permission === 'media') return true
		return false
	})
	createWindow()
	app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.handle('export:save-dialog', async (_evt, defaultPath: string) => {
	const res = await dialog.showSaveDialog({ defaultPath })
	return res.filePath ?? null
})


