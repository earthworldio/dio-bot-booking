import puppeteer, { Browser, Page } from 'puppeteer'
import { BookingData, BotConfig  } from '../types'


export class BookingService {
  
  private browser: Browser | null = null
  private page: Page | null = null
  private config: BotConfig

  constructor(config: BotConfig) {
    this.config = config
  }

  /* Initialize with existing browser instance (internal Chromium). */
  async initializeWithBrowser(browser: Browser): Promise<void> {
    try {
      this.browser = browser
      await this.ensurePage()
      console.info('Bot เชื่อมต่อกับ Chromium ภายในสำเร็จ ✅')
    } catch (error) {
      console.error('เชื่อมต่อ Chromium ภายในไม่สำเร็จ ❌', error)
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
        console.info('เชื่อมต่อ Chrome ใหม่สำเร็จ ✅')
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
      console.info(`ใช้ tab ที่มีอยู่แล้ว (${pages.length} tabs)`) 
    } else {
      this.page = await this.browser.newPage()
      console.info('สร้าง tab ใหม่')
    }
    await this.page!.setDefaultTimeout(this.config.timeout)
    try {
      await this.page!.setRequestInterception(true)
      this.page!.on('request', (req) => {
        const type = req.resourceType()
        if (type === 'image' || type === 'media' || type === 'font') {
          req.abort()
        } else {
          req.continue()
        }
      })
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
    const fastMonitorTime = new Date(targetTime.getTime() - 2500)
    
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
        
        await this.page!.waitForFunction(
          `() => {
            const buttons = document.querySelectorAll('button')
            for (const button of buttons) {
              if (button.textContent && button.textContent.trim() === 'จองโต๊ะล่วงหน้า') {
                return true
              }
            }
            return false
          }`,
          { timeout: 10000 }
        )
        
        const buttons = await this.page!.$$('button')
        for (const button of buttons) {
          const buttonText = await button.evaluate(el => el.textContent?.trim())
          if (buttonText === 'จองโต๊ะล่วงหน้า') {
            bookingButton = button
            console.info('เจอปุ่ม จองโต๊ะล่วงหน้า ✅')
            break
          }
        }
        } catch (e) {
        console.warn('⚠️ ไม่เจอปุ่มด้วยข้อความ ลองหาด้วย class...')
        try {
          await this.page!.waitForSelector('button.bg-primary', { timeout: 5000 })
          const buttons = await this.page!.$$('button.bg-primary')
      
      for (const button of buttons) {
        const buttonText = await button.evaluate(el => el.textContent)
        if (buttonText?.includes('จองโต๊ะล่วงหน้า')) {
          bookingButton = button
              console.info('✅ เจอปุ่ม "จองโต๊ะล่วงหน้า" ด้วย class bg-primary')
              break
            }
          }
        } catch (e2) {
          console.warn('⚠️ ไม่เจอปุ่มด้วย class bg-primary')
        }
      
        if (!bookingButton) {
          try {
            console.info('🔍 ลองหาด้วย class inline-flex...')
            const buttons = await this.page!.$$('button.inline-flex')
            
            for (const button of buttons) {
              const buttonText = await button.evaluate(el => el.textContent?.trim())
              if (buttonText === 'จองโต๊ะล่วงหน้า') {
                bookingButton = button
                console.info('✅ เจอปุ่ม "จองโต๊ะล่วงหน้า" ด้วย class inline-flex')
          break
              }
            }
          } catch (e3) {
            console.warn('⚠️ ไม่เจอปุ่มด้วย class inline-flex')
          }
        }
        
        if (!bookingButton) {
          try {
            console.info('🔍 ลองหาด้วย selector ซับซ้อน...')
            const complexButton = await this.page!.$('button.inline-flex.items-center.justify-center[class*="bg-primary"]')
            
            if (complexButton) {
              const buttonText = await complexButton.evaluate(el => el.textContent?.trim())
              if (buttonText === 'จองโต๊ะล่วงหน้า') {
                bookingButton = complexButton
                console.info('✅ เจอปุ่ม "จองโต๊ะล่วงหน้า" ด้วย selector ซับซ้อน')
              }
            }
          } catch (e4) {
            console.warn('⚠️ ไม่เจอปุ่มด้วย selector ซับซ้อน')
          }
        }
      }
      
      if (!bookingButton) {
        throw new Error('ไม่พบปุ่มจองโต๊ะ')
      }
      
      console.info('🎯 พบปุ่มจองโต๊ะ กำลังคลิก...')
    
      const buttonInfo = await bookingButton.evaluate(el => {
        return {
          disabled: el.hasAttribute('disabled'),
          visible: el.offsetParent !== null,
          classes: el.className,
          text: el.textContent?.trim()
        }
      })
      
      console.info(`📋 ข้อมูลปุ่ม: ${JSON.stringify(buttonInfo)}`)
      
      await bookingButton.scrollIntoView()
      
      

      let clickSuccess = false
      
      try {
        console.info('🖱️ ลองคลิกแบบปกติ...')
        await bookingButton.click()
        clickSuccess = true
        console.info('✅ คลิกแบบปกติสำเร็จ')
      } catch (e) {
        console.warn('⚠️ คลิกแบบปกติไม่ได้')
      }
      
      if (!clickSuccess) {
        try {
          console.info('🖱️ ลองคลิกด้วย evaluate...')
          await bookingButton.evaluate(el => el.click())
          clickSuccess = true
          console.info('✅ คลิกด้วย evaluate สำเร็จ')
        } catch (e) {
          console.warn('⚠️ คลิกด้วย evaluate ไม่ได้')
        }
      }
      
      if (!clickSuccess) {
        try {
          console.info('🖱️ ลองส่ง click event...')
          await bookingButton.evaluate(`el => {
            const event = new window.MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            })
            el.dispatchEvent(event)
          }`)
          clickSuccess = true
          console.info('✅ ส่ง click event สำเร็จ')
        } catch (e) {
          console.warn('⚠️ ส่ง click event ไม่ได้')
        }
      }
      
      if (!clickSuccess) {
        throw new Error('ไม่สามารถคลิกปุ่มได้ด้วยวิธีใดๆ')
      }
      
      console.info('✅ คลิกปุ่มจองโต๊ะแล้ว กำลังรอหน้าถัดไป...')
    
      try {
        await this.page!.waitForFunction(
          `() => {
            // หา CAPTCHA section ที่ไม่มี hidden class
            const captchaSection = document.querySelector('section.space-y-6:not(.hidden)')
            const captchaInput = document.querySelector('input#small-input')
            const confirmButton = document.querySelector('button:not([class*="hidden"])')
            
            // ตรวจสอบว่า section ปรากฏและมี input + button
            if (captchaSection && captchaInput) {
              // ตรวจสอบว่าปุ่มยืนยันมีข้อความที่ถูกต้อง
              const buttons = document.querySelectorAll('button')
              for (const button of buttons) {
                if (button.textContent && button.textContent.includes('ยืนยันการจองโต๊ะ')) {
                  return true
                }
              }
            }
            return false
          }`,
          { timeout: 10000 }
        )
        console.info('🎉 CAPTCHA section ปรากฏแล้ว!')
      } catch (e) {
        const currentUrl = this.page!.url()
        const hasHiddenSection = await this.page!.$('section.space-y-6.hidden')
        const hasVisibleSection = await this.page!.$('section.space-y-6:not(.hidden)')
        
        console.warn(`⚠️ ไม่เจอ CAPTCHA section`)
        console.info(`📍 URL ปัจจุบัน: ${currentUrl}`)
        console.info(`🔍 มี hidden section: ${!!hasHiddenSection}`)
        console.info(`🔍 มี visible section: ${!!hasVisibleSection}`)
        
        throw new Error('ไม่พบ CAPTCHA section หลังจากคลิกปุ่ม')
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
      
      console.info('กำลังแก้ไข CAPTCHA...')

      await this.page!.waitForSelector('section.space-y-6', { timeout: 10000 })
      
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
      console.info('กรอกคำตอบ CAPTCHA เสร็จสิ้น')
      

      console.info('⏰ รอให้ระบบประมวลผล CAPTCHA...')
      
    
      console.info('🔍 รอปุ่ม "ยืนยันการจองโต๊ะ" ปรากฏ...')
      try {
        await this.page!.waitForFunction(
          `() => {
            const buttons = document.querySelectorAll('button')
            for (const button of buttons) {
              if (button.textContent && button.textContent.includes('ยืนยันการจองโต๊ะ')) {
                return true
              }
            }
            return false
          }`,
          { timeout: 10000 }
        )
        console.info('✅ ปุ่ม "ยืนยันการจองโต๊ะ" ปรากฏแล้ว!')
      } catch (e) {
        console.warn('⚠️ ไม่พบปุ่ม "ยืนยันการจองโต๊ะ" - อาจจะยังไม่ validate CAPTCHA สำเร็จ')
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
      console.info('กำลังยืนยันการจอง...')

      
      
      await this.page!.waitForSelector('button.bg-primary', { timeout: 10000 })

      const buttons = await this.page!.$$('button.bg-primary')
      let confirmButton = null
      
      for (const button of buttons) {
        try {
          const buttonText = await button.evaluate(el => el.textContent)
          if (buttonText?.includes('ยืนยันการจองโต๊ะ')) {
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
      

      const captchaInput = await this.page!.$('input#small-input')
      if (captchaInput) {
        const captchaValue = await captchaInput.evaluate(el => (el as any).value)
        console.info(`🔍 ตรวจสอบ CAPTCHA value: "${captchaValue}"`)
        
        if (!captchaValue || captchaValue.trim() === '') {
          console.warn('⚠️ CAPTCHA input ว่าง! กำลังลองกรอกใหม่...')
          try {
            await captchaInput.focus()
            
            await captchaInput.evaluate(el => {
              (el as any).value = ''
              el.dispatchEvent(new Event('input', { bubbles: true }))
            })
            
          } catch (e) {
            console.warn('ไม่สามารถ focus input ได้, ใช้วิธีอื่น')
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
        
        console.info('✅ CAPTCHA ถูกกรอกแล้ว')
      }
      
    
      await confirmButton.click()
      
      console.info('กดปุ่มยืนยันการจองสำเร็จ')
  
      try {
        await this.page!.waitForSelector('h1:contains("Payment")', { timeout: 10000 })
        console.info('ไปยังหน้าชำระเงินสำเร็จ')
      } catch (e) {
        console.info('ไม่พบหน้า Payment, อาจจะไปหน้าอื่น')
      }
      
      console.info('ยืนยันการจองสำเร็จ')
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