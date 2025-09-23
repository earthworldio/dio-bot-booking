export interface BookingData {
  name: string
  phone: string
  amount: string
  timeSlot: string
  notes?: string
  date: string
}

export interface BotConfig {
  targetUrl: string
  bookingTime: string
  headless: boolean
  timeout: number
  chromeUserDataDir: string
  chromeDebugPort: number
}

export interface CaptchaQuestion {
  question: string
  answer: number
}

export interface BotResult {
  success: boolean
  message: string
  bookingId?: string
  error?: string
} 