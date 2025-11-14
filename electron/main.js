const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')


const { BotController, buildConfigFromEnv, buildBookingDataFromEnv } = require('../dist/app/botController.js')

let mainWindow = null
let bots = new Map() 

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

function getEnvPath() {
  // Keep .env alongside app root
  return path.resolve(process.cwd(), '.env')
}

function readDotEnv() {
  const envPath = getEnvPath()
  if (!fs.existsSync(envPath)) return ''
  return fs.readFileSync(envPath, 'utf8')
}

function writeDotEnv(content) {
  const envPath = getEnvPath()
  fs.writeFileSync(envPath, content, 'utf8')
  return true
}

ipcMain.handle('env:read', async () => {
  return readDotEnv()
})

ipcMain.handle('env:write', async (event, content) => {
  writeDotEnv(content)
  return true
})

ipcMain.handle('bot:openChrome', async (event, { profileId, debugPort, userDataDir, extraEnv }) => {
  const bot = ensureBot(profileId)
  return bot.openChrome(debugPort, userDataDir, extraEnv)
})

// bot:connect removed – run will auto-launch Chromium if needed

ipcMain.handle('bot:run', async (event, { profileId, envObj, date }) => {
  const bot = ensureBot(profileId)
  const normalizedEnv = normalizeEnv(envObj)
  const config = buildConfigFromEnv(normalizedEnv)
  if (!bot.isConnected()) {
    if (normalizedEnv && normalizedEnv.USE_EXTERNAL_CHROME) {
      await bot.connect(config)
    } else {
      await bot.launchInternalChromium(config, normalizedEnv)
    }
  }
  const bookingData = buildBookingDataFromEnv(normalizedEnv, date)
  return bot.run(bookingData)
})

ipcMain.handle('bot:runAll', async (event, { items }) => {
  const tasks = items.map(async ({ profileId, envObj, date }) => {
    const bot = ensureBot(profileId)
    const normalizedEnv = normalizeEnv(envObj)
    const config = buildConfigFromEnv(normalizedEnv)
    if (!bot.isConnected()) {
      if (normalizedEnv && normalizedEnv.USE_EXTERNAL_CHROME) {
        await bot.connect(config)
      } else {
        await bot.launchInternalChromium(config, normalizedEnv)
      }
    }
    const bookingData = buildBookingDataFromEnv(normalizedEnv, date)
    return bot.run(bookingData)
  })
  return Promise.allSettled(tasks)
})

ipcMain.handle('bot:close', async (event, { profileId }) => {
  const bot = bots.get(profileId)
  if (bot) {
    await bot.close()
    bots.delete(profileId)
  }
  return true
})

ipcMain.handle('bot:isConnected', async (event, { profileId }) => { const bot = ensureBot(profileId); return bot.isConnected() })

// Profiles storage in userData
const profilesPath = () => path.join(app.getPath('userData'), 'profiles.json')
ipcMain.handle('profiles:read', async () => {
  const p = profilesPath()
  if (!fs.existsSync(p)) return { profiles: [], lastActiveProfileId: null }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return { profiles: [], lastActiveProfileId: null } }
})
ipcMain.handle('profiles:write', async (event, data) => {
  const p = profilesPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  return true
})

/* Ensure per-profile BotController and wire log forwarding to renderer. */
function ensureBot(profileId = 'default') {
  if (!bots.has(profileId)) {
    const instance = new BotController()

    bots.set(profileId, instance)
  }
  return bots.get(profileId)
}

function normalizeEnv(env) {
  const out = { ...env }
  // expand ~ and make absolute user-data dir, create if missing
  if (out.CHROME_USER_DATA_DIR) {
    let p = out.CHROME_USER_DATA_DIR
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1))
    if (!path.isAbsolute(p)) p = path.join(os.homedir(), p)
    fs.mkdirSync(p, { recursive: true })
    out.CHROME_USER_DATA_DIR = p
  }
  return out
}


