import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import fs from 'fs'
import { BookingService } from '../services/bookingService'
import { BotConfig, BookingData } from '../types'

type LogForwarder = (level: 'info' | 'warn' | 'error', message: string, meta?: unknown) => void

export class BotController {
 
  private bookingService: BookingService | null = null
  private chromeProcess: ChildProcessWithoutNullStreams | null = null
  private logForwarder: LogForwarder | null = null
  private internalBrowser: any | null = null

  constructor() {}


  /* Open external Chrome via shell (legacy). Kept for compatibility; not used in Chromium mode. */
  async openChrome(debugPort: number, userDataDir: string, extraEnv?: Record<string, string | undefined>): Promise<{ pid: number }> {
    if (this.chromeProcess && !this.chromeProcess.killed) {
      return { pid: this.chromeProcess!.pid ?? -1 }
    }

    const scriptPath = path.resolve(process.cwd(), 'start-chrome.sh')
    if (!fs.existsSync(scriptPath)) {
      throw new Error('Not found start-chrome.sh script')
    }

    const spawnEnv: NodeJS.ProcessEnv = { 
      ...process.env, 
      CHROME_DEBUG_PORT: String(debugPort), 
      CHROME_USER_DATA_DIR: userDataDir 
    }

    if (extraEnv && extraEnv.CHROME_PATH) {
      spawnEnv.CHROME_PATH = String(extraEnv.CHROME_PATH)
    }

    this.chromeProcess = spawn('/bin/bash', [scriptPath], {
      env: spawnEnv,
      cwd: process.cwd()
    })

    this.chromeProcess.stdout.on('data', (data) => {
      const text = data.toString()
      this.logForwarder && this.logForwarder('info', text)
    })
    this.chromeProcess.stderr.on('data', (data) => {
      const text = data.toString()
      this.logForwarder && this.logForwarder('warn', text)
    })
    this.chromeProcess.on('exit', (code) => {
      this.logForwarder && this.logForwarder('info', `Chrome exited with code ${code}`)
      this.chromeProcess = null
    })

    return new Promise((resolve, reject) => {
      const pidAtSpawn = this.chromeProcess ? (this.chromeProcess.pid ?? -1) : -1
      const onError = (err: any) => {
        cleanup()
        reject(err)
      }
      const onExit = (code: number | null) => {
        cleanup()
        if (code === 0) {
          resolve({ pid: pidAtSpawn })
        } else {
          reject(new Error(`Chrome started failed with code ${code}`))
        }
      }
      const cleanup = () => {
        if (!this.chromeProcess) return
        this.chromeProcess.off('error', onError)
        this.chromeProcess.off('exit', onExit)
      }
      this.chromeProcess!.once('error', onError)
      this.chromeProcess!.once('exit', onExit)
    })
  }

  /* Connect to internal Chromium (preferred way). */
  async connect(config: BotConfig): Promise<void> {
    await this.launchInternalChromium(config)
  }

  /* Launch Chromium bundled with Electron and prepare a page. */
  async launchInternalChromium(config: BotConfig, envOverride?: Record<string, string | undefined>): Promise<void> {
    const puppeteer = require('puppeteer')
    this.bookingService = new BookingService(config)

    const resolveExecutablePath = (): string | undefined => {
      const manualPath = envOverride?.CHROME_PATH || process.env.CHROME_PATH
      
      if (manualPath && manualPath.trim().length > 0) return manualPath

      const platform = process.platform
      
      if (platform === 'darwin') {
        const macStd = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        return macStd
      }

      return '/usr/bin/google-chrome'
    }

    const executablePath = resolveExecutablePath()

    this.internalBrowser = await puppeteer.launch({
      headless: config.headless,
      userDataDir: config.chromeUserDataDir,
      defaultViewport: null,
      args: ['--blink-settings=imagesEnabled=false'],
      executablePath
    })
    await this.bookingService.initializeWithBrowser(this.internalBrowser)
  }

  /* Orchestrate full booking flow. Assumes browser/page is ready. */
  async run(bookingData: BookingData): Promise<void> {
    if (!this.bookingService) {
      throw new Error('No Puppeteer (initialize) connection')
    }

    const anyService: any = this.bookingService as any
    
    if (typeof anyService.ensureReady === 'function') {
      await anyService.ensureReady()
    }

    await this.bookingService.waitForBookingTime()
    await this.bookingService.fillBookingForm(bookingData)
    await this.bookingService.clickBookingButton()
    await this.bookingService.solveCaptcha()
    await this.bookingService.confirmBooking()
  
  }

  async close(): Promise<void> {
    if (this.bookingService) {
      await this.bookingService.close()
      this.bookingService = null
    }
    if (this.internalBrowser) {
      try { await this.internalBrowser.close() } catch {}
      this.internalBrowser = null
    }
    if (this.chromeProcess && !this.chromeProcess.killed) {
      try { this.chromeProcess.kill() } catch {}
      this.chromeProcess = null
    }
  }

  isConnected(): boolean {
    return this.bookingService !== null
  }
}

export function buildConfigFromEnv(envMap: Record<string, string | undefined>): BotConfig {
  return {
    targetUrl: envMap.TARGET_URL || 'https://ratchhour.com/services/tables/order',
    bookingTime: envMap.BOOKING_START_TIME || '12:00',
    headless: envMap.HEADLESS === 'true',
    timeout: parseInt(envMap.TIMEOUT || '10000'),
    chromeUserDataDir: envMap.CHROME_USER_DATA_DIR || './user-data',
    chromeDebugPort: parseInt(envMap.CHROME_DEBUG_PORT || '9222')
  }
}

export function buildBookingDataFromEnv(envMap: Record<string, string | undefined>, date: string): BookingData {
  return {
    name: envMap.BOOKING_NAME || 'เอิร์ธ',
    phone: envMap.BOOKING_PHONE || '0952802754',
    amount: envMap.BOOKING_AMOUNT || '15',
    timeSlot: envMap.BOOKING_TIME_SLOT || '19:30',
    notes: envMap.BOOKING_NOTES || '',
    date
  }
}


