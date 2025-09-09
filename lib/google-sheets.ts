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
}

export interface MentorRate {
  mentorName: string
  rate: number
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

      console.log('Found Session Info sheet:', sessionInfoSheet.properties?.title)

      // Get all data from the Session Info sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Session Info!A:S', // All columns from A to S
      })

      const rows = response.data.values || []
      
      if (rows.length === 0) {
        console.log('No data found in Session Info sheet')
        return []
      }

      console.log(`Found ${rows.length} rows in Session Info sheet`)

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      console.log(`Found ${mentorRates.length} mentor rates for dashboard display`)

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
        const noOfSessions = parseInt(row[8]) || 1
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
          noOfSessions: noOfSessions, // Session Number from Master Data
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
      console.log('Mentor Commission sheet found:', sheets.map((s: any) => s.properties?.title))

      // Get the last S No. from the sheet to continue the sequence
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId)
      let currentSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      console.log(`Found ${mentorRates.length} mentor rates for calculation`)

      // Prepare data for export (with auto-generated S No. and calculated rates)
      const exportData = payments.map(payment => {
        const mentorRate = this.getMentorRate(mentorRates, payment.mentorName)
        const totalPayout = mentorRate * payment.noOfSessions
        
        return [
          currentSNo++,          // Auto-generated S No.
          payment.mentorName,    // Mentor Name
          payment.menteeName,    // Mentee Name
          payment.sessionDate,   // Session Date
          payment.sessionStatus === 'Done' ? 'Completed' : payment.sessionStatus, // Session Status (Done -> Completed)
          mentorRate,            // Rate from rates sheet
          'Due',                 // Payment Status (always "Due" in Mentor Commission)
          payment.noOfSessions,  // No. of Sessions
          totalPayout            // Total Payout (rate * sessions)
        ]
      })

      // Append data to the Mentor Commission sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'A:I', // Use the first sheet in the Mentor Commission spreadsheet (9 columns with S No.)
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: exportData,
        },
      })

      console.log(`Successfully exported ${payments.length} payments to Mentor Commission sheet`)

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

      console.log(`Successfully marked ${payments.length} payments as "Paid" in Master Copy`)
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
      const lastSNo = await this.getLastSNoFromMentorCommission(mentorCommissionSheetId)
      const nextSNo = lastSNo + 1

      // Get mentor rates for calculation
      const mentorRates = await this.getMentorRates()
      const mentorRate = this.getMentorRate(mentorRates, entry.mentorName)
      
      // Use mentor rate from rates sheet if available, otherwise use provided rate
      const finalRate = mentorRate > 0 ? mentorRate : entry.rate
      const finalTotalPayout = finalRate * entry.noOfSessions

      console.log(`Manual entry - Mentor: ${entry.mentorName}, Rate from sheet: ${mentorRate}, Using rate: ${finalRate}, Total: ${finalTotalPayout}`)

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

      // Append data to the Mentor Commission sheet
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: mentorCommissionSheetId,
        range: 'A:I', // Use the first sheet in the Mentor Commission spreadsheet (9 columns with S No.)
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [entryData],
        },
      })

      console.log('Successfully added manual entry to Mentor Commission sheet')
      return true
    } catch (error) {
      console.error('Error adding manual entry to Mentor Commission:', error)
      throw error
    }
  }

  async getLastSNoFromMentorCommission(mentorCommissionSheetId: string): Promise<number> {
    try {
      // Get all data from the Mentor Commission sheet to find the last S No.
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: mentorCommissionSheetId,
        range: 'A:A', // Only get the S No. column
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

      console.log(`Last S No. found in Mentor Commission sheet: ${maxSNo}`)
      return maxSNo
    } catch (error) {
      console.error('Error getting last S No. from Mentor Commission:', error)
      // If there's an error, start from 0
      return 0
    }
  }

  async getMentorRates(): Promise<MentorRate[]> {
    try {
      const rateListSheetId = process.env.RATE_LIST_SHEET_ID
      
      if (!rateListSheetId) {
        throw new Error('RATE_LIST_SHEET_ID is not configured')
      }

      console.log('Fetching mentor rates from Rate List sheet:', rateListSheetId)

      // Get all data from the Rate List sheet (Mentor Name and Rate columns)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: rateListSheetId,
        range: 'A:B', // Mentor Name (A) and Rate (B) columns
      })

      const rows = response.data.values || []
      
      if (rows.length === 0) {
        console.log('No data found in Rate List sheet')
        return []
      }

      console.log(`Found ${rows.length} rows in Rate List sheet`)
      console.log('First few rows:', rows.slice(0, 3))

      // Process the data (Column A: Mentor Name, Column B: Rate)
      const mentorRates: MentorRate[] = []
      
      for (let i = 1; i < rows.length; i++) { // Skip header row
        const row = rows[i]
        if (row.length === 0) continue

        const mentorName = (row[0] || '').trim() // Column A: Mentor Name
        const rateValue = row[1] || '0' // Column B: Rate
        
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

      console.log(`Found ${mentorRates.length} mentor rates from Rate List sheet`)
      return mentorRates
    } catch (error) {
      console.error('Error fetching mentor rates:', error)
      // Return empty array if there's an error
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
  }>> {
    const duePayments = await this.getDuePayments()
    const aggregation = new Map<string, { 
      mentorName: string; 
      mentorEmail: string; 
      totalPayout: number; 
      sessions: number;
      monthlyBreakdown: Map<string, { payout: number; sessions: number }>
    }>()

    for (const p of duePayments) {
      const key = (p.mentorEmail && p.mentorEmail.trim().toLowerCase()) || p.mentorName.toLowerCase().trim()
      let existing = aggregation.get(key)
      
      if (!existing) {
        existing = {
          mentorName: p.mentorName,
          mentorEmail: p.mentorEmail || '',
          totalPayout: 0,
          sessions: 0,
          monthlyBreakdown: new Map()
        }
        aggregation.set(key, existing)
      }

      existing.totalPayout += p.totalPayout
      existing.sessions += p.noOfSessions

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
        .sort((a, b) => a.month.localeCompare(b.month))
    }))
  }

}

export const googleSheetsService = new GoogleSheetsService()
