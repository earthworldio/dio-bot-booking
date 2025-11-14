import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer'
import { BookingData, BotConfig  } from '../types'


export class BookingService {
  
  private browser: Browser | null = null
  private page: Page | null = null
  private config: BotConfig
  private bookingButtonClicked: boolean = false
  private captchaSolved: boolean = false

  constructor(config: BotConfig) {
    this.config = config
  }

  /* Initialize with existing browser instance (internal Chromium). */
  async initializeWithBrowser(browser: Browser): Promise<void> {
    try {
      this.browser = browser
      await this.ensurePage()
    } catch (error) {
      console.error('เชื่อมต่อ Chromium ภายในไม่สำเร็จ ❌ ', error)
      throw error
    }
  }

  public isReady(): boolean {
    return this.browser !== null && this.page !== null
  }

  public async ensureReady(): Promise<void> {
    const isConnected = this.browser && typeof (this.browser as any).isConnected === 'function'
      ? (this.browser as any).isConnected()
      : !!this.browser

    if (!isConnected) {
      try {
        this.browser = await puppeteer.connect({
          browserURL: `http://localhost:${this.config.chromeDebugPort}`,
          defaultViewport: null
        })
      } catch (e) {
        console.error('เชื่อมต่อ Chrome ใหม่ไม่สำเร็จ ❌')
        throw new Error('Browser ยังไม่พร้อม')
      }
    }

    await this.ensurePage()
  }

