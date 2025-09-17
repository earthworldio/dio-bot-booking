import { BookingService } from './services/bookingService'
import { BotConfig, BookingData } from './types'
import logger from './utils/logger'
import { config, bookingData as envBookingData } from './utils/config'

async function main() {
  
  const today = new Date()
  const targetDate = new Date(today)
  
  targetDate.setDate(today.getDate() + 7)
  
  const dateString = targetDate.toISOString().split('T')[0]
  
  logger.info(`📅 วันนี้: ${today.toLocaleDateString('th-TH')}`)
  logger.info(`🎯 วันที่จะจอง: ${targetDate.toLocaleDateString('th-TH')} (${dateString})`)

  const bookingData: BookingData = {
    ...envBookingData,
    date: dateString
  }

  const bookingService = new BookingService(config)

  try {
    
    await bookingService.initialize()
    
    await bookingService.waitForBookingTime()

    await bookingService.fillBookingForm(bookingData)
    
    await bookingService.clickBookingButton()

    await bookingService.solveCaptcha()
    
    await bookingService.confirmBooking() 

    await new Promise(resolve => { process.stdin.once('data', resolve)})
    
  } catch (error) {
    logger.error('❌ เกิดข้อผิดพลาด:', error)
  }
  
  logger.info('✅ บอทหยุดทำงานแล้ว แต่บราวเซอร์ยังเปิดอยู่')
  logger.info('📌 คุณสามารถทำต่อได้ด้วยตนเอง')
  
  console.log('\n📌 กด Enter เพื่อปิดบอทและบราวเซอร์ หรือ Ctrl+C เพื่อหยุดโดยไม่ปิดบราวเซอร์')
  await new Promise(resolve => {
    process.stdin.once('data', resolve)
  })
  
  await bookingService.close()
  logger.info('👋 ปิดบอทแล้ว')
  process.exit(0)
}


process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})


process.on('SIGINT', () => {
  logger.info('🛑 ได้รับสัญญาณหยุด (Ctrl+C)')
  logger.info('🔄 บราวเซอร์ยังคงเปิดอยู่เพื่อใช้งานต่อ')
  logger.info('✨ ขอบคุณที่ใช้บอท!')
  process.exit(0)
})


main().catch(error => {
  logger.error('เกิดข้อผิดพลาดในการเริ่มต้นบอท:', error)
  process.exit(1)
}) 