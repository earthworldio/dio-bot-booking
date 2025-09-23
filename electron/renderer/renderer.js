function parseEnvToObj(text) {
  const obj = {}
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      obj[key] = value
    }
  })
  return obj
}

function syncEnvToForm(envObj) {
  const ids = [
    'TARGET_URL','BOOKING_START_TIME','HEADLESS','TIMEOUT','CHROME_USER_DATA_DIR','CHROME_DEBUG_PORT',
    'BOOKING_NAME','BOOKING_PHONE','BOOKING_AMOUNT','BOOKING_TIME_SLOT','BOOKING_NOTES','CHROME_PATH'
  ]
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = envObj[id] || ''
  })
}

function syncFormToEnv() {
  const ids = [
    'TARGET_URL','BOOKING_START_TIME','HEADLESS','TIMEOUT','CHROME_USER_DATA_DIR','CHROME_DEBUG_PORT',
    'BOOKING_NAME','BOOKING_PHONE','BOOKING_AMOUNT','BOOKING_TIME_SLOT','BOOKING_NOTES','CHROME_PATH'
  ]
  const obj = {}
  ids.forEach(id => {
    const el = document.getElementById(id)
    if (el) obj[id] = el.value || ''
  })
  return obj
}

// Optimized logging with batching and virtual scrolling
let logEntries = []
const MAX_LOGS = 1000 // Keep only last 1000 logs
let logContainer = null

function appendLog({ level, message }) {
  if (!logContainer) {
    logContainer = document.getElementById('logs')
  }
  
  // Add to in-memory array
  logEntries.push({ level, message, timestamp: Date.now() })
  
  // Keep only recent logs
  if (logEntries.length > MAX_LOGS) {
    logEntries = logEntries.slice(-MAX_LOGS)
  }
  
  // Batch DOM updates for better performance
  if (!window.logUpdateScheduled) {
    window.logUpdateScheduled = true
    requestAnimationFrame(() => {
      updateLogDisplay()
      window.logUpdateScheduled = false
    })
  }
}

function updateLogDisplay() {
  if (!logContainer) return
  
  const fragment = document.createDocumentFragment()
  

  const recentLogs = logEntries.slice(-100)
  
  recentLogs.forEach(entry => {
    const div = document.createElement('div')
    div.className = `log-entry log-${entry.level}`
    div.textContent = `[${entry.level}] ${entry.message}`
    fragment.appendChild(div)
  })
  
  logContainer.innerHTML = ''
  logContainer.appendChild(fragment)
  logContainer.scrollTop = logContainer.scrollHeight
  
  const logCountEl = document.getElementById('logCount')
  if (logCountEl) {
    logCountEl.textContent = `(${logEntries.length} entries)`
  }
}

// Keep mapping from profileId -> index for pretty labels like [1], [2]
let profileIndexById = new Map()

window.api.onLog((data) => {
  let prefix = ''
  if (data.profileId) {
    const idx = profileIndexById.get(data.profileId)
    if (typeof idx === 'number') {
      prefix = `[${idx + 1}] `
    } else {
      prefix = `[${data.profileId}] `
    }
  }
  appendLog({ level: data.level, message: `${prefix}${data.message}` })
})

