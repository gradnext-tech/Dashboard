import { google } from 'googleapis'

export interface PaymentRecord {
  id: string
  sNo: string
  mentorName: string
  menteeName: string
  sessionDate: string
  sessionStatus: string
  rate: number
  paymentStatus: string
  noOfSessions: number
  totalPayout: number
  rowIndex: number
  mentorEmail?: string
  sheetName?: string // For corporate sessions
  sessionType?: string // Session type for corporate sessions
}

export interface MentorRate {
  mentorName: string
  rate: number
}

export interface MentorBankingDetails {
  mentorName: string
  email: string
  phone?: string
  accountHolderName: string
  accountNumber: string
  ifsc: string
  upiId: string
}

export interface MentorDetails {
  mentorName: string
  email: string
  phone: string
  rate: number
}

export interface CorporateSessionRecord {
  id: string
  sNo: string
  mentorName: string
  mentorEmail: string
  menteeName: string // This will be the sheet name
  menteeEmail: string
  menteePhone: string
  date: string
  time: string
  inviteTitle: string
  invitationStatus: string
  mentorConfirmationStatus: string
  menteeConfirmationStatus: string
  sessionStatus: string
  mentorFeedback: string
  menteeFeedback: string
  paymentStatus: string
  rowIndex: number
  sheetName: string
  customRate?: number
  sessionType?: string
}


class GoogleSheetsService {
  private sheets: any
  private auth: any

