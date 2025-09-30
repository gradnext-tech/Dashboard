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
}

export interface MentorRate {
  mentorName: string
  rate: number
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
}


class GoogleSheetsService {
  private sheets: any
  private auth: any

  constructor() {
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    this.sheets = google.sheets({ version: 'v4', auth: this.auth })
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

        // Parse and format the session date to include 2025
        let sessionDate = row[10] || ''
        if (sessionDate && !sessionDate.includes('2025')) {
          // If the date doesn't contain 2025, add it
          sessionDate = sessionDate.includes('2025') ? sessionDate : `${sessionDate}, 2025`
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
          sessionDate: sessionDate, // Session Date with 2025
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

      // Find the specific "Mentor commission" sheet
      const mentorCommissionSheet = sheets.find((s: any) => 
        s.properties?.title === 'Mentor commission'
      )

      if (!mentorCommissionSheet) {
        throw new Error('Mentor commission sheet not found in the spreadsheet')
      }


      // Get the last S No. from the specific sheet to continue the sequence
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId, 'Mentor commission')
      let currentSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      
      // Get mentor details (including emails) from RATE_LIST_SHEET
      const mentorDetails = await this.getMentorDetails()

      // Prepare data for export (with auto-generated S No., calculated rates, and emails from RATE_LIST_SHEET)
      const exportData = payments.map(payment => {
        const mentorRate = this.getMentorRate(mentorRates, payment.mentorName)
        const totalPayout = mentorRate * payment.noOfSessions
        const revenuePerSession = mentorRate // Revenue per session is the same as rate
        const totalRevenue = mentorRate * payment.noOfSessions // Total revenue is rate * sessions
        
        // Find mentor email from RATE_LIST_SHEET with improved matching
        const paymentMentorName = payment.mentorName.toLowerCase().trim()
        
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
        
        return [
          currentSNo++,          // Auto-generated S No.
          payment.mentorName,    // Mentor Name
          mentorEmail,           // Mentor Email from RATE_LIST_SHEET
          payment.menteeName,    // Mentee Name
          payment.sessionDate,   // Session Date
          payment.sessionStatus === 'Done' ? 'Completed' : payment.sessionStatus, // Session Status (Done -> Completed)
          mentorRate,            // Rate from rates sheet
          'Due',                 // Payment Status (always "Due" in Mentor Commission)
          payment.noOfSessions,  // No. of Sessions
          totalPayout,           // Total Payout (rate * sessions)
          revenuePerSession,     // Revenue per session
          totalRevenue           // Total Revenue
        ]
      })

      // Append data to the specific "Mentor commission" sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:L', // Use the specific "Mentor commission" sheet (now includes email and revenue columns)
        valueInputOption: 'RAW',
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
      
      if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID is not configured')
      }

      // Prepare batch update requests to mark all exported payments as "Paid"
      const requests = payments.map(payment => ({
        range: `Session Info!R${payment.rowIndex}`, // Column R is Payment Status in Session Info sheet
        values: [['Paid']],
      }))

      if (requests.length === 0) {
        return false
      }