window.addEventListener('DOMContentLoaded', () => {
  const btnSaveEnv = document.getElementById('btnSaveEnv')
  const btnRun = document.getElementById('btnRun')
  const btnClose = document.getElementById('btnClose')
  const btnAddProfile = document.getElementById('btnAddProfile')
  const btnRunAll = document.getElementById('btnRunAll')
  const profileTabs = document.getElementById('profileTabs')
  const inpPort = document.getElementById('CHROME_DEBUG_PORT')
  const inpUserData = document.getElementById('CHROME_USER_DATA_DIR')

  let profiles = []
  let activeProfileId = null

  const defaultProfile = (id, basePort = 9225) => ({
    id,
    name: `Profile ${id}`,
    env: {
      TARGET_URL: 'https://ratchhour.com/services/tables/order',
      BOOKING_START_TIME: '12:00',
      HEADLESS: 'false',
      TIMEOUT: '10000',
      CHROME_USER_DATA_DIR: `~/booking-bot-user-data-${basePort}`,
      CHROME_DEBUG_PORT: String(basePort),
      BOOKING_NAME: 'miind',
      BOOKING_PHONE: '0624159297',
      BOOKING_AMOUNT: '10',
      BOOKING_TIME_SLOT: '19:30',
      BOOKING_NOTES: '',
      CHROME_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }
  })

  const nextPort = () => {
    const used = new Set(profiles.map(p => Number(p.env.CHROME_DEBUG_PORT)))
    let p = 9225
    while (used.has(p)) p++
    return p
  }

  const renderTabs = () => {
    if (!profileTabs) return
    profileTabs.innerHTML = ''

    profileIndexById = new Map()
    profiles.forEach((p, idx) => profileIndexById.set(p.id, idx))
    profiles.forEach((p, idx) => {
      const btn = document.createElement('button')
      btn.textContent = `[${idx + 1}]`
      if (p.id === activeProfileId) btn.classList.add('active')
      btn.onclick = () => { activeProfileId = p.id; syncEnvToForm(p.env) }
      profileTabs.appendChild(btn)
    })
  }

  const saveProfiles = async () => {
    await window.api.profilesWrite({ profiles, lastActiveProfileId: activeProfileId })
  }

  const loadProfiles = async () => {
    const data = await window.api.profilesRead()
    profiles = data.profiles || []
    activeProfileId = data.lastActiveProfileId || (profiles[0] && profiles[0].id) || null
    if (!profiles.length) {
      const p = nextPort()
      const prof = defaultProfile('p1', p)
      profiles.push(prof)
      activeProfileId = prof.id
      await saveProfiles()
    }
    const active = profiles.find(p => p.id === activeProfileId)
    if (active) syncEnvToForm(active.env)
    renderTabs()
  }

  ;(async () => {
    await loadProfiles()
    appendLog({ level: 'info', message: 'Profiles loaded' })
  })()

  btnSaveEnv.addEventListener('click', async () => {
    if (!activeProfileId) return
    const envObj = syncFormToEnv()
    const idx = profiles.findIndex(p => p.id === activeProfileId)
    if (idx >= 0) profiles[idx].env = envObj
    await saveProfiles()
    appendLog({ level: 'info', message: 'บันทึกโปรไฟล์แล้ว' })
  })

  // ปุ่มเปิด Chrome ถูกถอดออก: เชื่อม Puppeteer จะดูแลเอง

  // ปุ่มเชื่อม Puppeteer ถูกถอดออก: การรันจะเปิด Chromium ภายในอัตโนมัติ

  btnRun.addEventListener('click', async () => {
    try {
      if (!activeProfileId) return
      const envObj = syncFormToEnv()
      await window.api.runBot(activeProfileId, envObj, '')
      appendLog({ level: 'info', message: 'บอทรันสำเร็จ' })
    } catch (e) {
      appendLog({ level: 'error', message: String(e) })
    }
  })

  btnClose.addEventListener('click', async () => {
    try {
      if (!activeProfileId) return
      await window.api.closeBot(activeProfileId)
      appendLog({ level: 'info', message: 'ปิดบอทแล้ว' })
    } catch (e) {
      appendLog({ level: 'error', message: String(e) })
    }
  })

  if (btnAddProfile) btnAddProfile.addEventListener('click', async () => {
    const id = `p${Date.now()}`
    const p = nextPort()
    const prof = defaultProfile(id, p)
    profiles.push(prof)
    activeProfileId = id
    await saveProfiles()
    renderTabs()
    syncEnvToForm(prof.env)
  })

  if (btnRunAll) btnRunAll.addEventListener('click', async () => {
    try {
      if (activeProfileId) {
        const idx = profiles.findIndex(p => p.id === activeProfileId)
        if (idx >= 0) profiles[idx].env = syncFormToEnv()
        await saveProfiles()
      }
      const items = profiles.map(p => ({ profileId: p.id, envObj: p.env, date: '' }))
      await window.api.runAll(items)
      appendLog({ level: 'info', message: 'สั่ง Run All แล้ว' })
    } catch (e) {
      appendLog({ level: 'error', message: String(e) })
    }
  })
})