  private drive: any

  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
    })
    this.sheets = google.sheets({ version: 'v4', auth: this.auth })
    this.drive = google.drive({ version: 'v3', auth: this.auth })
  }

  private parseDateParts(dateStr?: string | null): { day: number; month: number; year: number } | null {
    if (!dateStr) return null
    const originalTrimmed = dateStr.toString().trim()
    if (!originalTrimmed) return null

    // Extract only the date part to avoid regex failure on "DD/MM/YYYY HH:MM:SS"
    // Also remove common ordinal suffixes like 7th, 1st, 2nd
    const dateOnly = originalTrimmed.split(/\s+/)[0].replace(/(\d+)(st|nd|rd|th)/i, '$1')
    const trimmed = dateOnly

    // Match DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10)
      const month = parseInt(ddmmyyyyMatch[2], 10)
      let year = parseInt(ddmmyyyyMatch[3], 10)
      if (ddmmyyyyMatch[3].length === 2) year += 2000
      return { day, month, year }
    }

    const yyyymmddMatch = trimmed.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/)
    if (yyyymmddMatch) {
      const year = parseInt(yyyymmddMatch[1], 10)
      const month = parseInt(yyyymmddMatch[2], 10)
      const day = parseInt(yyyymmddMatch[3], 10)
      return { day, month, year }
    }

    // Match DD/MM or DD-MM (default to current year)
    const ddmmMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})$/)
    if (ddmmMatch) {
      const day = parseInt(ddmmMatch[1], 10)
      const month = parseInt(ddmmMatch[2], 10)
      const year = new Date().getFullYear()
      return { day, month, year }
    }

    // Match "Weekday, Month Day, Year" or "Month Day, Year" or "Month Day"
    // (e.g. "Monday, January 26", "January 26, 2025")
    const cleanFull = originalTrimmed.replace(/(\d+)(st|nd|rd|th)/i, '$1')
    const months: { [key: string]: number } = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    }

    // Check for "Month Day" or "Month Day Year" formats
    const monthDayYearMatch = cleanFull.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{2,4}))?/)
    if (monthDayYearMatch) {
      const monthStr = monthDayYearMatch[1].toLowerCase()
      const day = parseInt(monthDayYearMatch[2], 10)
      const month = months[monthStr]
      if (month !== undefined) {
        let year = monthDayYearMatch[3] ? parseInt(monthDayYearMatch[3], 10) : new Date().getFullYear()
        if (monthDayYearMatch[3] && monthDayYearMatch[3].length === 2) year += 2000
        return { day, month: month + 1, year }
      }
    }

    try {
      // Fallback for other formats, but be careful with ambiguous formats
      // If it looks like MM/DD/YYYY to JS but the user expects DD/MM/YYYY, this is where it flips.
      // However, we already tried DD/MM above.
      const date = new Date(originalTrimmed)
      if (!isNaN(date.getTime())) {
        const day = date.getDate()
        const month = date.getMonth() + 1
        let year = date.getFullYear()

        // Fix for standard parser behavior where missing year defaults to 2001
        if (year === 2001 && !originalTrimmed.includes('2001') && !originalTrimmed.match(/\b01\b/)) {
          year = new Date().getFullYear()
        }

        return { day, month, year }
      }
    } catch { }

    return null
  }

  private formatDateForSheets(dateStr?: string | null): string {
    const parts = this.parseDateParts(dateStr)
    if (parts) {
      const day = parts.day.toString().padStart(2, '0')
      const monthStr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parts.month - 1]
      const year = parts.year
      // Using "DD MMM YYYY" is the safest format for Google Sheets across all locales
      return `${day} ${monthStr} ${year}`
    }
    return (dateStr || '').toString().trim()
  }

  async getPaymentData(): Promise<PaymentRecord[]> {
    try {
      const spreadsheetId = process.env.GOOGLE_SHEET_ID

      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured')
      }

      // First, let's check if the Session Info sheet exists
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
      })

      const sheets = spreadsheet.data.sheets || []
      const sessionInfoSheet = sheets.find((sheet: any) =>
        sheet.properties?.title?.toLowerCase() === 'session info'
      )

      if (!sessionInfoSheet) {
        console.error('Session Info sheet not found. Available sheets:',
          sheets.map((s: any) => s.properties?.title).filter(Boolean)
        )
        throw new Error('Session Info sheet not found in the spreadsheet')
      }


      // Get all data from the Session Info sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Session Info!A:S', // All columns from A to S
      })

      const rows = response.data.values || []

      if (rows.length === 0) {
        return []
      }

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()

      // Skip header row and process data
      const payments: PaymentRecord[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row.length === 0) continue

        // Parse and format the session date correctly (unambiguous YYYY-MM-DD)
        let sessionDate = row[10] || ''
        const dateParts = this.parseDateParts(sessionDate)
        if (dateParts) {
          const month = dateParts.month.toString().padStart(2, '0')
          const day = dateParts.day.toString().padStart(2, '0')
          sessionDate = `${dateParts.year}-${month}-${day}`
        }

        // Get mentor rate and calculate total payout
        const mentorName = row[7] || ''
        const mentorRate = this.getMentorRate(mentorRates, mentorName)
        const noOfSessions = 1 // Each row represents 1 session
        const totalPayout = mentorRate * noOfSessions

        const payment: PaymentRecord = {
          id: row[0] || `payment_${i}`, // Session ID as primary ID
          sNo: (i).toString(), // Sequential row number for S No (starting from 1)
          mentorName: mentorName, // Mentor Name
          menteeName: row[6] || '', // Candidate Name
          sessionDate: sessionDate, // Session Date
          sessionStatus: row[12] || '', // Session Status
          rate: mentorRate, // Rate from Rate List sheet
          paymentStatus: (row[17] || '').toLowerCase(), // Payment column
          noOfSessions: noOfSessions, // Each row = 1 session (Session Number column is just a counter, not quantity)
          totalPayout: totalPayout, // Calculated total payout
          rowIndex: i + 1, // +1 because sheets are 1-indexed
          mentorEmail: row[4] || '', // Mentor Email (column E, index 4)
        }

        payments.push(payment)
      }
      return payments
    } catch (error) {
      console.error('Error fetching payment data:', error)
      throw error
    }
  }

  async getDuePayments(): Promise<PaymentRecord[]> {
    const allPayments = await this.getPaymentData()

    // Filter payments where Payment column equals "Due"
    const duePayments = allPayments.filter(payment =>
      payment.paymentStatus.toLowerCase().trim() === 'due'
    )

    // Update S No to be sequential for filtered results
    return duePayments.map((payment, index) => ({
      ...payment,
      sNo: (index + 1).toString()
    }))
  }

  async getPendingPayments(): Promise<PaymentRecord[]> {
    // Include both regular and corporate payments when computing pending items
    const allPayments = await this.getAllPaymentsIncludingCorporate()

    // Filter payments where Payment column equals "Pending"
    const pendingPayments = allPayments.filter(payment =>
      payment.paymentStatus.toLowerCase().trim() === 'pending'
    )

    // Update S No to be sequential for filtered results
    return pendingPayments.map((payment, index) => ({
      ...payment,
      sNo: (index + 1).toString()
    }))
  }

  async markAsPaid(paymentId: string): Promise<boolean> {
    try {
      const spreadsheetId = process.env.GOOGLE_SHEET_ID

      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured')
      }

      // Find the payment record to get the row index
      const allPayments = await this.getPaymentData()
      const payment = allPayments.find(p => p.id === paymentId)

      if (!payment) {
        throw new Error('Payment record not found')
      }

      // Update the payment status in the specific cell (Payment column is R, which is column 18)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Session Info!R${payment.rowIndex}`, // Column R is Payment Status in Session Info sheet
        valueInputOption: 'RAW',
        resource: {
          values: [['Paid']],
        },
      })

      return true
    } catch (error) {
      console.error('Error marking payment as paid:', error)
      throw error
    }
  }

  async markMultipleAsPaid(paymentIds: string[]): Promise<boolean> {
    try {
      const spreadsheetId = process.env.GOOGLE_SHEET_ID

      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured')
      }

      // Get all payments to find row indices
      const allPayments = await this.getPaymentData()

      // Prepare batch update requests
      const requests = paymentIds.map(paymentId => {
        const payment = allPayments.find(p => p.id === paymentId)
        if (!payment) return null

        return {
          range: `Session Info!R${payment.rowIndex}`,
          values: [['Paid']],
        }
      }).filter(Boolean)

      if (requests.length === 0) {
        return false
      }

      // Perform batch update
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: requests,
        },
      })

      return true
    } catch (error) {
      console.error('Error marking multiple payments as paid:', error)
      throw error
    }
  }

  async exportToMentorCommission(payments: PaymentRecord[]): Promise<boolean> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID

      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Check if the Mentor Commission sheet exists and get its info
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: mentorCommissionSheetId,
      })

      const sheets = spreadsheet.data.sheets || []

      // Find the specific "Mentor Commission" sheet
      let mentorCommissionSheet = sheets.find((s: any) =>
        s.properties?.title === 'Mentor Commission'
      )

      // If the sheet doesn't exist, create it
      if (!mentorCommissionSheet) {
        console.log('Mentor commission sheet not found, creating it...')

        const addSheetRequest = {
          spreadsheetId: mentorCommissionSheetId,
          resource: {
            requests: [{
              addSheet: {
                properties: {
                  title: 'Mentor Commission'
                }
              }
            }]
          }
        }

        await this.sheets.spreadsheets.batchUpdate(addSheetRequest)

        // Add headers to the new sheet
        const headers = [
          'S No.', 'Mentor Name', 'Mentee Name', 'Session Date',
          'Session Status', 'Rate', 'Payment Status', 'No. of Sessions',
          'Total Payout', 'Revenue per session', 'Total Revenue'
        ]

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: mentorCommissionSheetId,
          range: 'Mentor Commission!A1:K1',
          valueInputOption: 'RAW',
          resource: {
            values: [headers]
          }
        })

        console.log('Mentor commission sheet created successfully')
      }


      // Get the last S No. from the specific sheet to continue the sequence
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId, 'Mentor Commission')
      let currentSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()

      // Prepare data for export (with auto-generated S No. and calculated rates)
      const exportData = payments.map(payment => {
        const normalizedSheetName = (payment.sheetName || '').toString().trim().toLowerCase()
        const isMisc = normalizedSheetName.includes('miscellaneous')
        const isMesaTracker = (payment.sheetName || '').toString().trim().toLowerCase() === 'mesa tracker' ||
          (payment.sheetName || '').toString().trim().toUpperCase() === 'MESA'

        // Check if session is an Assessment for MESA
        const sessionType = (payment.sessionType || '').toString().trim().toLowerCase()
        const isAssessment = sessionType === 'assement' || sessionType === 'assessment' || sessionType === 'assessement'

        // Always trust a valid incoming row rate (already computed upstream for corporate flows).
        // This keeps export/final-payments consistent with the email flow and prevents misc rows
        // from being overwritten by the mentor-rate-sheet default.
        const rowRateIsValid = typeof payment.rate === 'number' && isFinite(payment.rate) && payment.rate > 0
        let mentorRate = rowRateIsValid ? payment.rate : this.getMentorRate(mentorRates, payment.mentorName)

        // Safety fallback for special sheets when incoming rate is missing
        if (!rowRateIsValid && (isMisc || (isMesaTracker && isAssessment))) {
          mentorRate = this.getMentorRate(mentorRates, payment.mentorName)
        }

        const totalPayout = mentorRate * payment.noOfSessions
        const revenuePerSession = mentorRate // Revenue per session is the same as rate
        const totalRevenue = mentorRate * payment.noOfSessions // Total revenue is rate * sessions

        return [
          currentSNo++,                    // S No.
          payment.mentorName,               // Mentor Name
          payment.menteeName,             // Mentee Name
          this.formatDateForSheets(payment.sessionDate), // Session Date (formatted as date)
          'Completed',                    // Session Status (always "Completed" for exported sessions)
          mentorRate,                     // Rate (per-row for Miscellaneous, otherwise from rate list)
          'Due',                          // Payment Status (always "Due" in Mentor Commission)
          payment.noOfSessions,           // No. of Sessions
          totalPayout,                    // Total Payout (rate * sessions)
          revenuePerSession,              // Revenue per session
          totalRevenue                    // Total Revenue
        ]
      })

      // Append data to the specific "Mentor Commission" sheet
      // Use USER_ENTERED to allow Google Sheets to interpret dates properly
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor Commission!A:K', // Use the specific "Mentor Commission" sheet (11 columns: S No. to Total Revenue)
        valueInputOption: 'USER_ENTERED', // Changed from RAW to USER_ENTERED so dates are recognized
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: exportData,
        },
      })


      // Update payment status to "Paid" in the Master Copy (Session Info sheet)
      await this.markExportedPaymentsAsPaid(payments)

      return true
    } catch (error) {
      console.error('Error exporting to Mentor Commission:', error)
      throw error
    }
  }

  async markExportedPaymentsAsPaid(payments: PaymentRecord[]): Promise<boolean> {
    try {
      const spreadsheetId = process.env.GOOGLE_SHEET_ID
      const corporateSpreadsheetId = process.env.CORPORATE_SHEET_ID

      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured')
      }

      // Separate regular payments from corporate payments
      const regularPayments = payments.filter(payment => !payment.sheetName)
      const corporatePayments = payments.filter(payment => payment.sheetName)

      // Handle regular payments (Session Info sheet)
      if (regularPayments.length > 0) {
        const regularRequests = regularPayments.map(payment => ({
          range: `Session Info!R${payment.rowIndex}`, // Column R is Payment Status in Session Info sheet
          values: [['Paid']],
        }))

        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          resource: {
            valueInputOption: 'RAW',
            data: regularRequests,
          },
        })
      }

      // Handle corporate payments (Corporate spreadsheet)
      if (corporatePayments.length > 0 && corporateSpreadsheetId) {
        // Group corporate payments by sheet name
        const corporatePaymentsBySheet = new Map<string, PaymentRecord[]>()
        corporatePayments.forEach(payment => {
          const sheetName = payment.sheetName!
          if (!corporatePaymentsBySheet.has(sheetName)) {
            corporatePaymentsBySheet.set(sheetName, [])
          }
          corporatePaymentsBySheet.get(sheetName)!.push(payment)
        })

        // Update each corporate sheet
        const sheetNames = Array.from(corporatePaymentsBySheet.keys())
        for (const sheetName of sheetNames) {
          const sheetPayments = corporatePaymentsBySheet.get(sheetName)!
          const corporateRequests = sheetPayments.map((payment: PaymentRecord) => ({
            range: `${sheetName}!P${payment.rowIndex}`, // Column P is Payment Status in corporate sheets
            values: [['Paid']],
          }))

          await this.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: corporateSpreadsheetId,
            resource: {
              valueInputOption: 'RAW',
              data: corporateRequests,
            },
          })
        }
      }

      return true
    } catch (error) {
      console.error('Error marking exported payments as paid:', error)
      throw error
    }
  }

  async addManualEntryToMentorCommission(entry: {
    mentorName: string
    menteeName: string
    sessionDate: string
    sessionStatus: string
    rate: number
    paymentStatus: string
    noOfSessions: number
    totalPayout: number
  }): Promise<boolean> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID

      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get the last S No. from the sheet to continue the sequence
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId, 'Mentor Commission')
      const nextSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      const mentorRate = this.getMentorRate(mentorRates, entry.mentorName)

      // Use mentor rate from rates sheet if available, otherwise use provided rate
      const finalRate = mentorRate > 0 ? mentorRate : entry.rate
      const finalTotalPayout = finalRate * entry.noOfSessions

      // Prepare data for manual entry (with auto-generated S No. and calculated rates)
      const revenuePerSession = finalRate // Revenue per session is the same as rate
      const totalRevenue = finalRate * entry.noOfSessions // Total revenue is rate * sessions

      const entryData = [
        nextSNo,                              // S No.
        entry.mentorName,                      // Mentor Name
        entry.menteeName,                      // Mentee Name
        this.formatDateForSheets(entry.sessionDate), // Session Date (formatted as date)
        'Completed',                          // Session Status (always "Completed" for mentor commission entries)
        finalRate,                            // Rate
        entry.paymentStatus,                  // Payment Status
        entry.noOfSessions,                   // No. of Sessions
        finalTotalPayout,                     // Total Payout
        revenuePerSession,                    // Revenue per session
        totalRevenue                          // Total Revenue
      ]

      // Append data to the specific "Mentor Commission" sheet
      // Use USER_ENTERED to allow Google Sheets to interpret dates properly
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor Commission!A:K', // Use the specific "Mentor Commission" sheet
        valueInputOption: 'USER_ENTERED', // Changed from RAW to USER_ENTERED so dates are recognized
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [entryData],
        },
      })

      return true
    } catch (error) {
      console.error('Error adding manual entry to Mentor Commission:', error)
      throw error
    }
  }

  async getLastSNoFromMentorCommission(mentorCommissionSheetId: string, sheetName: string = 'Mentor Commission'): Promise<number> {
    try {
      // Get all data from the specific Mentor Commission sheet to find the last S No.
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: `${sheetName}!A:A`, // Only get the S No. column from the specific sheet
      })

      const rows = response.data.values || []

      if (rows.length <= 1) {
        // If only header or no data, start from 0
        return 0
      }

      // Skip header row and find the highest S No.
      let maxSNo = 0
      for (let i = 1; i < rows.length; i++) {
        const sNoValue = rows[i][0]
        if (sNoValue && !isNaN(Number(sNoValue))) {
          const sNo = parseInt(sNoValue)
          if (sNo > maxSNo) {
            maxSNo = sNo
          }
        }
      }

      return maxSNo
    } catch (error) {
      console.error('Error getting last S No. from Mentor Commission:', error)
      // If there's an error, start from 0
      return 0
    }
  }

  async markMentorCommissionRowsAsPaid(mentorName: string): Promise<boolean> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Read all rows from Mentor commission sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:I',
      })

      const rows: string[][] = response.data.values || []
      if (rows.length <= 1) {
        return false
      }

      const normalizedTarget = (mentorName || '').trim().toLowerCase()
      const updates: Array<{ range: string; values: string[][] }> = []

      // Rows are 1-indexed in Sheets; header is at row 1
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const nameCell = (row[1] || '').trim().toLowerCase() // Column B (index 1) = Mentor Name
        const paymentStatus = (row[6] || '').trim().toLowerCase() // Column G (index 6) = Payment Status

        if (nameCell === normalizedTarget && paymentStatus !== 'paid') {
          const rowNumber = i + 1
          updates.push({
            range: `Mentor commission!G${rowNumber}`,
            values: [['Paid']],
          })
        }
      }

      if (updates.length === 0) {
        return false
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: mentorCommissionSheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updates,
        },
      })

      return true
    } catch (error) {
      console.error('Error marking Mentor commission rows as paid:', error)
      throw error
    }
  }

  async getMentorRates(): Promise<MentorRate[]> {
    try {
      const rateListSheetId = process.env.RATE_LIST_SHEET_ID

      if (!rateListSheetId) {
        throw new Error('RATE_LIST_SHEET_ID is not configured')
      }


      // Get all data from the Rate List sheet (Full Name and Rate columns)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: rateListSheetId,
        range: 'B:M', // Full Name (B) and Rate (M) columns
      })

      const rows = response.data.values || []

      if (rows.length === 0) {
        return []
      }

      // Process the data (Column B: Full Name, Column M: Rate)
      const mentorRates: MentorRate[] = []

      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (row.length === 0) continue

        const mentorName = (row[0] || '').trim() // Column B: Full Name
        const rateValue = row[11] || '0' // Column M: Rate (index 11 since we're reading B:M)

        // Parse the rate value
        let rate = 0
        if (rateValue && !isNaN(Number(rateValue))) {
          rate = parseFloat(rateValue)
        }

        if (mentorName && rate > 0) {
          mentorRates.push({
            mentorName: mentorName.toLowerCase().trim(),
            rate: rate
          })
        }
      }

      return mentorRates
    } catch (error) {
      console.error('Error fetching mentor rates:', error)
      // Return empty array if there's an error
      return []
    }
  }

  async getMentorDetails(): Promise<MentorDetails[]> {
    try {
      const rateListSheetId = process.env.RATE_LIST_SHEET_ID

      if (!rateListSheetId) {
        throw new Error('RATE_LIST_SHEET_ID is not configured')
      }


      // Get all data from the Rate List sheet (Full Name, Email, Phone, Rate)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: rateListSheetId,
        range: 'A:M', // All columns from A to M
      })

      const rows = response.data.values || []

      if (rows.length === 0) {
        return []
      }

      // Process the data
      // Columns: A=Timestamp, B=Full Name, C=Email ID, D=Phone Number, M=Rate
      const mentorDetails: MentorDetails[] = []


      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (row.length === 0) continue

        const mentorName = (row[1] || '').trim() // Column B: Full Name
        let email = (row[2] || '').trim() // Column C: Email ID
        const phone = (row[3] || '').trim() // Column D: Phone Number
        const rateValue = row[12] || '0' // Column M: Rate

        // If no email in column C, search other columns for email pattern
        if (!email || email === '') {
          for (let j = 0; j < row.length; j++) {
            const cellValue = (row[j] || '').trim()
            if (cellValue && cellValue.includes('@') && cellValue.includes('.')) {
              email = cellValue
              break
            }
          }
        }


        // Parse the rate value
        let rate = 0
        if (rateValue && !isNaN(Number(rateValue))) {
          rate = parseFloat(rateValue)
        }

        if (mentorName) {
          mentorDetails.push({
            mentorName: mentorName.toLowerCase().trim(),
            email: email,
            phone: phone,
            rate: rate
          })
        }
      }

      return mentorDetails
    } catch (error) {
      console.error('Error fetching mentor details:', error)
      return []
    }
  }

  async getMentorBankingDetails(): Promise<MentorBankingDetails[]> {
    try {
      const rateListSheetId = process.env.RATE_LIST_SHEET_ID

      if (!rateListSheetId) {
        throw new Error('RATE_LIST_SHEET_ID is not configured')
      }

      // Get all data from the Rate List sheet
      // Columns: A=Timestamp, B=Full Name, C=Email ID, D=Phone Number, E=PAN, F=Aadhar Card Number, 
      // G=Name on the Account, H=Account Number, I=Bank Name, J=Branch Name, K=Bank IFSC Code, L=UPI ID, M=Rate
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: rateListSheetId,
        range: 'A:M', // All columns from A to M
      })

      const rows = response.data.values || []

      if (rows.length === 0) {
        return []
      }

      const bankingDetails: MentorBankingDetails[] = []

      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (row.length === 0) continue

        const mentorName = (row[1] || '').trim() // Column B: Full Name
        const email = (row[2] || '').trim() // Column C: Email ID
        const phone = (row[3] || '').trim() // Column D: Phone Number
        const accountHolderName = (row[6] || '').trim() // Column G: Name on the Account
        const accountNumber = (row[7] || '').trim() // Column H: Account Number
        const ifsc = (row[10] || '').trim() // Column K: Bank IFSC Code
        const upiId = (row[11] || '').trim() // Column L: UPI ID

        if (mentorName) {
          bankingDetails.push({
            mentorName: mentorName.toLowerCase().trim(),
            email: email,
            phone: phone,
            accountHolderName: accountHolderName,
            accountNumber: accountNumber,
            ifsc: ifsc,
            upiId: upiId
          })
        }
      }

      return bankingDetails
    } catch (error) {
      console.error('Error fetching mentor banking details:', error)
      return []
    }
  }

  async getMentorPAN(mentorName: string): Promise<string> {
    try {
      const rateListSheetId = process.env.RATE_LIST_SHEET_ID
      if (!rateListSheetId) {
        throw new Error('RATE_LIST_SHEET_ID is not configured')
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: rateListSheetId,
        range: 'A:M',
      })

      const rows = response.data.values || []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue
        const name = (row[1] || '').toString().trim().toLowerCase()
        if (name && name === mentorName.toLowerCase().trim()) {
          return (row[4] || '').toString().trim() // Column E: PAN
        }
      }
      return ''
    } catch (error) {
      console.error('Error fetching mentor PAN:', error)
      return ''
    }
  }

  getMentorRate(mentorRates: MentorRate[], mentorName: string): number {
    const normalizedMentorName = mentorName.toLowerCase().trim()
    const mentorRate = mentorRates.find(rate =>
      rate.mentorName.toLowerCase().trim() === normalizedMentorName
    )
    return mentorRate ? mentorRate.rate : 0
  }

  async getDuePayoutsByMentor(): Promise<Array<{
    mentorName: string;
    mentorEmail: string;
    totalPayout: number;
    sessions: number;
    monthlyBreakdown: Array<{ month: string; payout: number; sessions: number }>
    sessionsBreakdown: Array<{ date: string; menteeName: string; sessions: number; payout: number }>
  }>> {
    const duePayments = await this.getDuePayments()
    const aggregation = new Map<string, {
      mentorName: string;
      mentorEmail: string;
      totalPayout: number;
      sessions: number;
      monthlyBreakdown: Map<string, { payout: number; sessions: number }>
      sessionsBreakdown: Array<{ date: string; menteeName: string; sessions: number; payout: number }>
    }>()

    for (const p of duePayments) {
      // Use mentor name as primary key to avoid duplicate entries
      const key = p.mentorName.toLowerCase().trim()
      let existing = aggregation.get(key)

      if (!existing) {
        existing = {
          mentorName: p.mentorName,
          mentorEmail: p.mentorEmail || '',
          totalPayout: 0,
          sessions: 0,
          monthlyBreakdown: new Map(),
          sessionsBreakdown: []
        }
        aggregation.set(key, existing)
      } else {
        // If we already have an entry for this mentor, use the email if current session has one and existing doesn't
        if (p.mentorEmail && p.mentorEmail.trim() && !existing.mentorEmail) {
          existing.mentorEmail = p.mentorEmail
        }
      }

      existing.totalPayout += p.totalPayout
      existing.sessions += p.noOfSessions

      // Push per-session breakdown entry
      existing.sessionsBreakdown.push({
        date: p.sessionDate,
        menteeName: p.menteeName,
        sessions: p.noOfSessions,
        payout: p.totalPayout,
      })

      // Extract month from session date
      let monthKey = 'Unknown Month'
      try {
        const date = new Date(p.sessionDate)
        if (!isNaN(date.getTime())) {
          monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
        }
      } catch (e) {
        console.warn(`Could not parse date: ${p.sessionDate}`)
      }

      const monthData = existing.monthlyBreakdown.get(monthKey) || { payout: 0, sessions: 0 }
      monthData.payout += p.totalPayout
      monthData.sessions += p.noOfSessions
      existing.monthlyBreakdown.set(monthKey, monthData)
    }

    return Array.from(aggregation.values()).map(entry => ({
      mentorName: entry.mentorName,
      mentorEmail: entry.mentorEmail,
      totalPayout: entry.totalPayout,
      sessions: entry.sessions,
      monthlyBreakdown: Array.from(entry.monthlyBreakdown.entries())
        .map(([month, data]) => ({ month, payout: data.payout, sessions: data.sessions }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      sessionsBreakdown: entry.sessionsBreakdown.sort((a, b) => {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        if (isNaN(da) || isNaN(db)) {
          return 0
        }
        return da - db
      })
    }))
  }

  async getCorporateSessionsData(): Promise<CorporateSessionRecord[]> {
    try {
      const corporateSpreadsheetId = process.env.CORPORATE_SHEET_ID

      if (!corporateSpreadsheetId) {
        throw new Error('CORPORATE_SHEET_ID is not configured')
      }

      // Get all sheets in the corporate spreadsheet
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: corporateSpreadsheetId,
      })

      const sheets = spreadsheet.data.sheets || []

      const allCorporateSessions: CorporateSessionRecord[] = []
      let globalSNo = 1

      // Helper: chunk arrays to keep response sizes reasonable
      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = []
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
        return out
      }

      const isSkippableTitle = (title: string) => {
        const t = (title || '').toString().trim().toLowerCase()
        if (!t) return true
        // Common non-session/system tabs we never want to read
        if (t.includes('summary') || t.includes('template')) return true
        if (t.includes('mentee email') || t.includes('mentor email')) return true
        if (t.includes('email address') || t.includes('emails')) return true
        if (t.includes('config') || t.includes('lookup') || t.includes('master')) return true
        return false
      }

      // Collect candidate sheet titles first (avoid per-sheet requests)
      const sheetTitles = sheets
        .map((s: any) => (s?.properties?.title as string) || '')
        .filter(Boolean)
        .filter((t: string) => !isSkippableTitle(t))

      // Expected headers for corporate structure validation
      const expectedHeaders = ['Sr No.', 'Mentor Name', 'Mentor Email', 'Mentee Name', 'Mentee Email', 'Mentee Phone', 'Date', 'Time', 'Invite Title', 'Invitation Status', 'Mentor Confirmation Status', 'Mentee Confirmation Status', 'Session Status', 'Mentor Feedback', 'Mentee Feedback', 'Payment Status']

      // Robustly parse mentor rate if present (currency/text tolerant)
      const parseRate = (value: any): number | undefined => {
        if (value === undefined || value === null) return undefined
        const raw = String(value).trim()
        if (!raw) return undefined
        const cleaned = raw.replace(/[^0-9.\-]/g, '')
        const num = Number(cleaned)
        return Number.isFinite(num) && num > 0 ? num : undefined
      }

      // Batch read sheets in chunks to reduce API calls (avoids 429 quota errors)
      for (const titlesChunk of chunk(sheetTitles, 25)) {
        try {
          const ranges = titlesChunk.map(t => `${t}!A:Z`)
          const batch = await this.sheets.spreadsheets.values.batchGet({
            spreadsheetId: corporateSpreadsheetId,
            ranges,
          })

          const valueRanges = batch.data.valueRanges || []

          for (const vr of valueRanges) {
            const range = vr.range || ''
            const sheetTitle = range.split('!')[0] || ''
            const rows = vr.values || []

            if (!sheetTitle || rows.length <= 1) continue

            const headerRow = rows[0] || []
            const isMiscSheet = (sheetTitle || '').toString().trim().toLowerCase().includes('miscellaneous')

            const hasValidStructure = expectedHeaders.every((expectedHeader, index) => {
              const actualHeader = (headerRow[index] || '').toString().trim()
              return actualHeader.toLowerCase().includes(expectedHeader.toLowerCase().split(' ')[0])
            })

            if (!hasValidStructure && !isMiscSheet) continue

            // Find Mentor Rate column dynamically
            const mentorRateIndex = (() => {
              const normalizedHeaders = headerRow.map((h: string) => (h || '').toString().trim().toLowerCase())
              const candidates = isMiscSheet
                ? ['mentor rate', 'rate', 'mentor base rate', 'payment rate']
                : ['mentor rate']

              for (const key of candidates) {
                const idx = normalizedHeaders.findIndex((h: string) => h === key)
                if (idx >= 0) return idx
              }
              for (const key of candidates) {
                const idx = normalizedHeaders.findIndex((h: string) => h.includes(key))
                if (idx >= 0) return idx
              }
              return -1
            })()

            for (let i = 1; i < rows.length; i++) {
              const row = rows[i]
              if (!row || row.length === 0) continue

              // Parse and format the session date correctly (unambiguous YYYY-MM-DD)
              let sessionDate = row[6] || ''
              const dateParts = this.parseDateParts(sessionDate)
              if (dateParts) {
                const month = dateParts.month.toString().padStart(2, '0')
                const day = dateParts.day.toString().padStart(2, '0')
                sessionDate = `${dateParts.year}-${month}-${day}`
              }

              const corporateSession: CorporateSessionRecord = {
                id: `corporate_${sheetTitle}_${i}`,
                sNo: globalSNo.toString(),
                mentorName: row[1] || '',
                mentorEmail: row[2] || '',
                menteeName: row[3] || '',
                menteeEmail: row[4] || '',
                menteePhone: row[5] || '',
                date: sessionDate,
                time: row[7] || '',
                inviteTitle: row[8] || '',
                invitationStatus: row[9] || '',
                mentorConfirmationStatus: row[10] || '',
                menteeConfirmationStatus: row[11] || '',
                sessionStatus: row[12] || '',
                mentorFeedback: row[13] || '',
                menteeFeedback: row[14] || '',
                paymentStatus: row[15] || '',
                rowIndex: i + 1,
                sheetName: sheetTitle,
                customRate: mentorRateIndex >= 0 ? parseRate(row[mentorRateIndex]) : undefined,
                sessionType: row[17] || ''
              }

              allCorporateSessions.push(corporateSession)
              globalSNo++
            }
          }
        } catch (chunkError) {
          console.error(`Error processing corporate sheet chunk:`, chunkError)
          // Continue with other chunks even if one fails
        }
      }

      return allCorporateSessions
    } catch (error) {
      console.error('Error fetching corporate sessions data:', error)
      throw error
    }
  }

  async getCorporateDuePayments(): Promise<CorporateSessionRecord[]> {
    const allSessions = await this.getCorporateSessionsData()

    // Filter sessions where Payment Status equals "Due"
    const dueSessions = allSessions.filter(session =>
      session.paymentStatus.toLowerCase().trim() === 'due'
    )

    // Update S No to be sequential for filtered results
    return dueSessions.map((session, index) => ({
      ...session,
      sNo: (index + 1).toString()
    }))
  }

  async getAllPaymentsIncludingCorporate(): Promise<PaymentRecord[]> {
    try {
      // Get regular payments
      const regularPayments = await this.getPaymentData()

      // Get corporate sessions
      const corporateSessions = await this.getCorporateSessionsData()

      // Convert corporate sessions to PaymentRecord format
      const corporatePayments: PaymentRecord[] = corporateSessions.map(session => ({
        id: session.id,
        sNo: session.sNo,
        mentorName: session.mentorName,
        menteeName: session.menteeName, // This is the actual mentee name
        sessionDate: session.date,
        sessionStatus: session.sessionStatus,
        rate: session.customRate ?? 0, // Prefer custom rate if available
        paymentStatus: session.paymentStatus,
        noOfSessions: 1, // Each corporate session is typically 1 session
        totalPayout: 0, // Will calculate below
        rowIndex: session.rowIndex,
        mentorEmail: session.mentorEmail,
        sheetName: session.sheetName, // Add the sheet name for corporate sessions
        sessionType: session.sessionType // Add the session type
      }))

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()

      // Calculate rates and payouts for corporate sessions
      corporatePayments.forEach(payment => {
        const isMisc = (payment.sheetName || '').toString().trim().toLowerCase().includes('miscellaneous')
        const isMesaTracker = (payment.sheetName || '').toString().trim().toLowerCase() === 'mesa tracker' ||
          (payment.sheetName || '').toString().trim().toUpperCase() === 'MESA'

        // For Miscellaneous Tracker: strictly use per-row Mentor Rate (no fallback to rate list)
        if (isMisc) {
          const hasValidRowRate = typeof payment.rate === 'number' && isFinite(payment.rate) && payment.rate > 0
          payment.totalPayout = hasValidRowRate ? (payment.rate * payment.noOfSessions) : 0
          return
        }

        // For other corporate sheets: use per-row rate if present, otherwise fallback to mentor rates sheet
        let baseRate = 0
        if (typeof payment.rate === 'number' && isFinite(payment.rate) && payment.rate > 0) {
          baseRate = payment.rate
        } else {
          const mentorRate = this.getMentorRate(mentorRates, payment.mentorName)
          payment.rate = mentorRate
          baseRate = mentorRate
        }

        // For Mesa Tracker: apply 1.5x multiplier if session type is "Assessment"
        if (isMesaTracker) {
          // Get session type from the corporate session
          const sessionType = (payment.sessionType || '').toString().trim().toLowerCase()

          // Check for various spellings of Assessment
          if (sessionType === 'assement' || sessionType === 'assessment' || sessionType === 'assessement') {
            baseRate = baseRate * 1.5
            // Update the rate to reflect the multiplier as requested
            payment.rate = baseRate
          }
        }

        payment.totalPayout = baseRate * payment.noOfSessions
      })

      // Combine regular and corporate payments
      return [...regularPayments, ...corporatePayments]
    } catch (error) {
      console.error('Error fetching all payments including corporate:', error)
      throw error
    }
  }

  async getAllDuePaymentsIncludingCorporate(): Promise<PaymentRecord[]> {
    const allPayments = await this.getAllPaymentsIncludingCorporate()

    // Filter payments where Payment Status equals "Due" (case-insensitive, trim whitespace)
    const duePayments = allPayments.filter(payment => {
      const status = payment.paymentStatus.toLowerCase().trim()
      return status === 'due'
    })


    // Update S No to be sequential for filtered results
    return duePayments.map((payment, index) => ({
      ...payment,
      sNo: (index + 1).toString()
    }))
  }

  async getDuePayoutsByMentorIncludingCorporate(): Promise<Array<{
    mentorName: string;
    mentorEmail: string;
    totalPayout: number;
    sessions: number;
    monthlyBreakdown: Array<{ month: string; payout: number; sessions: number }>
    sessionsBreakdown?: Array<{ date: string; menteeName: string; sessions: number; payout: number }>
  }>> {
    const allPayments = await this.getAllDuePaymentsIncludingCorporate()

    // Get mentor details (including emails) from RATE_LIST_SHEET
    const mentorDetails = await this.getMentorDetails()

    const aggregation = new Map<string, {
      mentorName: string;
      mentorEmail: string;
      totalPayout: number;
      sessions: number;
      monthlyBreakdown: Map<string, { payout: number; sessions: number }>
      sessionsBreakdown: Array<{ date: string; menteeName: string; sessions: number; payout: number }>
    }>()

    for (const p of allPayments) {
      // Use mentor name as primary key to avoid duplicate entries
      const key = p.mentorName.toLowerCase().trim()


      let existing = aggregation.get(key)

      if (!existing) {
        // Find mentor email from RATE_LIST_SHEET using the same matching logic as export
        const paymentMentorName = p.mentorName.toLowerCase().trim()

        // Try exact match first
        let mentorDetail = mentorDetails.find(detail =>
          detail.mentorName === paymentMentorName
        )

        // If no exact match, try fuzzy matching
        if (!mentorDetail) {
          // Remove extra spaces and try again
          const normalizedPaymentName = paymentMentorName.replace(/\s+/g, ' ')
          mentorDetail = mentorDetails.find(detail =>
            detail.mentorName.replace(/\s+/g, ' ') === normalizedPaymentName
          )
        }

        // If still no match, try partial matching (first name + last name)
        if (!mentorDetail) {
          const paymentNameParts = paymentMentorName.split(' ').filter(part => part.length > 0)
          if (paymentNameParts.length >= 2) {
            const firstName = paymentNameParts[0]
            const lastName = paymentNameParts[paymentNameParts.length - 1]

            mentorDetail = mentorDetails.find(detail => {
              const detailParts = detail.mentorName.split(' ').filter(part => part.length > 0)
              if (detailParts.length >= 2) {
                const detailFirstName = detailParts[0]
                const detailLastName = detailParts[detailParts.length - 1]
                return firstName === detailFirstName && lastName === detailLastName
              }
              return false
            })
          }
        }

        const mentorEmail = mentorDetail?.email?.trim() || ''


        existing = {
          mentorName: p.mentorName,
          mentorEmail: mentorEmail,
          totalPayout: 0,
          sessions: 0,
          monthlyBreakdown: new Map(),
          sessionsBreakdown: []
        }
        aggregation.set(key, existing)
      }

      existing.totalPayout += p.totalPayout
      existing.sessions += p.noOfSessions

      // Add to sessions breakdown for email
      existing.sessionsBreakdown.push({
        date: p.sessionDate || 'Unknown Date',
        menteeName: p.menteeName || 'Unknown Mentee',
        sessions: p.noOfSessions,
        payout: p.totalPayout
      })

      // Extract month from session date
      let monthKey = 'Unknown Month'
      try {
        const date = new Date(p.sessionDate)
        if (!isNaN(date.getTime())) {
          monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
        }
      } catch (e) {
        console.warn(`Could not parse date: ${p.sessionDate}`)
      }

      const monthData = existing.monthlyBreakdown.get(monthKey) || { payout: 0, sessions: 0 }
      monthData.payout += p.totalPayout
      monthData.sessions += p.noOfSessions
      existing.monthlyBreakdown.set(monthKey, monthData)
    }

    const result = Array.from(aggregation.values()).map(entry => ({
      mentorName: entry.mentorName,
      mentorEmail: entry.mentorEmail,
      totalPayout: entry.totalPayout,
      sessions: entry.sessions,
      monthlyBreakdown: Array.from(entry.monthlyBreakdown.entries())
        .map(([month, data]) => ({ month, payout: data.payout, sessions: data.sessions }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      sessionsBreakdown: entry.sessionsBreakdown.sort((a, b) => {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        if (isNaN(da) || isNaN(db)) {
          return 0
        }
        return da - db
      })
    }))


    return result
  }

  async getFinalPaymentsFromMentorCommissionSheet(): Promise<Array<{
    sNo: number
    mentorName: string
    menteeName: string
    sessionDate: string
    sessionStatus: string
    rate: number
    paymentStatus: string
    noOfSessions: number
    totalPayout: number
    revenuePerSession: number
    totalRevenue: number
  }>> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get data from Mentor commission sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:K', // Columns A to K to include all data
      })

      const rows = response.data.values
      if (!rows || rows.length <= 1) {
        return []
      }

      // Skip header row and filter only "Due" payments (column G)
      const finalPayments = rows.slice(1)
        .map((row: any[], index: number) => {
          if (!row || row.length < 9) return null

          const paymentStatus = row[6]?.toString()?.trim()?.toLowerCase()
          if (paymentStatus !== 'due') return null

          return {
            sNo: parseInt(row[0]) || (index + 1),
            mentorName: row[1]?.toString() || '',
            menteeName: row[2]?.toString() || '',
            sessionDate: row[3]?.toString() || '',
            sessionStatus: row[4]?.toString() || '',
            rate: parseFloat(row[5]) || 0,
            paymentStatus: row[6]?.toString() || 'Due',
            noOfSessions: parseInt(row[7]) || 0,
            totalPayout: parseFloat(row[8]) || 0,
            revenuePerSession: parseFloat(row[9]) || 0,
            totalRevenue: parseFloat(row[10]) || 0
          }
        })
        .filter((payment: any): payment is {
          sNo: number;
          mentorName: string;
          menteeName: string;
          sessionDate: string;
          sessionStatus: string;
          rate: number;
          paymentStatus: string;
          noOfSessions: number;
          totalPayout: number;
          revenuePerSession: number;
          totalRevenue: number;
        } => payment !== null)

      return finalPayments
    } catch (error) {
      console.error('Error fetching final payments from Mentor Commission sheet:', error)
      return []
    }
  }


  async markFinalPaymentsAsPaid(paymentIds: string[]): Promise<boolean> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get current data from Mentor commission sheet (extended range to include Date of Payment column O)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:O',
      })

      const rows = response.data.values
      if (!rows || rows.length <= 1) {
        return false
      }

      // Extract S No. from payment IDs (format: "final_123")
      const sNoList = paymentIds
        .map(id => id.replace('final_', ''))
        .map(sNo => parseInt(sNo))
        .filter(sNo => !isNaN(sNo))

      if (sNoList.length === 0) {
        return false
      }

      // Find rows to update and prepare batch update
      const updates: any[] = []
      const currentDate = new Date().toLocaleDateString('en-IN') // Format: DD/MM/YYYY
      const TDS_RATE = 10 // 10%

      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (!row || row.length < 7) continue

        const rowSNo = parseInt(row[0])
        if (sNoList.includes(rowSNo)) {
          // Get Total Payout from column I (index 8)
          const totalPayout = parseFloat(row[8]) || 0
          const tdsAmount = (totalPayout * TDS_RATE) / 100
          const postTdsAmount = totalPayout - tdsAmount

          // Update Payment Status column (column G, index 6) to "Paid"
          updates.push({
            range: `Mentor commission!G${i + 1}`, // +1 because sheets are 1-indexed
            values: [['Paid']]
          })

          // Update TDS % column (column L, index 11) with 10% (as decimal 0.1)
          updates.push({
            range: `Mentor commission!L${i + 1}`,
            values: [[TDS_RATE / 100]]
          })

          // Update TDS Paid column (column M, index 12) with calculated TDS amount
          updates.push({
            range: `Mentor commission!M${i + 1}`,
            values: [[tdsAmount]]
          })

          // Update Post TDS column (column N, index 13) with amount after TDS
          updates.push({
            range: `Mentor commission!N${i + 1}`,
            values: [[postTdsAmount]]
          })

          // Update Date of Payment column (column O, index 14) with current date
          updates.push({
            range: `Mentor commission!O${i + 1}`, // +1 because sheets are 1-indexed
            values: [[currentDate]]
          })
        }
      }

      if (updates.length === 0) {
        return false
      }

      // Execute batch update
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: mentorCommissionSheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updates
        }
      })

      return true
    } catch (error) {
      console.error('Error marking final payments as paid:', error)
      throw error
    }
  }

  async markFinalPaymentsByMentorAsPaid(mentorName: string): Promise<boolean> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get current data from Mentor commission sheet (extended range to include Date of Payment column O)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:O',
      })

      const rows = response.data.values
      if (!rows || rows.length <= 1) {
        return false
      }

      const normalizedMentorName = mentorName.trim().toLowerCase()
      const updates: any[] = []
      const currentDate = new Date().toLocaleDateString('en-IN') // Format: DD/MM/YYYY
      const TDS_RATE = 10 // 10%

      // Find all rows for this mentor with "Due" status and mark them as "Paid"
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (!row || row.length < 7) continue

        const rowMentorName = (row[1] || '').toString().trim().toLowerCase() // Column B is Mentor Name
        const paymentStatus = (row[6] || '').toString().trim().toLowerCase() // Column G is Payment Status

        if (rowMentorName === normalizedMentorName && paymentStatus === 'due') {
          // Get Total Payout from column I (index 8)
          const totalPayout = parseFloat(row[8]) || 0
          const tdsAmount = (totalPayout * TDS_RATE) / 100
          const postTdsAmount = totalPayout - tdsAmount

          // Update Payment Status column (column G, index 6) to "Paid"
          updates.push({
            range: `Mentor commission!G${i + 1}`, // +1 because sheets are 1-indexed
            values: [['Paid']]
          })

          // Update TDS % column (column L, index 11) with 10% (as decimal 0.1)
          updates.push({
            range: `Mentor commission!L${i + 1}`,
            values: [[TDS_RATE / 100]]
          })

          // Update TDS Paid column (column M, index 12) with calculated TDS amount
          updates.push({
            range: `Mentor commission!M${i + 1}`,
            values: [[tdsAmount]]
          })

          // Update Post TDS column (column N, index 13) with amount after TDS
          updates.push({
            range: `Mentor commission!N${i + 1}`,
            values: [[postTdsAmount]]
          })

          // Update Date of Payment column (column O, index 14) with current date
          updates.push({
            range: `Mentor commission!O${i + 1}`, // +1 because sheets are 1-indexed
            values: [[currentDate]]
          })
        }
      }

      if (updates.length === 0) {
        return false
      }

      // Execute batch update
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: mentorCommissionSheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updates
        }
      })

      return true
    } catch (error) {
      console.error('Error marking final payments by mentor as paid:', error)
      throw error
    }
  }

  async markTDSPaymentsByMentorAsPaid(mentorName: string, paymentIds?: string[] | string | number): Promise<boolean> {
    try {
      console.log('markTDSPaymentsByMentorAsPaid called with mentor:', mentorName, 'paymentIds:', paymentIds)
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Read until Column P to include the TDS Paid Tag column
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:P',
      })

      const rows = response.data.values || []
      console.log('Total rows in sheet:', rows.length)
      if (rows.length <= 1) {
        console.log('No data rows found')
        return false
      }

      const normalizedMentorName = mentorName.trim().toLowerCase()
      // Normalize paymentIds to a Set of strings (accept number/single value/array)
      const normalizedIds = new Set<string>(
        Array.isArray(paymentIds)
          ? (paymentIds as any[]).map(id => String(id))
          : (paymentIds === undefined || paymentIds === null)
            ? []
            : [String(paymentIds)]
      )
      const updates: any[] = []

      // Find all rows for this mentor with TDS data and mark TDS Paid Tag as "Paid"
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (!row || row.length < 13) continue // Need at least column M (TDS Paid)

        const rowMentorName = (row[1] || '').toString().trim().toLowerCase() // Column B is Mentor Name
        // Column A is S.No; normalize to integer string to match UI id format
        const sNoRaw = (row[0] || '').toString().trim()
        const sNoNum = parseInt(sNoRaw)
        const sNo = Number.isFinite(sNoNum) ? sNoNum.toString() : sNoRaw
        const tdsAmountCell = row[12] // Column M: TDS Paid

        // Check if this row matches the mentor
        if (rowMentorName !== normalizedMentorName) continue

        // Check if TDS Paid column has actual data
        if (!tdsAmountCell || tdsAmountCell === '' || tdsAmountCell === null || tdsAmountCell === undefined) continue

        const tdsAmount = parseFloat(tdsAmountCell)
        if (isNaN(tdsAmount) || tdsAmount <= 0) continue

        // If paymentIds are provided, check if this row is included strictly by S.No-based id
        if (normalizedIds.size > 0) {
          const bySNo = `tds_${sNo}`
          if (!normalizedIds.has(bySNo)) continue
        }

        // Update Column P (index 15) with "Paid" - this is the TDS Paid Tag column
        updates.push({
          range: `Mentor commission!P${i + 1}`, // +1 because sheets are 1-indexed
          values: [['Paid']]
        })
        console.log(`Added update for row ${i + 1} - marking Column P as Paid for ${mentorName}`)
      }

      console.log('Total updates to perform:', updates.length)
      if (updates.length === 0) {
        console.log('No matching rows found for mentor:', mentorName)
        return false
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: mentorCommissionSheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updates,
        },
      })

      console.log('Successfully updated', updates.length, 'rows for mentor:', mentorName)
      return true
    } catch (error) {
      console.error('Error marking TDS payments as paid by mentor:', error)
      throw error
    }
  }

  async markTDSPaymentsByDateAsPaid(dateOfPayment: string): Promise<boolean> {
    try {
      console.log('markTDSPaymentsByDateAsPaid called with:', dateOfPayment)
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Read until Column P to include the TDS Paid Tag column
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:P',
      })

      const rows = response.data.values || []
      console.log('Total rows in sheet:', rows.length)
      if (rows.length <= 1) {
        console.log('No data rows found')
        return false
      }

      // Normalize dates to DD/MM/YYYY format for consistent comparison
      // ALWAYS treat dates as DD/MM/YYYY (en-IN format) - never use Date() constructor which interprets as MM/DD/YYYY
      const normalizeDate = (dateStr: string): string => {
        if (!dateStr) return ''
        const trimmed = dateStr.toString().trim()

        // Parse as DD/MM/YYYY format (en-IN standard)
        const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
        if (ddmmyyyyMatch) {
          const day = ddmmyyyyMatch[1].padStart(2, '0')
          const month = ddmmyyyyMatch[2].padStart(2, '0')
          let year = ddmmyyyyMatch[3]
          if (year.length === 2) year = `20${year}`
          // Return in DD/MM/YYYY format
          return `${day}/${month}/${year}`
        }

        // If regex doesn't match, return original string (don't use Date() constructor as it will misinterpret DD/MM as MM/DD)
        return trimmed
      }

      const targetDate = normalizeDate((dateOfPayment || '').toString().trim())
      console.log('Target date (normalized):', targetDate)

      const updates: any[] = []

      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (!row || row.length < 15) continue // Need at least column O (index 14)

        const rowDateOfPayment = (row[14] || '').toString().trim() // Column O: Date of Payment
        if (!rowDateOfPayment) continue

        const normalizedRowDate = normalizeDate(rowDateOfPayment)
        console.log(`Row ${i + 1}: dateCell="${rowDateOfPayment}", normalized="${normalizedRowDate}", target="${targetDate}"`)

        if (normalizedRowDate === targetDate) {
          // Update Column P (index 15) with "Paid" - this is the TDS Paid Tag column
          updates.push({
            range: `Mentor commission!P${i + 1}`, // +1 because sheets are 1-indexed
            values: [['Paid']]
          })
          console.log(`Added update for row ${i + 1} - marking Column P as Paid`)
        }
      }

      console.log('Total updates to perform:', updates.length)
      if (updates.length === 0) {
        console.log('No matching rows found for date:', targetDate)
        return false
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: mentorCommissionSheetId,
        resource: {
          valueInputOption: 'RAW',
          data: updates,
        },
      })

      console.log('Successfully updated', updates.length, 'rows')
      return true
    } catch (error) {
      console.error('Error marking TDS payments as paid by date:', error)
      throw error
    }
  }

  async getTDSPaymentsFromMentorCommissionSheet(): Promise<Array<{
    sNo: number
    mentorName: string
    menteeName: string
    sessionDate: string
    sessionStatus: string
    rate: number
    paymentStatus: string
    noOfSessions: number
    totalPayout: number
    tdsPercentage: number
    tdsAmount: number
    postTdsAmount: number
    dateOfPayment: string
  }>> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get data from Mentor commission sheet (extended range to include TDS Paid Tag column P)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:P', // Columns A to P to include TDS Paid Tag
      })

      const rows = response.data.values
      if (!rows || rows.length <= 1) {
        return []
      }

      // Helper to robustly parse numbers from cells that may contain currency formatting
      const parseNumberCell = (value: any): number => {
        if (value === undefined || value === null) return 0
        const raw = String(value).trim()
        if (!raw) return 0
        const cleaned = raw.replace(/[^0-9.\-]/g, '')
        const num = Number(cleaned)
        return Number.isFinite(num) ? num : 0
      }

      // Skip header row and filter only rows where:
      // - TDS Paid column (M) has actual data
      // - Date of Payment column (O) has a valid date
      // - TDS Paid Tag column (P) is NOT "Paid"
      const tdsPayments = rows.slice(1)
        .map((row: any[], index: number) => {
          if (!row || row.length < 13) return null // Need at least 13 columns to reach column M

          const tdsAmountCell = row[12] // Column M: TDS Paid (index 12)
          const dateOfPaymentCell = row[14] // Column O: Date of Payment (index 14)
          const tdsPaidTagCell = row[15] // Column P: TDS Paid Tag (index 15)

          // Only include rows where TDS Paid column has actual data (not empty, not zero, not null)
          if (!tdsAmountCell || tdsAmountCell === '' || tdsAmountCell === null || tdsAmountCell === undefined) {
            return null
          }

          const tdsAmount = parseNumberCell(tdsAmountCell)

          // Also check if the parsed TDS amount is a valid positive number
          if (isNaN(tdsAmount) || tdsAmount <= 0) return null

          // Require a Date of Payment value; normalize to en-IN (DD/MM/YYYY) without strict Date parsing
          const rawDate = (dateOfPaymentCell || '').toString().trim()
          if (!rawDate) return null
          const normalizeEnIn = (s: string): string => {
            // Accept already formatted DD/MM/YYYY or D/M/YYYY
            const m = s.match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*$/)
            if (m) {
              const d = m[1].padStart(2, '0')
              const mo = m[2].padStart(2, '0')
              let y = m[3]
              if (y.length === 2) y = `20${y}`
              return `${d}/${mo}/${y}`
            }
            // Fallback: try Date parsing, else return original string
            const dt = new Date(s)
            if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-IN')
            return s
          }
          const dateString = normalizeEnIn(rawDate)

          // Exclude rows where TDS Paid Tag is "Paid"
          const tdsPaidTag = (tdsPaidTagCell || '').toString().trim().toLowerCase()
          if (tdsPaidTag === 'paid') {
            return null
          }

          return {
            sNo: parseInt(row[0]) || (index + 1),
            mentorName: row[1]?.toString() || '',
            menteeName: row[2]?.toString() || '',
            sessionDate: row[3]?.toString() || '',
            sessionStatus: row[4]?.toString() || '',
            rate: parseNumberCell(row[5]),
            paymentStatus: row[6]?.toString() || 'Paid',
            noOfSessions: parseInt(String(row[7])) || 0,
            totalPayout: parseNumberCell(row[8]),
            tdsPercentage: (() => { const v = parseNumberCell(row[11]); return v > 1 ? v / 100 : v || 0.10 })(), // accept 10 or 0.10
            tdsAmount: tdsAmount, // Column M: TDS Paid
            postTdsAmount: parseNumberCell(row[13]), // Column N: Post TDS
            dateOfPayment: dateString // Column O: Date of Payment (normalized)
          }
        })
        .filter((payment: any): payment is {
          sNo: number;
          mentorName: string;
          menteeName: string;
          sessionDate: string;
          sessionStatus: string;
          rate: number;
          paymentStatus: string;
          noOfSessions: number;
          totalPayout: number;
          tdsPercentage: number;
          tdsAmount: number;
          postTdsAmount: number;
          dateOfPayment: string;
        } => payment !== null)

      return tdsPayments
    } catch (error) {
      console.error('Error fetching TDS payments from Mentor Commission sheet:', error)
      return []
    }
  }

  async aggregatePaymentsByMentor(payments: PaymentRecord[]) {
    try {
      // Group payments by mentor
      const mentorGroups = payments.reduce((acc, payment) => {
        if (!acc[payment.mentorName]) {
          acc[payment.mentorName] = []
        }
        acc[payment.mentorName].push(payment)
        return acc
      }, {} as Record<string, PaymentRecord[]>)

      // Convert to the expected format
      const result = Object.entries(mentorGroups).map(([mentorName, mentorPayments]) => {
        const totalPayout = mentorPayments.reduce((sum, p) => sum + (p.totalPayout || 0), 0)
        const sessions = mentorPayments.length

        // Group by month for breakdown
        const monthlyBreakdown = mentorPayments.reduce((acc, payment) => {
          if (!payment.sessionDate) return acc

          try {
            const date = new Date(payment.sessionDate)
            if (isNaN(date.getTime())) return acc

            const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })

            if (!acc[monthKey]) {
              acc[monthKey] = { payout: 0, sessions: 0 }
            }

            acc[monthKey].payout += payment.totalPayout || 0
            acc[monthKey].sessions += 1

            return acc
          } catch (e) {
            return acc
          }
        }, {} as Record<string, { payout: number; sessions: number }>)

        return {
          mentorName,
          totalPayout,
          sessions,
          monthlyBreakdown: Object.entries(monthlyBreakdown).map(([month, data]) => ({
            month,
            payout: data.payout,
            sessions: data.sessions
          })),
          sessionsBreakdown: mentorPayments.map(payment => ({
            date: payment.sessionDate || '',
            menteeName: payment.menteeName || '',
            sessions: 1,
            payout: payment.totalPayout || 0
          })).sort((a, b) => {
            const da = new Date(a.date).getTime()
            const db = new Date(b.date).getTime()
            if (isNaN(da) || isNaN(db)) {
              return 0
            }
            return da - db
          })
        }
      })

      return result
    } catch (error) {
      console.error('Error aggregating payments by mentor:', error)
      throw error
    }
  }

  async uploadInvoiceToDrive(pdfBuffer: Buffer, fileName: string): Promise<string> {
    try {
      const folderId = process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID
      if (!folderId) {
        throw new Error('GOOGLE_DRIVE_INVOICE_FOLDER_ID is not configured')
      }

      // Upload the file with Shared Drive support
      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      }

      const media = {
        mimeType: 'application/pdf',
        body: require('stream').Readable.from(pdfBuffer)
      }

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
        supportsAllDrives: true // Enable Shared Drive support
      })

      // Make the file publicly accessible (with Shared Drive support)
      await this.drive.permissions.create({
        fileId: file.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true // Enable Shared Drive support
      })

      console.log('Invoice uploaded to Drive:', file.data.webViewLink)
      return file.data.webViewLink
    } catch (error) {
      console.error('Error uploading invoice to Drive:', error)
      throw error
    }
  }

  async getVendorInvoiceCountForMentor(mentorName: string): Promise<number> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get existing data from Vendor Payments tab
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Vendor Payments!A:J'
      })

      const rows = response.data.values || []
      if (rows.length <= 1) return 0 // Only header or no data

      // Count invoices for this mentor (column B is Vendor Name)
      const normalizedMentorName = mentorName.toLowerCase().trim()
      const count = rows.slice(1).filter((row: any) => {
        const vendorName = (row[1] || '').toString().toLowerCase().trim()
        return vendorName === normalizedMentorName
      }).length

      return count
    } catch (error) {
      console.error('Error getting invoice count for mentor:', error)
      return 0
    }
  }

  async getTDSInvoiceCountForMentor(mentorName: string): Promise<number> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Find the correct sheet name (case-insensitive)
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: mentorCommissionSheetId,
      })
      const sheets = spreadsheet.data.sheets || []
      const tdsSummarySheet = sheets.find((sheet: any) =>
        sheet.properties?.title?.toLowerCase() === 'tds summary'
      )

      if (!tdsSummarySheet) {
        return 0 // Sheet doesn't exist yet
      }

      const sheetName = tdsSummarySheet.properties.title

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: `${sheetName}!A:I`
      })

      const rows = response.data.values || []
      if (rows.length <= 1) return 0

      const normalized = mentorName.toLowerCase().trim()
      const count = rows.slice(1).filter((row: any) => {
        const name = (row[2] || '').toString().toLowerCase().trim()
        return name === normalized
      }).length

      return count
    } catch (error) {
      console.error('Error getting TDS invoice count for mentor:', error)
      return 0
    }
  }

  async addTDSSummaryRecord(data: {
    dateOfPayment: string
    invoiceNumber: string
    mentorName: string
    panNumber: string
    totalAmount: number
    tdsPaid: number
    postTdsAmount: number
    tdsStatus: string
    invoiceLink: string
  }): Promise<void> {
    try {
      console.log('addTDSSummaryRecord called with:', data)
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }
      console.log('Using spreadsheet ID:', mentorCommissionSheetId)

      // First, get all sheets to find the correct TDS summary sheet name (case-insensitive)
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: mentorCommissionSheetId,
      })
      const sheets = spreadsheet.data.sheets || []
      const tdsSummarySheet = sheets.find((sheet: any) =>
        sheet.properties?.title?.toLowerCase() === 'tds summary'
      )

      let sheetName = 'TDS summary' // Default name
      if (tdsSummarySheet) {
        sheetName = tdsSummarySheet.properties.title // Use actual sheet name (case-sensitive)
        console.log(`Found existing TDS summary sheet: "${sheetName}"`)
      } else {
        console.log('TDS summary sheet not found, creating it...')
        // Create sheet and headers
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: mentorCommissionSheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: 'TDS summary' } } }]
          }
        })
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: mentorCommissionSheetId,
          range: 'TDS summary!A1:I1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              'Date of Payment', 'Invoice Number', 'Vendor/Mentor Name', 'PAN Number', 'Total Amount', 'TDS Paid', 'Post TDS Amount', 'TDS Status', 'Invoice Link'
            ]]
          }
        })
        console.log('TDS summary sheet created with headers')
      }

      // Verify sheet exists by reading it
      let rows: any[] = []
      try {
        const read = await this.sheets.spreadsheets.values.get({
          spreadsheetId: mentorCommissionSheetId,
          range: `${sheetName}!A:I`
        })
        rows = read.data.values || []
        console.log(`Successfully read TDS summary sheet, current rows: ${rows.length}`)
      } catch (readError) {
        console.error('Error reading TDS summary sheet:', readError)
        throw new Error(`Failed to read TDS summary sheet: ${readError instanceof Error ? readError.message : 'Unknown error'}`)
      }

      const newRow = [
        this.formatDateForSheets(data.dateOfPayment), // Date of Payment (formatted as date)
        data.invoiceNumber,                       // Invoice Number
        data.mentorName,                          // Vendor/Mentor Name
        data.panNumber,                          // PAN Number
        data.totalAmount,                        // Total Amount
        data.tdsPaid,                           // TDS Paid
        data.postTdsAmount,                     // Post TDS Amount
        data.tdsStatus,                         // TDS Status
        data.invoiceLink                        // Invoice Link
      ]

      console.log('Adding TDS summary record with data:', {
        sheetName,
        dateOfPayment: this.formatDateForSheets(data.dateOfPayment),
        invoiceNumber: data.invoiceNumber,
        mentorName: data.mentorName,
        totalAmount: data.totalAmount,
        tdsPaid: data.tdsPaid,
        postTdsAmount: data.postTdsAmount,
        newRow
      })

      // Use USER_ENTERED to allow Google Sheets to interpret dates and numbers properly
      const range = `${sheetName}!A:I`
      console.log(`Appending to range: ${range}`)
      const appendResult = await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: range,
        valueInputOption: 'USER_ENTERED', // Changed from RAW to USER_ENTERED so dates are recognized
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [newRow] }
      })

      console.log('TDS summary record appended successfully:', {
        updatedRange: appendResult.data.updates?.updatedRange,
        updatedRows: appendResult.data.updates?.updatedRows,
        updatedCells: appendResult.data.updates?.updatedCells
      })
    } catch (error) {
      console.error('Error adding TDS summary record:', error)
      throw error
    }
  }
  async addVendorPaymentRecord(data: {
    vendorName: string
    vendorPAN: string
    paymentDate: string
    totalAmount: number
    tdsPercentage: number
    tdsAmount: number
    finalAmountPaid: number
    tdsPaid: number
    invoiceLink: string
  }): Promise<void> {
    try {
      const mentorCommissionSheetId = process.env.MENTOR_COMMISSION_SHEET_ID
      if (!mentorCommissionSheetId) {
        throw new Error('MENTOR_COMMISSION_SHEET_ID is not configured')
      }

      // Get existing data from Vendor Payments tab to determine next Sr No
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Vendor Payments!A:J'
      })

      const rows = response.data.values || []
      const nextSrNo = rows.length // Including header, so this will be the next row number

      // Prepare the new row data
      const newRow = [
        nextSrNo, // Sr No
        data.vendorName,
        data.vendorPAN,
        data.paymentDate,
        data.totalAmount,
        data.tdsPercentage,
        data.tdsAmount,
        data.finalAmountPaid,
        data.tdsPaid,
        data.invoiceLink
      ]

      // Append the new row
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Vendor Payments!A:J',
        valueInputOption: 'RAW',
        resource: {
          values: [newRow]
        }
      })

      console.log('Vendor payment record added successfully:', data.vendorName)
    } catch (error) {
      console.error('Error adding vendor payment record:', error)
      throw error
    }
  }

}

export const googleSheetsService = new GoogleSheetsService()
