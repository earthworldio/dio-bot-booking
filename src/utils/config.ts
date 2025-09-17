import dotenv from 'dotenv'


dotenv.config()

export interface BotConfig {
  targetUrl: string
  bookingTime: string
  headless: boolean
  timeout: number
  chromeUserDataDir: string
  chromeDebugPort: number
}

export interface BookingData {
  name: string
  phone: string
  amount: string
  timeSlot: string
  notes: string
  date: string
}


export const config: BotConfig = {
  targetUrl: process.env.TARGET_URL || 'https://ratchhour.com/services/tables/order',
  bookingTime: process.env.BOOKING_START_TIME || '12:00',
  headless: process.env.HEADLESS === 'true',
  timeout: parseInt(process.env.TIMEOUT || '10000'),
  chromeUserDataDir: process.env.CHROME_USER_DATA_DIR || './user-data',
  chromeDebugPort: parseInt(process.env.CHROME_DEBUG_PORT || '9222')
}

export const bookingData: BookingData = {
  name: process.env.BOOKING_NAME || 'เอิร์ธ',
  phone: process.env.BOOKING_PHONE || '0952802754',
  amount: process.env.BOOKING_AMOUNT || '15',
  timeSlot: process.env.BOOKING_TIME_SLOT || '19:30',
  notes: process.env.BOOKING_NOTES || '',
  date: ''
}
