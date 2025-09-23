import { BookingService } from './services/bookingService'
import { BookingData } from './types'
import { config, bookingData as envBookingData } from './utils/config'

async function main() {
  
  const today = new Date()
  
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + 7)
  
  const dateString = targetDate.toISOString().split('T')[0]
  
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
    console.error('Error : ', error)
  }
  
  await new Promise(resolve => { process.stdin.once('data', resolve)})
  
  await bookingService.close()

  process.exit(0)
}


main().catch(error => {
  console.error('Error : ', error)
  process.exit(1)
}) 