      // Perform batch update to mark all as paid
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: requests,
        },
      })

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
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId, 'Mentor commission')
      const nextSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      const mentorRate = this.getMentorRate(mentorRates, entry.mentorName)
      
      // Use mentor rate from rates sheet if available, otherwise use provided rate
      const finalRate = mentorRate > 0 ? mentorRate : entry.rate
      const finalTotalPayout = finalRate * entry.noOfSessions


      // Prepare data for manual entry (with auto-generated S No. and calculated rates)
      const entryData = [
        nextSNo,              // Auto-generated S No.
        entry.mentorName,
        entry.menteeName,
        entry.sessionDate,
        entry.sessionStatus,
        finalRate,            // Rate from rates sheet or provided rate
        entry.paymentStatus,
        entry.noOfSessions,
        finalTotalPayout      // Calculated total payout
      ]

      // Append data to the specific "Mentor commission" sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:I', // Use the specific "Mentor commission" sheet
        valueInputOption: 'RAW',
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

  async getLastSNoFromMentorCommission(mentorCommissionSheetId: string, sheetName: string = 'Mentor commission'): Promise<number> {
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

      // Process each sheet (excluding any system sheets)
      for (const sheet of sheets) {
        const sheetTitle = sheet.properties?.title
        if (!sheetTitle || sheetTitle.toLowerCase().includes('summary') || sheetTitle.toLowerCase().includes('template')) {
          continue
        }


        try {
          // Get data from this sheet
          const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: corporateSpreadsheetId,
            range: `${sheetTitle}!A:Z`, // Extend to include potential extra columns such as Mentor Rate
          })

          const rows = response.data.values || []
          
          if (rows.length <= 1) {
            continue
          }

          // Validate header row to ensure correct column structure
          const headerRow = rows[0] || []
          const expectedHeaders = ['Sr No.', 'Mentor Name', 'Mentor Email', 'Mentee Name', 'Mentee Email', 'Mentee Phone', 'Date', 'Time', 'Invite Title', 'Invitation Status', 'Mentor Confirmation Status', 'Mentee Confirmation Status', 'Session Status', 'Mentor Feedback', 'Mentee Feedback', 'Payment Status']
          
          // Check if this sheet has the expected corporate structure
          const hasValidStructure = expectedHeaders.every((expectedHeader, index) => {
            const actualHeader = (headerRow[index] || '').toString().trim()
            return actualHeader.toLowerCase().includes(expectedHeader.toLowerCase().split(' ')[0]) // Check first word match
          })
          
          if (!hasValidStructure) {
            continue
          }

          // Process data rows (skip header)
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (row.length === 0) continue

            // Parse and format the session date to include 2025
            let sessionDate = row[6] || ''
            if (sessionDate && !sessionDate.includes('2025')) {
              // If the date doesn't contain 2025, add it
              sessionDate = sessionDate.includes('2025') ? sessionDate : `${sessionDate}, 2025`
            }

            // Map the columns based on the actual corporate sheet structure
            // Robustly parse mentor rate if present (currency/text tolerant)
            const parseRate = (value: any): number | undefined => {
              if (value === undefined || value === null) return undefined
              const raw = String(value).trim()
              if (!raw) return undefined
              const cleaned = raw.replace(/[^0-9.\-]/g, '')
              const num = Number(cleaned)
              return Number.isFinite(num) && num > 0 ? num : undefined
            }

            // Find Mentor Rate column dynamically if present
            const mentorRateIndex = headerRow.findIndex((h: string) => (h || '').toString().trim().toLowerCase() === 'mentor rate')


            const corporateSession: CorporateSessionRecord = {
              id: `corporate_${sheetTitle}_${i}`,
              sNo: globalSNo.toString(),
              mentorName: row[1] || '', // Column B - Mentor Name
              mentorEmail: row[2] || '', // Column C - Mentor Email
              menteeName: row[3] || '', // Column D - Mentee Name (not sheet name)
              menteeEmail: row[4] || '', // Column E - Mentee Email
              menteePhone: row[5] || '', // Column F - Mentee Phone
              date: sessionDate, // Column G - Date with 2025
              time: row[7] || '', // Column H - Time
              inviteTitle: row[8] || '', // Column I - Invite Title
              invitationStatus: row[9] || '', // Column J - Invitation Status
              mentorConfirmationStatus: row[10] || '', // Column K - Mentor Confirmation Status
              menteeConfirmationStatus: row[11] || '', // Column L - Mentee Confirmation Status
              sessionStatus: row[12] || '', // Column M - Session Status
              mentorFeedback: row[13] || '', // Column N - Mentor Feedback
              menteeFeedback: row[14] || '', // Column O - Mentee Feedback
              paymentStatus: row[15] || '', // Column P - Payment Status
              rowIndex: i + 1,
              sheetName: sheetTitle,
              customRate: (sheetTitle.trim().toLowerCase() === 'miscellaneous tracker' || mentorRateIndex >= 0) ? parseRate(row[mentorRateIndex]) : undefined
            }

            allCorporateSessions.push(corporateSession)
            globalSNo++
          }
        } catch (sheetError) {
          console.error(`Error processing sheet ${sheetTitle}:`, sheetError)
          // Continue with other sheets even if one fails
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
        sheetName: session.sheetName // Add the sheet name for corporate sessions
      }))

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      
      // Calculate rates and payouts for corporate sessions
      corporatePayments.forEach(payment => {
        if (typeof payment.rate === 'number' && isFinite(payment.rate) && payment.rate > 0) {
          payment.totalPayout = payment.rate * payment.noOfSessions
        } else {
          const mentorRate = this.getMentorRate(mentorRates, payment.mentorName)
          payment.rate = mentorRate
          payment.totalPayout = mentorRate * payment.noOfSessions
        }
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
      sessionsBreakdown: entry.sessionsBreakdown
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

      // Get current data from Mentor commission sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'Mentor commission!A:K',
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
      
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (!row || row.length < 7) continue
        
        const rowSNo = parseInt(row[0])
        if (sNoList.includes(rowSNo)) {
          // Update Payment Status column (column G, index 6) to "Paid"
          updates.push({
            range: `Mentor commission!G${i + 1}`, // +1 because sheets are 1-indexed
            values: [['Paid']]
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

}

export const googleSheetsService = new GoogleSheetsService()
