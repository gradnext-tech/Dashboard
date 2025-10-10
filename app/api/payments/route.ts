import { NextRequest, NextResponse } from 'next/server'
// Ensure this route is always dynamic and never cached
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { googleSheetsService } from '@/lib/google-sheets'
import PDFDocument from 'pdfkit'
import nodemailer from 'nodemailer'
import fs from 'fs'
import path from 'path'

type InvoiceItem = { date: string; menteeName: string; sessions: number; payout: number }

// Function to ensure font files exist before PDFKit initialization
function ensureFontFilesExist() {
  // In production (Vercel), we can't create directories in the build path
  // PDFKit should work with default fonts without explicit font files
  console.log('Skipping font file creation in production environment')
  return
}

async function generateStyledInvoicePDF(params: {
  invoiceNumber: string
  mentorName: string
  pan: string
  totalSessions: number
  ratePerSession: number
  totalAmount: number
  dateOfPayment: string
}): Promise<Buffer> {
  const { invoiceNumber, mentorName, pan, totalSessions, ratePerSession, totalAmount, dateOfPayment } = params
  
  // Skip font file creation in production - PDFKit works with default fonts
  ensureFontFilesExist()
  
  // Configure PDFDocument with proper margins for A4 page
  const doc = new PDFDocument({ 
    size: 'A4',
    margins: {
      top: 50,
      bottom: 50,
      left: 50,
      right: 50
    }
  })
  
  const buffers: Buffer[] = []
  doc.on('data', (b: Buffer) => buffers.push(b))

  // Page dimensions (A4: 595 x 842 points)
  const pageWidth = 595
  const leftMargin = 50
  const rightMargin = 50
  const contentWidth = pageWidth - leftMargin - rightMargin // 495 points

  // Colors
  const darkText = '#1f2937'
  const grayText = '#6b7280'
  const lightBg = '#f9fafb'
  const blueAccent = '#3b82f6'

  // ===== HEADER SECTION =====
  // Title - "Invoice" (perfectly centered at top)
  const centerX = leftMargin + (contentWidth / 2)
  doc.fontSize(36).fillColor(darkText).text('Invoice', centerX, 60, { 
    align: 'center' 
  })

  // ===== BILLED BY & BILLED TO SECTION =====
  const sectionTop = 140
  
  // Billed By (left column)
  doc.fontSize(11).fillColor(darkText).text('Billed By', leftMargin, sectionTop)
  doc.fontSize(12).fillColor(darkText).text('Kashish Malhotra', leftMargin, sectionTop + 22)
  doc.fontSize(9).fillColor(grayText)
  doc.text('1-B Shastri Colony Ambala Cantt,', leftMargin, sectionTop + 40)
  doc.text('Ambala Cantt, India - 133001', leftMargin, sectionTop + 54)
  doc.text('Phone: +91 82228 66630', leftMargin, sectionTop + 68)

  // Billed To (middle column)
  const middleColX = 250
  doc.fontSize(11).fillColor(darkText).text('Billed To', middleColX, sectionTop)
  doc.fontSize(12).fillColor(darkText).text(mentorName, middleColX, sectionTop + 22, { width: 200 })
  doc.fontSize(9).fillColor(grayText).text(`PAN: ${pan || 'N/A'}`, middleColX, sectionTop + 40)

  // Invoice Details (right column)
  const rightColX = 450
  doc.fontSize(11).fillColor(darkText).text('Invoice Details', rightColX, sectionTop)
  
  doc.fontSize(9).fillColor(grayText).text('Invoice No #', rightColX, sectionTop + 22)
  doc.fillColor(darkText).text(invoiceNumber, rightColX + 80, sectionTop + 22)
  
  doc.fillColor(grayText).text('Invoice Date', rightColX, sectionTop + 38)
  doc.fillColor(darkText).text(dateOfPayment, rightColX + 80, sectionTop + 38)

  // ===== TABLE SECTION =====
  const tableTop = 250
  const tableWidth = contentWidth
  
  // Table header background
  doc.rect(leftMargin, tableTop, tableWidth, 30).fill(lightBg)
  
  // Table column positions - shifted left for better visibility
  const col1X = leftMargin + 15       // Item
  const col2X = leftMargin + 200      // Quantity (moved left by 50px)
  const col3X = leftMargin + 280      // Rate (moved left by 50px)
  const col4X = leftMargin + 360      // Amount (moved left by 60px)
  
  // Table headers
  doc.fontSize(10).fillColor(grayText)
  doc.text('Item', col1X, tableTop + 10)
  doc.text('Quantity', col2X, tableTop + 10, { width: 70, align: 'center' })
  doc.text('Rate', col3X, tableTop + 10, { width: 80, align: 'right' })
  doc.text('Amount', col4X, tableTop + 10, { width: 100, align: 'right' })

  // Table row - Vendor payments
  const rowTop = tableTop + 42
  doc.fontSize(10).fillColor(darkText)
  doc.text('Vendor payments', col1X, rowTop)
  doc.text(totalSessions.toString(), col2X, rowTop, { width: 70, align: 'center' })
  
  // Format amounts with rupee symbol
  const formattedRate = `₹${ratePerSession.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formattedAmount = `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  
  doc.text(formattedRate, col3X, rowTop, { width: 80, align: 'right' })
  doc.text(formattedAmount, col4X, rowTop, { width: 100, align: 'right' })

  // ===== REDUCTIONS & TOTAL SECTION =====
  const summaryTop = rowTop + 50
  
  // Reductions row
  doc.fontSize(10).fillColor(grayText)
  doc.text('Reductions', col3X, summaryTop, { width: 80, align: 'right' })
  doc.fillColor(darkText).text('₹0.00', col4X, summaryTop, { width: 100, align: 'right' })

  // Total section with white background and dark font
  const totalBoxTop = summaryTop + 30
  
  // Total label and amount - dark font on white background
  doc.fontSize(12).fillColor(darkText)
  doc.text('Total (INR)', col3X, totalBoxTop + 12, { width: 80, align: 'right' })
  
  const formattedTotal = `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  doc.fontSize(14).text(formattedTotal, col4X, totalBoxTop + 10, { width: 100, align: 'right' })

  doc.end()
  return await new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(buffers))))
}

export async function GET(request: NextRequest) {
  try {
    // Get query parameter to determine if we want all payments or just due payments
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'mentor-commissions') {
      const mentorCommissions = await googleSheetsService.getDuePayoutsByMentorIncludingCorporate()
      return NextResponse.json({ mentorCommissions })
    }

    if (type === 'corporate-sessions') {
      const corporateSessions = await googleSheetsService.getCorporateSessionsData()
      return NextResponse.json({ corporateSessions })
    }

    if (type === 'all-payments') {
      const allPayments = await googleSheetsService.getAllDuePaymentsIncludingCorporate()
      return NextResponse.json({ payments: allPayments })
    }

    if (type === 'final-payments') {
      const finalPayments = await googleSheetsService.getFinalPaymentsFromMentorCommissionSheet()
      return NextResponse.json({ finalPayments })
    }

    if (type === 'tds-payments') {
      const tdsPayments = await googleSheetsService.getTDSPaymentsFromMentorCommissionSheet()
      return NextResponse.json({ tdsPayments })
    }

    if (type === 'pending') {
      const pendingPayments = await googleSheetsService.getPendingPayments()
      return NextResponse.json({ payments: pendingPayments })
    }

    if (type === 'banking-details') {
      const bankingDetails = await googleSheetsService.getMentorBankingDetails()
      return NextResponse.json({ bankingDetails })
    }

    let payments
    if (type === 'due') {
      payments = await googleSheetsService.getDuePayments()
    } else {
      payments = await googleSheetsService.getPaymentData()
    }

    return NextResponse.json({ payments })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('API POST request received')
    const body = await request.json()
    const { action, paymentIds, mentorName, dateOfPayment } = body
    console.log('Request body:', { action, mentorName, paymentIds: paymentIds?.length })
    if (action === 'markTdsByMentorPaid') {
      const { mentorName, paymentIds } = body
      
      if (!mentorName || typeof mentorName !== 'string') {
        return NextResponse.json(
          { error: 'mentorName is required' },
          { status: 400 }
        )
      }

      try {
        const result = await googleSheetsService.markTDSPaymentsByMentorAsPaid(mentorName, paymentIds)
        return NextResponse.json({ success: true, result })
      } catch (error) {
        console.error('Error marking TDS payments by mentor as paid:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to mark TDS as paid' },
          { status: 500 }
        )
      }
    }

    if (action === 'markTdsDatePaid') {
      console.log('markTdsDatePaid action called with dateOfPayment:', dateOfPayment)
      if (!dateOfPayment || typeof dateOfPayment !== 'string') {
        console.error('Invalid dateOfPayment:', dateOfPayment)
        return NextResponse.json(
          { error: 'dateOfPayment is required' },
          { status: 400 }
        )
      }
      try {
        const result = await googleSheetsService.markTDSPaymentsByDateAsPaid(dateOfPayment)
        console.log('markTDSPaymentsByDateAsPaid result:', result)
        return NextResponse.json({ success: true, result })
      } catch (error) {
        console.error('Error in markTDSPaymentsByDateAsPaid:', error)
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to mark TDS as paid' },
          { status: 500 }
        )
      }
    }

    if (action === 'markPaid') {
      if (!paymentIds || !Array.isArray(paymentIds)) {
        return NextResponse.json(
          { error: 'Invalid payment IDs' },
          { status: 400 }
        )
      }

      if (paymentIds.length === 1) {
        await googleSheetsService.markAsPaid(paymentIds[0])
      } else {
        await googleSheetsService.markMultipleAsPaid(paymentIds)
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'exportToMentorCommission') {
      // Use filtered payments if provided, otherwise get all due payments
      const { filteredPayments } = body
      let duePayments
      
      if (filteredPayments && filteredPayments.length > 0) {
        duePayments = filteredPayments
      } else {
        duePayments = await googleSheetsService.getDuePayments()
      }
      
      if (duePayments.length === 0) {
        return NextResponse.json(
          { error: 'No due payments to export' },
          { status: 400 }
        )
      }

      // Export to Mentor Commission sheet
      await googleSheetsService.exportToMentorCommission(duePayments)

      return NextResponse.json({ 
        success: true, 
        message: `Successfully exported ${duePayments.length} payments to Mentor Commission sheet` 
      })
    }

    if (action === 'exportIndividualToMentorCommission') {
      const { payment } = body
      
      if (!payment) {
        return NextResponse.json(
          { error: 'Payment is required' },
          { status: 400 }
        )
      }

      // Export single payment to Mentor Commission sheet
      await googleSheetsService.exportToMentorCommission([payment])

      return NextResponse.json({ 
        success: true, 
        message: `Successfully exported 1 payment to Mentor Commission sheet` 
      })
    }

    if (action === 'markMentorCommissionPaid') {
      if (!mentorName || typeof mentorName !== 'string') {
        return NextResponse.json(
          { error: 'mentorName is required' },
          { status: 400 }
        )
      }
      await googleSheetsService.markMentorCommissionRowsAsPaid(mentorName)
      return NextResponse.json({ success: true })
    }

    if (action === 'addManualEntry') {
      const { entry } = body

      if (!entry) {
        return NextResponse.json(
          { error: 'Entry data is required' },
          { status: 400 }
        )
      }

      // Validate required fields
      const requiredFields = ['mentorName', 'menteeName', 'sessionDate', 'sessionStatus', 'rate', 'paymentStatus', 'noOfSessions', 'totalPayout']
      const missingFields = requiredFields.filter(field => !entry[field] && entry[field] !== 0)
      
      if (missingFields.length > 0) {
        return NextResponse.json(
          { error: `Missing required fields: ${missingFields.join(', ')}` },
          { status: 400 }
        )
      }

      // Add manual entry to Mentor Commission sheet
      await googleSheetsService.addManualEntryToMentorCommission(entry)

      return NextResponse.json({ 
        success: true, 
        message: 'Successfully added manual entry to Mentor Commission sheet' 
      })
    }

    if (action === 'markFinalPaymentsPaid') {
      if (!paymentIds || !Array.isArray(paymentIds)) {
        return NextResponse.json(
          { error: 'Invalid payment IDs' },
          { status: 400 }
        )
      }

      // Fetch final payments (Due) to gather details for email/pdf
      const finalPayments = await googleSheetsService.getFinalPaymentsFromMentorCommissionSheet()
      const selected = finalPayments.filter(fp => paymentIds.includes(`final_${fp.sNo}`))

      // Group by mentor to send emails
      const paymentsByMentor = new Map<string, typeof selected>()
      selected.forEach(fp => {
        const key = fp.mentorName.toLowerCase().trim()
        const arr = paymentsByMentor.get(key) || []
        arr.push(fp)
        paymentsByMentor.set(key, arr)
      })

      // Setup mail transport
      const host = process.env.SMTP_HOST
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS
      const from = process.env.FROM_EMAIL || 'no-reply@gradnext.com'
      const financeTo = 'finance@gradnext.co'

      const transporter = (host && user && pass) ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }) : null
      
      console.log('Email config check:', { host: !!host, user: !!user, pass: !!pass, transporter: !!transporter })

      // Send mentor emails and finance invoice emails (best-effort, non-blocking failure)
      if (transporter) {
        console.log('Processing', paymentsByMentor.size, 'mentors for emails')
        for (const [key, items] of Array.from(paymentsByMentor.entries())) {
          const mentorName = (items as any[])[0].mentorName
          const mentorDetailList = await googleSheetsService.getMentorDetails()
          const mentorDetail = mentorDetailList.find(d => d.mentorName.toLowerCase().trim() === key)
          const mentorEmail = mentorDetail?.email || ''

          const totalPayout = (items as any[]).reduce((sum: number, p: any) => sum + (p.totalPayout || 0), 0)
          const TDS_RATE = 0.10
          const tdsAmount = totalPayout * TDS_RATE
          const postTds = totalPayout - tdsAmount

          // Build session table HTML
          const sessionRows = (items as any[]).map((p: any) => `<tr><td>${p.sessionDate}</td><td>${p.menteeName}</td><td>${p.noOfSessions}</td><td>${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p.totalPayout)}</td></tr>`).join('')
          const subject = `Payout Paid - ${mentorName}`
          const text = `Hi ${mentorName},\n\nYour payout has been paid.\n\nTotal Sessions: ${(items as any[]).length}\nTotal Amount (Pre-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}\nTDS (10%): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(tdsAmount)}\nAmount Credited (Post-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(postTds)}\n\nSession-wise Breakdown:\n${(items as any[]).map((p: any) => `  ${p.sessionDate} - ${p.menteeName}: ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p.totalPayout)}`).join('\n')}\n\nBest,\nGradNext`
          const html = `<p>Hi ${mentorName},</p><p>Your payout has been paid.</p><p><strong>Total Sessions:</strong> ${items.length}</p><p><strong>Total Amount (Pre-TDS):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}</p><p><strong>TDS (10%):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(tdsAmount)}</p><p><strong>Amount Credited (Post-TDS):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(postTds)}</p><h3>Session-wise Breakdown:</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;"><thead><tr><th>Date</th><th>Mentee</th><th>Sessions</th><th>Payout</th></tr></thead><tbody>${sessionRows}</tbody></table><p>Best,<br/>gradnext</p>`

          if (mentorEmail) {
            try { 
              console.log(`Sending mentor email to ${mentorEmail}`)
              await transporter.sendMail({ from, to: mentorEmail, subject, text, html })
              console.log(`Mentor email sent successfully to ${mentorEmail}`)
            } catch (error) {
              console.error(`Failed to send mentor email to ${mentorEmail}:`, error)
            }
          } else {
            console.log(`No email found for mentor ${mentorName}`)
          }

          // Finance invoice email (text/html)
          try {
            console.log(`Generating PDF and sending finance email for ${mentorName}`)
            const pan = await googleSheetsService.getMentorPAN(mentorName)
            
            // Calculate totals for invoice
            const totalSessions = (items as any[]).reduce((sum: number, p: any) => sum + (p.noOfSessions || 0), 0)
            const ratePerSession = totalSessions > 0 ? totalPayout / totalSessions : 0
            const paymentDate = new Date().toLocaleDateString('en-IN')
            
            // Generate invoice number
            const invoiceCount = await googleSheetsService.getVendorInvoiceCountForMentor(mentorName)
            const nameParts = mentorName.trim().split(/\s+/)
            const firstInitial = nameParts[0]?.charAt(0).toUpperCase() || 'X'
            const lastInitial = nameParts[nameParts.length - 1]?.charAt(0).toUpperCase() || 'X'
            const invoiceNumber = `${firstInitial}${lastInitial}-${String(invoiceCount + 1).padStart(3, '0')}`
            
            const invoiceBuffer = await generateStyledInvoicePDF({
              invoiceNumber,
              mentorName,
              pan,
              totalSessions,
              ratePerSession,
              totalAmount: totalPayout,
              dateOfPayment: paymentDate
            })
            await transporter.sendMail({
              from,
              to: financeTo,
              subject: `Invoice - ${mentorName}`,
              text: `Payout processed for ${mentorName}. Total Due (Pre-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}. PAN: ${pan || 'N/A'}.`,
              attachments: [{ filename: `Invoice_${invoiceNumber}_${mentorName.replace(/\s+/g,'_')}.pdf`, content: invoiceBuffer }]
            })
            console.log(`Finance email sent successfully for ${mentorName}`)
          } catch (error) {
            console.error(`Failed to send finance email for ${mentorName}:`, error)
          }
        }
      }

      // Finally, mark as paid
      await googleSheetsService.markFinalPaymentsAsPaid(paymentIds)
      return NextResponse.json({ success: true })
    }

    if (action === 'emailMentorPayouts') {
      // Use filtered payments if provided, otherwise get all due payouts
      const { filteredPayments, pendingPayments } = body
      let duePayouts
      
      if (filteredPayments && filteredPayments.length > 0) {
        // Aggregate filtered payments by mentor
        duePayouts = await googleSheetsService.aggregatePaymentsByMentor(filteredPayments)
      } else {
        // Aggregate due payouts per mentor (including corporate sessions)
        duePayouts = await googleSheetsService.getDuePayoutsByMentorIncludingCorporate()
      }
      
      // Get mentor details from RATE_LIST_SHEET for emails
      const mentorDetails = await googleSheetsService.getMentorDetails()

      if (!duePayouts || duePayouts.length === 0) {
        return NextResponse.json({ success: true, message: 'No due payouts to email' })
      }

      // Setup transporter
      const host = process.env.SMTP_HOST
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS
      const from = process.env.FROM_EMAIL || 'no-reply@gradnext.com'

      if (!host || !user || !pass) {
        return NextResponse.json({ success: false, error: 'SMTP is not configured' }, { status: 500 })
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      })

      // Send emails using mentor details from RATE_LIST_SHEET
      const results: Array<{ mentorName: string; mentorEmail: string; status: string; reason?: string }> = []
      let emailsSent = 0
      let emailsSkipped = 0
      let emailsFailed = 0
      
      for (const entry of duePayouts) {
        // Find mentor email from RATE_LIST_SHEET
        const mentorDetail = mentorDetails.find(detail => 
          detail.mentorName.toLowerCase().trim() === entry.mentorName.toLowerCase().trim()
        )
        
        const mentorEmail = mentorDetail?.email?.trim() || ''
        
        if (!mentorEmail) {
          results.push({ 
            mentorName: entry.mentorName, 
            mentorEmail: '', 
            status: 'skipped', 
            reason: 'No email in RATE_LIST_SHEET' 
          })
          emailsSkipped++
          continue
        }

        const amountInr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(entry.totalPayout)
        
        // Extract unique months from the sessions
        const monthsWithDates = new Map<string, Date>()
        ;(entry.sessionsBreakdown || []).forEach((s: any) => {
          if (s.date) {
            try {
              const date = new Date(s.date)
              if (!isNaN(date.getTime())) {
                const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
                if (!monthsWithDates.has(monthKey)) {
                  monthsWithDates.set(monthKey, new Date(date.getFullYear(), date.getMonth(), 1))
                }
              }
            } catch (e) {
              // Skip invalid dates
            }
          }
        })
        
        // Sort months chronologically instead of alphabetically
        const monthsArray = Array.from(monthsWithDates.entries())
          .sort(([, dateA], [, dateB]) => dateA.getTime() - dateB.getTime())
          .map(([monthKey]) => monthKey)
        const monthText = monthsArray.length > 0 
          ? ` for the month${monthsArray.length > 1 ? 's' : ''} of ${monthsArray.join(' and ')}`
          : ''
        
        const monthTextBold = monthsArray.length > 0 
          ? ` for the month${monthsArray.length > 1 ? 's' : ''}:\n${monthsArray.map(month => `• **${month}**`).join('\n')}`
          : ''
        
        const monthTextHtml = monthsArray.length > 0 
          ? ` for the month${monthsArray.length > 1 ? 's' : ''}:<ul>${monthsArray.map(month => `<li><strong>${month}</strong></li>`).join('')}</ul>`
          : ''
        
        const subject = `Your pending payout summary${monthText}`
        
        // Create session-wise breakdown text
        const sessionBreakdownText = (entry.sessionsBreakdown || []).map((s: any) =>
          `  ${s.date} - ${s.menteeName}: ${s.sessions} session(s) - ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(s.payout)}`
        ).join('\n')
        
        // Check if this mentor has pending payments
        const mentorPendingPayments = (pendingPayments || []).filter((p: any) => 
          p.mentorName.toLowerCase().trim() === entry.mentorName.toLowerCase().trim()
        )
        
        let pendingPaymentsText = ''
        if (mentorPendingPayments.length > 0) {
          const pendingBreakdownText = mentorPendingPayments.map((p: any) =>
            `  ${p.sessionDate} - ${p.menteeName}: ${p.noOfSessions} session(s) - ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p.totalPayout)}`
          ).join('\n')
          
          const totalPendingPayout = mentorPendingPayments.reduce((sum: number, p: any) => sum + p.totalPayout, 0)
          const totalPendingSessions = mentorPendingPayments.reduce((sum: number, p: any) => sum + p.noOfSessions, 0)
          
          pendingPaymentsText = `\n\nPENDING PAYMENTS (Waiting for feedback completion):\n` +
            `Total Pending Sessions: ${totalPendingSessions}\n` +
            `Total Pending Payout: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalPendingPayout)}\n\n` +
            `Pending Session-wise Breakdown:\n${pendingBreakdownText}\n\n` +
            `Note: For these payouts the Payment is pending since feedback is not yet filled. Once it's done we will process these payouts.\n`
        }
        
        const text = `Hi ${entry.mentorName},\n\n` +
          `This is a summary of your pending payout with gradnext${monthTextBold}\n\n` +
          `Total Sessions: ${entry.sessions}\n` +
          `Total Payout: ${amountInr}\n\n` +
          `Session-wise Breakdown:\n${sessionBreakdownText}\n\n` +
          pendingPaymentsText +
          `We will process the payout after confirmation.\n\n` +
          `If you have any discrepancies, contact +91 8320447769\n\n` +
          `Best,\ngradnext`
        
        // Create session-wise breakdown HTML
        const sessionBreakdownHtml = (entry.sessionsBreakdown || []).map((s: any) => 
          `<tr><td>${s.date}</td><td>${s.menteeName}</td><td>${s.sessions}</td><td>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(s.payout)}</td></tr>`
        ).join('')
        
        // Create pending payments HTML section
        let pendingPaymentsHtml = ''
        if (mentorPendingPayments.length > 0) {
          const pendingBreakdownHtml = mentorPendingPayments.map((p: any) => 
            `<tr style="background-color: #fff3cd;"><td>${p.sessionDate}</td><td>${p.menteeName}</td><td>${p.noOfSessions}</td><td>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p.totalPayout)}</td></tr>`
          ).join('')
          
          const totalPendingPayout = mentorPendingPayments.reduce((sum: number, p: any) => sum + p.totalPayout, 0)
          const totalPendingSessions = mentorPendingPayments.reduce((sum: number, p: any) => sum + p.noOfSessions, 0)
          
          pendingPaymentsHtml = `<h3 style="color: #856404; background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107;">Pending Payments (Waiting for feedback completion)</h3>` +
            `<p><strong>Total Pending Sessions:</strong> ${totalPendingSessions}</p>` +
            `<p><strong>Total Pending Payout:</strong> ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalPendingPayout)}</p>` +
            `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin: 10px 0;">` +
            `<thead><tr style="background-color: #f5f5f5;"><th>Date</th><th>Mentee</th><th>Sessions</th><th>Payout</th></tr></thead>` +
            `<tbody>${pendingBreakdownHtml}</tbody>` +
            `</table>` +
            `<p style="background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; color: #856404;"><strong>Note:</strong> For these payouts the Payment is pending since feedback is not yet filled. Once it's done we will process these payouts.</p>`
        }
        
        const html = `<p>Hi ${entry.mentorName},</p>` +
          `<p>This is a summary of your pending payout with gradnext${monthTextHtml}</p>` +
           `<p><strong>Total Sessions:</strong> ${entry.sessions}</p>` +
          `<p><strong>Total Payout:</strong> ${amountInr}</p>`+ 
          `<h3>Session-wise Breakdown:</h3>` +
          `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin: 10px 0;">` +
          `<thead><tr style="background-color: #f5f5f5;"><th>Date</th><th>Mentee</th><th>Sessions</th><th>Payout</th></tr></thead>` +
          `<tbody>${sessionBreakdownHtml}</tbody>` +
          `</table>` +
          pendingPaymentsHtml +
          `<p>We will process the payout soon</p>` +
          `<p>If you have any discrepancies, please contact us at contact +91 8320447769</p>` +
          `<p>Best,<br/>gradnext</p>`

        try {
          await transporter.sendMail({ from, to: mentorEmail, subject, text, html })
          results.push({ mentorName: entry.mentorName, mentorEmail, status: 'sent' })
          emailsSent++
        } catch (e) {
          results.push({ 
            mentorName: entry.mentorName, 
            mentorEmail, 
            status: 'failed', 
            reason: e instanceof Error ? e.message : 'Unknown error' 
          })
          emailsFailed++
        }
      }

      return NextResponse.json({ 
        success: true, 
        results,
        summary: {
          total: duePayouts.length,
          sent: emailsSent,
          skipped: emailsSkipped,
          failed: emailsFailed
        },
        message: `Email summary: ${emailsSent} sent, ${emailsSkipped} skipped (no email), ${emailsFailed} failed`
      })
    }

    // Removed duplicate markFinalPaymentsPaid handler - using the one above with email logic

    if (action === 'markFinalPaymentsByMentorPaid') {
      const { mentorName, paymentIds } = body
      
      if (!mentorName || typeof mentorName !== 'string') {
        return NextResponse.json(
          { error: 'mentorName is required' },
          { status: 400 }
        )
      }

      // Build selection: fetch current due final payments and filter by mentor/paymentIds
      const finalPayments = await googleSheetsService.getFinalPaymentsFromMentorCommissionSheet()
      const selected = finalPayments.filter(fp => {
        const byMentor = fp.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim()
        const byIds = Array.isArray(paymentIds) && paymentIds.length > 0 ? paymentIds.includes(`final_${fp.sNo}`) : true
        return byMentor && byIds
      })

      if (selected.length === 0) {
        return NextResponse.json({ 
          error: 'No payments found for the specified mentor' 
        }, { status: 404 })
      }

      // Calculate totals
      const totalPayout = selected.reduce((sum, p) => sum + (p.totalPayout || 0), 0)
      const totalSessions = selected.reduce((sum, p) => sum + (p.noOfSessions || 0), 0)
      const ratePerSession = totalSessions > 0 ? totalPayout / totalSessions : 0
      const TDS_RATE = 0.10
      const tdsAmount = totalPayout * TDS_RATE
      const postTds = totalPayout - tdsAmount
      const paymentDate = new Date().toLocaleDateString('en-IN')

      // Get mentor PAN
      const pan = await googleSheetsService.getMentorPAN(mentorName)

      // Generate invoice number based on mentor initials
      const invoiceCount = await googleSheetsService.getVendorInvoiceCountForMentor(mentorName)
      const nameParts = mentorName.trim().split(/\s+/)
      const firstInitial = nameParts[0]?.charAt(0).toUpperCase() || 'X'
      const lastInitial = nameParts[nameParts.length - 1]?.charAt(0).toUpperCase() || 'X'
      const invoiceNumber = `${firstInitial}${lastInitial}-${String(invoiceCount + 1).padStart(3, '0')}`

      // Generate invoice PDF
      console.log(`Generating invoice PDF for ${mentorName} with invoice number ${invoiceNumber}`)
      const invoiceBuffer = await generateStyledInvoicePDF({
        invoiceNumber,
        mentorName,
        pan,
        totalSessions,
        ratePerSession,
        totalAmount: totalPayout,
        dateOfPayment: paymentDate
      })

      // Upload invoice to Google Drive
      const fileName = `Invoice_${invoiceNumber}_${mentorName.replace(/\s+/g, '_')}.pdf`
      console.log(`Uploading invoice to Google Drive: ${fileName}`)
      const invoiceLink = await googleSheetsService.uploadInvoiceToDrive(invoiceBuffer, fileName)

      // Add vendor payment record
      console.log(`Adding vendor payment record for ${mentorName}`)
      await googleSheetsService.addVendorPaymentRecord({
        vendorName: mentorName,
        vendorPAN: pan || '',
        paymentDate: paymentDate,
        totalAmount: totalPayout,
        tdsPercentage: TDS_RATE * 100, // Convert to percentage
        tdsAmount: tdsAmount,
        finalAmountPaid: postTds,
        tdsPaid: tdsAmount,
        invoiceLink: invoiceLink
      })

      // Send email to mentor
      const host = process.env.SMTP_HOST
      const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS
      const from = process.env.FROM_EMAIL || 'no-reply@gradnext.com'

      const transporter = (host && user && pass) ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }) : null
      
      console.log('Email config check:', { host: !!host, user: !!user, pass: !!pass, transporter: !!transporter })

      // Send mentor email (best-effort, non-blocking failure)
      if (transporter) {
        try {
          const mentorDetailList = await googleSheetsService.getMentorDetails()
          const mentorDetail = mentorDetailList.find(d => d.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim())
          const mentorEmail = mentorDetail?.email || ''

          if (mentorEmail) {
            // Build session table HTML
            const sessionRows = selected.map((p: any) => `<tr><td>${p.sessionDate}</td><td>${p.menteeName}</td><td>${p.noOfSessions}</td><td>${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p.totalPayout)}</td></tr>`).join('')
            const subject = `Payment Payout Processed - ${mentorName}`
            const text = `Hi ${mentorName},\n\nPayment payout has been processed.\n\nTotal Sessions: ${selected.length}\nTotal Amount (Pre-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}\nTDS (10%): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(tdsAmount)}\nAmount Credited (Post-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(postTds)}\n\nSession-wise Breakdown:\n${selected.map((p: any) => `  ${p.sessionDate} - ${p.menteeName}: ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p.totalPayout)}`).join('\n')}\n\nBest,\nGradNext`
            const html = `<p>Hi ${mentorName},</p><p>Payment payout has been processed.</p><p><strong>Total Sessions:</strong> ${selected.length}</p><p><strong>Total Amount (Pre-TDS):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}</p><p><strong>TDS (10%):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(tdsAmount)}</p><p><strong>Amount Credited (Post-TDS):</strong> ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(postTds)}</p><h3>Session-wise Breakdown:</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;"><thead><tr><th>Date</th><th>Mentee</th><th>Sessions</th><th>Payout</th></tr></thead><tbody>${sessionRows}</tbody></table><p>Best,<br/>gradnext</p>`

            console.log(`Sending mentor email to ${mentorEmail}`)
            await transporter.sendMail({ from, to: mentorEmail, subject, text, html })
            console.log(`Mentor email sent successfully to ${mentorEmail}`)
          } else {
            console.log(`No email found for mentor ${mentorName}`)
          }
        } catch (error) {
          console.error(`Failed to send mentor email for ${mentorName}:`, error)
        }
      }

      // Mark as paid (by provided paymentIds if present, else all by mentor)
      console.log(`Marking payments as paid for ${mentorName}`)
      if (paymentIds && Array.isArray(paymentIds) && paymentIds.length > 0) {
        await googleSheetsService.markFinalPaymentsAsPaid(paymentIds)
      } else {
        await googleSheetsService.markFinalPaymentsByMentorAsPaid(mentorName)
      }

      return NextResponse.json({ 
        success: true, 
        message: `Successfully marked all final payments for ${mentorName} as paid`,
        invoiceLink: invoiceLink,
        invoiceNumber: invoiceNumber
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing payment action:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        error: 'Failed to process payment action',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
