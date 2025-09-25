const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('itms', {
	openSaveDialog: async (defaultPath) => ipcRenderer.invoke('export:save-dialog', defaultPath)
})


