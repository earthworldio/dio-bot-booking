const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  readEnv: () => ipcRenderer.invoke('env:read'),
  writeEnv: (content) => ipcRenderer.invoke('env:write', content),
  openChrome: (profileId, debugPort, userDataDir, extraEnv) => ipcRenderer.invoke('bot:openChrome', { profileId, debugPort, userDataDir, extraEnv }),
  isBotConnected: (profileId) => ipcRenderer.invoke('bot:isConnected', { profileId }),
  runBot: (profileId, envObj, date) => ipcRenderer.invoke('bot:run', { profileId, envObj, date }),
  runAll: (items) => ipcRenderer.invoke('bot:runAll', { items }),
  closeBot: (profileId) => ipcRenderer.invoke('bot:close', { profileId }),
  profilesRead: () => ipcRenderer.invoke('profiles:read'),
  profilesWrite: (data) => ipcRenderer.invoke('profiles:write', data),
  onLog: (callback) => ipcRenderer.on('log:append', (_e, data) => callback(data))
})