  private async ensurePage(): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser ยังไม่พร้อม')
    }
    const pages = await this.browser.pages()
    if (pages && pages.length > 0) {
      this.page = pages[pages.length - 1]
    } else {
      this.page = await this.browser.newPage()
    }
    await this.page!.setDefaultTimeout(this.config.timeout)

    try {

      this.page!.removeAllListeners('request')

      await this.page!.setRequestInterception(true)
      const handleRequest = (req: HTTPRequest) => {
        try {
          const type = req.resourceType()
         
          if (type === 'image' || type === 'media' || type === 'font') {
            req.abort()
          } else {
            req.continue()
          }
        } catch {
        
          try { req.continue() } catch {}
        }
      }
      this.page!.on('request', handleRequest)
    } catch {}
  }

  /* Connect to external Chrome via DevTools (legacy path). */
  async initialize(): Promise<void> {
    try {
      try {
        this.browser = await puppeteer.connect({
          browserURL: `http://localhost:${this.config.chromeDebugPort}`,
          defaultViewport: null
        })
        console.info('Bot เชื่อมต่อกับ Chrome สำเร็จ ✅')
      } catch (e) {
        throw new Error('Bot เชื่อมต่อกับ Chrome ไม่สำเร็จ ❌')
      }
      await this.ensurePage()

    } catch (error) {
      console.error('Bot เชื่อมต่อกับ Chrome ไม่สำเร็จ ❌', error)
      throw error
    }
  }

  /* Navigate to target and wait until booking time window is ready. */
  async waitForBookingTime(): Promise<void> {
    
    const [hours, minutes] = this.config.bookingTime.split(':')
    const targetTime = new Date()
    
    targetTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    
    /* { Start fetch website 11:59:58 } */
    const fastMonitorTime = new Date(targetTime.getTime() - 1500)
    
    /* { Go to wait at page } */
    await this.page!.goto(this.config.targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    })

    const currentTime = new Date()

    if (currentTime >= targetTime) {
      console.info('เริ่ม Fast Monitoring Mode! 🚀')
      await this.fastMonitorForForm()
      return
    }
    /* { Wait until target time to start fast monitor } */
    const waitTime = fastMonitorTime.getTime() - currentTime.getTime()
    
    console.info(`⏰ รอในหน้าเว็บจนถึง ${fastMonitorTime.toLocaleTimeString('th-TH')}... (${Math.floor(waitTime / 1000)} วินาที)`)
    
    /* { Wait until target time to start fast monitor } */
    await new Promise(resolve => setTimeout(resolve, waitTime))
    
    await this.fastMonitorForForm()
  }

  /* Aggressively reload the page to detect when the form appears. */
  async fastMonitorForForm(): Promise<void> {
    
    let attemptCount = 0
    const maxAttempts = 600 
    
    while (attemptCount < maxAttempts) {
      try {
        attemptCount++
        console.info(`หาฟอร์มใหม่ครั้งที่ ${attemptCount} `)
        
        await this.page!.reload({ waitUntil: 'domcontentloaded' })
        
        const formCheck = await this.page!.evaluate(() => {
          
          const hasNameInput = !!document.querySelector('input#name')
          const hasPersonInput = !!document.querySelector('input#person')
          const hasPhoneInput = !!document.querySelector('input#contactPhone')
          
          const isCompleteForm = hasNameInput && hasPersonInput && hasPhoneInput
          
          const noWarning = !Array.from(document.querySelectorAll('h1, h2, p')).some(el => 
            el.textContent && el.textContent.includes('ยังไม่สามารถจองโต๊ะได้')
          )
          
          return {
            hasNameInput,
            hasPersonInput,
            hasPhoneInput,
            isCompleteForm,
            noWarning,
            isFormReady: isCompleteForm && noWarning
          }

        })
        
        if (formCheck.isFormReady) {
          console.info(`เจอฟอร์มแล้ว! 🎉`)
          return
        }
      } catch (error) {
        console.info(`ครั้งที่ ${attemptCount} ยังไม่เจอฟอร์ม ❌`)
        await this.page!.reload({ waitUntil: 'domcontentloaded' })
      }
    }
  }

  /* Select date exactly 7 days from now on the calendar widget. */
  async selectDate7DaysFromNow(): Promise<void> {
      try {
  
        let datePicker = await this.page!.$('div.input.relative.cursor-pointer[label="วันที่จอง / Date"]')
  
        if (!datePicker) {
          datePicker = await this.page!.$('div[aria-controls^="radix-:r"]')
        }
        
        if (!datePicker) {
          datePicker = await this.page!.$('div[label="วันที่จอง / Date"]')
        }
        
  
        if (!datePicker) {
          const dateElements = await this.page!.$$('div.input.relative.cursor-pointer')
          for (const element of dateElements) {
            const labelText = await element.evaluate(el => el.querySelector('label')?.textContent)
            if (labelText?.includes('วันที่จอง')) {
              datePicker = element
              break
            }
          }
        }
        
        if (!datePicker) {
          throw new Error('ไม่พบ date picker')
        }
        
        await datePicker.click()
        console.info('คลิก date picker สำเร็จ')
        
    
        const today = new Date()
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + 7)
        
        const targetDay = targetDate.getDate()

        console.info(`วันนี้: ${today.getDate()} ${today.toLocaleDateString('th-TH', { month: 'long' })}`)
        console.info(`วันที่ต้องการ: ${targetDay} ${targetDate.toLocaleDateString('th-TH', { month: 'long' })}`)
      
        
        const result = await this.page!.evaluate((targetDay) => {
          const buttons = document.querySelectorAll('button[name="day"]:not([disabled])')
          
          for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i] as HTMLElement
            if (button.textContent?.trim() === targetDay.toString()) {
              button.click()
              return { success: true, day: targetDay }
            }
          }
          
          return { success: false, day: targetDay }
        }, targetDay)

        let dateFound = false
        
        if (result.success) {
          console.info(`เลือกวันที่ ${result.day} สำเร็จ`)
          dateFound = true
        } else {
          console.warn(`ไม่พบวันที่ ${result.day} ที่เลือกได้`)
        }
        
        
        
        if (!dateFound) {
          console.warn(`ไม่พบวันที่ ${targetDay} ด้วยวิธีที่ 1 ลองวิธีที่ 2...`)
          const dateSelector = `[data-date="${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}"]`
          const dateElement = await this.page!.$(dateSelector)
          
          if (dateElement) {
            await dateElement.click()
            console.info(`เลือกวันที่ ${targetDay} สำเร็จ (วิธีที่ 2: data-date)`)
            dateFound = true
          } else {
            console.warn(`ไม่พบ data-date attribute ลองวิธีที่ 3...`)
            
            try {
              const dateElements = await this.page!.evaluate((targetDay) => {
                const buttons = document.querySelectorAll('button[name="day"]')
                const matchingButtons: Element[] = []
                
                buttons.forEach(button => {
                  if (button.textContent?.trim() === targetDay.toString()) {
                    matchingButtons.push(button)
                  }
                })
                
                return matchingButtons
              }, targetDay)
              
              if (dateElements.length > 0) {
                const dateElement = dateElements[0] as Element
                const isClickable = await this.page!.evaluate((el: Element) => {
                  return !el.hasAttribute('disabled') &&
                         !el.classList.contains('disabled') &&
                         !el.classList.contains('opacity-50')
                }, dateElement)
                
                if (isClickable) {
                  await this.page!.evaluate((el: Element) => (el as HTMLElement).click(), dateElement)
                  console.info(`เลือกวันที่ ${targetDay} สำเร็จ (วิธีที่ 3: evaluate)`)
                  dateFound = true
                } else {
                  console.warn(`วันที่ ${targetDay} ไม่สามารถคลิกได้ (disabled)`)
                }
              } else {
                console.error(`ไม่พบวันที่ ${targetDay} ในปฏิทินเลย จะใช้วันที่ default`)
              }
            } catch (evaluateError) {
              console.warn(`Evaluate method ล้มเหลว: ${evaluateError}`)
              console.error(`ไม่พบวันที่ ${targetDay} ในปฏิทินเลย จะใช้วันที่ default`)
            }
        }
      }
      
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการเลือกวันที่:', error)
        console.warn('จะใช้วันที่ default แทน')
    }
  }

  /* Find and click the primary booking button. */
  async clickBookingButton(): Promise<void> {
    try {
      let bookingButton = null
      
      try {
        
        const buttons = await this.page!.$$('button')
        for (const button of buttons) {
          const buttonText = await button.evaluate(el => el.textContent?.trim())
          if (buttonText === 'จองโต๊ะล่วงหน้า') {
            bookingButton = button

            // คลิกและเช็ค CAPTCHA ทีละครั้ง
            for (let i = 0; i < 3 ; i++) {
              try {
                await button.click()
                console.info(`✅ คลิกปุ่มครั้งที่ ${i + 1}`)
                
                await new Promise(resolve => setTimeout(resolve, 200))
                
                const captchaExists = await this.page!.evaluate(() => {
                  const captchaSection = document.querySelector('section.space-y-6:not(.hidden)')
                  const captchaInput = document.querySelector('input#small-input')
                  return captchaSection && captchaInput
                })
                
                if (captchaExists) {
                  console.info('🎉 CAPTCHA section ปรากฏแล้ว!')
                  this.bookingButtonClicked = true
                  return
                } else {
                  console.info(`ยังไม่เห็น CAPTCHA section หลังคลิกครั้งที่ ${i + 1}`)
                }
                
              } catch (e) {
                console.warn(`⚠️ คลิกครั้งที่ ${i + 1} ไม่ได้:`, e)
              }
            }

            this.bookingButtonClicked = true
            return
          }
        }
        } catch (e) {
          console.error('เกิดข้อผิดพลาดในการคลิกปุ่มจองโต๊ะ:', e)
        }

      
    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการคลิกปุ่มจองโต๊ะ:', error)
      throw error
      
    }
  }

  async fillBookingForm(data: BookingData , retryCount: number = 0): Promise<void> {
    try {
        await this.page!.waitForSelector('input#name', { timeout: 5000 })
        await this.page!.type('input#name', data.name)
      
        await this.page!.waitForSelector('input#person', { timeout: 5000 })
        await this.page!.type('input#person', data.amount)

        await this.selectDate7DaysFromNow()
        
        await this.page!.waitForSelector('input#contactPhone', { timeout: 5000 })
        await this.page!.type('input#contactPhone', data.phone)
        
        console.info('กรอกข้อมูลการจองเสร็จสิ้น ✅')
    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการกรอกข้อมูลการจอง:', error)
      if (retryCount < 50) {  
        console.info(`🔄 ลองใหม่ครั้ง่ที่ (${retryCount + 1}/50)...`)
        await this.page!.reload({ waitUntil: 'domcontentloaded' })
        
        return this.fillBookingForm(data, retryCount + 1)
      } else {
        console.info('ไม่สามารถกรอกข้อมูลการจองได้')
        throw error
      }
    }
  }

  /* Parse and solve simple math CAPTCHA, then fill the answer. */
  async solveCaptcha(): Promise<void> {
    try {
      
      if(this.bookingButtonClicked) {
        console.log('this.bookingButtonClicked true', this.bookingButtonClicked)
        // Wait for visible captcha section or the input field to appear
        await this.page!.waitForSelector('section.space-y-6:not(.hidden), input#small-input', { timeout: this.config.timeout })
      
        const captchaElements = await this.page!.$$('h1.text-lg.font-medium')
        let questionElement = null
        
        for (const element of captchaElements) {
          const text = await element.evaluate(el => el.textContent)
          if (text && text.includes('=') && text.includes('?')) {
            questionElement = element
            break
          }
        }
        
        if (!questionElement) {
          throw new Error('ไม่พบคำถาม CAPTCHA')
        }
        
        const questionText = await questionElement.evaluate(el => el.textContent)
        console.info(`คำถาม CAPTCHA: ${questionText}`)
        
        if (!questionText) {
          throw new Error('ไม่พบข้อความคำถาม CAPTCHA')
        }
        
        
        const answer = this.solveMathQuestion(questionText)
        console.info(`คำตอบ CAPTCHA: ${answer}`)
        
        await this.page!.type('input#small-input', answer.toString())
        try {
          // Allow both "ยืนยันการจองโต๊ะ" and "ยืนยันการจอง"
          await this.page!.waitForFunction(
            `() => {
              const buttons = document.querySelectorAll('button')
              for (const button of buttons) {
                const t = (button.textContent || '').trim()
                if (t.includes('ยืนยันการจองโต๊ะ') || t.includes('ยืนยันการจอง')) {
                  return true
                }
              }
              return false
            }`,
            { timeout: 5000 }
          )
          this.captchaSolved = true
          console.log('solveCaptcha');
          return 
        } catch (e) {
          console.warn('⚠️ ไม่พบปุ่ม "ยืนยันการจองโต๊ะ" - CAPTCHA อาจจะไม่สำเร็จ จะลองใหม่ใน confirmBooking()')
        }
      }

      
      console.info('CAPTCHA เสร็จสิ้น')
      
    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการแก้ไข CAPTCHA:', error)
      console.info('🔄 บราวเซอร์ยังเปิดอยู่ คุณสามารถแก้ CAPTCHA เองได้')
    }
  }

  /* Solve math expression in the format: A (+|-|×) B. */
  private solveMathQuestion(question: string): number {

    const match = question.match(/(\d+)\s*([+\-×])\s*(\d+)/)
    if (!match) {
      throw new Error(`ไม่สามารถแยกคำถามได้: ${question}`)
    }
    
    const num1 = parseInt(match[1])
    const operator = match[2]
    const num2 = parseInt(match[3])
    
    switch (operator) {
      case '+':
        return num1 + num2
      case '-':
        return num1 - num2
      case '×':
        return num1 * num2
      default:
        throw new Error(`ไม่รองรับเครื่องหมาย: ${operator}`)
    }
  }

  /* Final confirmation click; verifies CAPTCHA input before submitting. */
  async confirmBooking(): Promise<void> {
    try {
      // Try to find primary buttons first, then fall back to scanning all buttons
      let buttons = await this.page!.$$('button.bg-primary')
      if (!buttons || buttons.length === 0) {
        await this.page!.waitForSelector('button, [role="button"]', { timeout: this.config.timeout })
        buttons = await this.page!.$$('button, [role="button"]') as any
      }
      let confirmButton = null
      
      for (const button of buttons) {
        try {
          const buttonText = await button.evaluate(el => el.textContent)
          if (buttonText && (buttonText.includes('ยืนยันการจองโต๊ะ') || buttonText.includes('ยืนยันการจอง') || buttonText.includes('ยืนยัน'))) {
            confirmButton = button
            break
          }
        } catch (e) {
          console.warn('ไม่สามารถอ่านข้อความของปุ่มได้')
          continue
        }
      }
      
      if (!confirmButton) {
        throw new Error('ไม่พบปุ่มยืนยันการจอง')
      }
      
      try {
        await confirmButton.evaluate(el => el.offsetParent !== null)
      } catch (e) {
        throw new Error('ปุ่มยืนยันการจองหายไปจาก DOM')
      }
    
      if (!this.captchaSolved) {
        
        const captchaInput = await this.page!.$('input#small-input')
        if (captchaInput) {
          
          const captchaValue = await captchaInput.evaluate(el => (el as any).value)
          
          if (!captchaValue || captchaValue.trim() === '') {
            try {
              
              await captchaInput.focus()
              
              await captchaInput.evaluate(el => {
                (el as any).value = ''
                el.dispatchEvent(new Event('input', { bubbles: true }))
              })
              
            } catch (e) {
              await captchaInput.evaluate(el => (el as any).value = '')
              
            }
          
            const captchaElements = await this.page!.$$('h1.text-lg.font-medium')
            let questionElement = null
            
            for (const element of captchaElements) {
              const text = await element.evaluate(el => el.textContent)
              if (text && text.includes('=') && text.includes('?')) {
                questionElement = element
                break
              }
            }
            
            if (questionElement) {
              const questionText = await questionElement.evaluate(el => el.textContent)
              if (!questionText) {
                throw new Error('ไม่พบข้อความคำถาม CAPTCHA')
              }
              const answer = this.solveMathQuestion(questionText)
              console.info(`🔄 กรอก CAPTCHA ใหม่: ${answer}`)
              
              await captchaInput.evaluate((el, value) => {
                (el as any).value = value
                el.dispatchEvent(new Event('input', { bubbles: true }))
                el.dispatchEvent(new Event('change', { bubbles: true }))
              }, answer.toString())
              
              
              const newValue = await captchaInput.evaluate(el => (el as any).value)
              if (!newValue) {
                throw new Error('ไม่สามารถกรอก CAPTCHA ได้')
              }
            } else {
              throw new Error('ไม่พบคำถาม CAPTCHA')
            }
          }
          
        }
      } else {
        console.info('✅ CAPTCHA สำเร็จแล้ว ข้ามการกรอกซ้ำ')
      }
      
      // Small delay to ensure any validation enables the button
      await this.page!.waitForTimeout(150)
      await confirmButton.click()
      
      console.info('กดปุ่มยืนยันการจองสำเร็จ')
      
    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการยืนยันการจอง:', error)
      throw error
    }
  }

  /* Gracefully close puppeteer browser instance. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      console.info('ปิดบราวเซอร์แล้ว')
    }
  }

}