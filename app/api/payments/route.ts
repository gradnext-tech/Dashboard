import { NextRequest, NextResponse } from 'next/server'
// Ensure this route is always dynamic and never cached
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { googleSheetsService } from '@/lib/google-sheets'
import nodemailer from 'nodemailer'

type InvoiceItem = { date: string; menteeName: string; sessions: number; payout: number }

// PDF generation function using Puppeteer (works perfectly in Vercel)
async function generateSimpleInvoicePDF(params: {
  invoiceNumber: string
  mentorName: string
  pan: string
  mentorEmail: string
  mentorPhone: string
  totalSessions: number
  ratePerSession: number
  totalAmount: number
  dateOfPayment: string
}): Promise<Buffer> {
  const { invoiceNumber, mentorName, pan, mentorEmail, mentorPhone, totalSessions, ratePerSession, totalAmount, dateOfPayment } = params
  
  console.log('Generating PDF using Puppeteer...')
  
  // Dynamic imports to avoid webpack bundling issues
  const puppeteer = await import('puppeteer-core')
  const chromium = await import('@sparticuz/chromium')
  
  // Compute robust values to avoid 0s when inputs are missing/rounded
  const safeTotalAmount = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0
  const computedQuantity = Number.isFinite(totalSessions) && totalSessions > 0
    ? Math.floor(totalSessions)
    : (safeTotalAmount > 0 ? 1 : 0)
  const computedRate = computedQuantity > 0
    ? ((Number.isFinite(ratePerSession) && ratePerSession > 0) ? ratePerSession : (safeTotalAmount / computedQuantity))
    : 0
  const computedAmount = safeTotalAmount > 0 ? safeTotalAmount : (computedQuantity * computedRate)

  // Create HTML content for the invoice
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .title {
          font-size: 36px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .billed-by, .billed-to, .invoice-info {
          flex: 1;
          margin-right: 20px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 10px;
        }
        .address {
          font-size: 12px;
          line-height: 1.4;
          color: #666;
        }
        .invoice-number {
          font-size: 12px;
          margin-bottom: 5px;
        }
        .invoice-date {
          font-size: 12px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .table th {
          background-color: #f5f5f5;
          padding: 12px;
          text-align: left;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .table td {
          padding: 12px;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .table .quantity {
          text-align: center;
        }
        .table .rate, .table .amount {
          text-align: right;
        }
        .total-section {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .total-box {
          background-color: white;
          padding: 15px;
          border: 1px solid #ddd;
          width: 200px;
        }
        .total-label {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .total-amount {
          font-size: 16px;
          font-weight: bold;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Invoice</div>
      </div>
      
      <div class="invoice-details">
        <div class="billed-by">
          <div class="section-title">Billed By</div>
          <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${mentorName}</div>
          <div class="address">
            Email: ${mentorEmail || 'N/A'}<br>
            PAN: ${pan || 'N/A'}<br>
            Phone: ${mentorPhone || 'N/A'}
          </div>
        </div>
        
        <div class="billed-to">
          <div class="section-title">Billed To</div>
          <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">Keisei Consulting Private Limited</div>
          <div class="address">
            1-B Shastri Colony Ambala Cantt<br>
            Ambala Cantt, India - 133001<br>
            Phone: +91 82228 66630
            GST Number: 06AALCK9474G1Z1
          </div>
        </div>
        
        <div class="invoice-info">
          <div class="section-title">Invoice Details</div>
          <div class="invoice-number">Invoice No # ${invoiceNumber}</div>
          <div class="invoice-date">Invoice Date: ${dateOfPayment}</div>
        </div>
      </div>
      
      <table class="table">
        <thead>
          <tr>
            <th>Item</th>
            <th class="quantity">Quantity</th>
            <th class="rate">Rate</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Consulting Sessions</td>
            <td class="quantity">${computedQuantity}</td>
            <td class="rate">₹${computedRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="amount">₹${computedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="total-section">
        <div class="total-box">
          <div class="total-label">Total (INR)</div>
          <div class="total-amount">₹${computedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </body>
    </html>
  `
  
  let browser
  try {
    // Prefer serverless-compatible Chromium in production/server
    const { default: chromium } = await import('@sparticuz/chromium')
    const { default: puppeteerCore } = await import('puppeteer-core')

    // Resolve executable path
    let executablePath = process.env.CHROME_PATH || await chromium.executablePath()

    // In local/dev, chromium.executablePath() may be null; try common Chrome paths
    if (!executablePath) {
      const os = process.platform
      const candidates = os === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
          ]
        : os === 'linux'
        ? [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
          ]
        : [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
          ]

      const fsMod = await import('fs')
      for (const p of candidates) {
        try {
          if (fsMod.existsSync(p)) { executablePath = p; break }
        } catch {}
      }
    }

    if (!executablePath) {
      throw new Error('Chromium executable not found. Set CHROME_PATH or install Google Chrome locally.')
    }

    // Choose args: serverless chromium vs local installed Chrome
    const isLocalChrome = /Google Chrome|Chromium|chrome\.exe/i.test(executablePath)
    const launchArgs = isLocalChrome
      ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--hide-scrollbars']
      : [...chromium.args, '--hide-scrollbars']

    browser = await puppeteerCore.launch({
      args: launchArgs,
      defaultViewport: { width: 1200, height: 800 },
      executablePath,
      headless: true,
    })
    
    const page = await browser.newPage()
    // Use data URL approach to completely avoid main frame race conditions
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
    await page.goto(dataUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body')
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    })
    
    return Buffer.from(pdfBuffer)
    
  } catch (error) {
    console.error('Error generating PDF with Puppeteer:', error)
    throw error
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
    }
  }
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

        // Build TDS invoice and summary only if updates occurred
        if (result) {
          // Fetch mentor details
          const mentorDetailList = await googleSheetsService.getMentorDetails()
          const mentorDetail = mentorDetailList.find(d => d.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim())
          const mentorEmail = mentorDetail?.email || 'N/A'
          const mentorPhone = mentorDetail?.phone || 'N/A'
          const pan = await googleSheetsService.getMentorPAN(mentorName)

          // Get all TDS payments (unpaid tag only) to compute aggregates for this mentor
          const tdsPayments = await googleSheetsService.getTDSPaymentsFromMentorCommissionSheet()
          // Restrict to only the selected rows if paymentIds provided (scope to date-specific selection)
          const idSet = new Set(Array.isArray(paymentIds) ? paymentIds : [])
          const mentorTdsRows = tdsPayments.filter(p => {
            const matchesMentor = p.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim()
            if (!matchesMentor) return false
            if (idSet.size === 0) return true
            const rowId = `tds_${p.sNo}`
            return idSet.has(rowId)
          })

          // Aggregate totals
          const totalAmount = mentorTdsRows.reduce((s, p) => s + (p.totalPayout || 0), 0)
          const tdsPaid = mentorTdsRows.reduce((s, p) => s + (p.tdsAmount || 0), 0)
          const postTdsAmount = mentorTdsRows.reduce((s, p) => s + (p.postTdsAmount || 0), 0)

          // Determine date of payment from Mentor Commission sheet (Column O per-row)
          // Use the latest date across the selected rows as invoice date
          const dateCandidates = mentorTdsRows
            .map(r => new Date(r.dateOfPayment))
            .filter(d => !isNaN(d.getTime()))
          const latest = dateCandidates.length > 0 ? new Date(Math.max(...dateCandidates.map(d => d.getTime()))) : new Date()
          const dateOfPayment = latest.toLocaleDateString('en-IN')

          // Generate invoice number using mentor initials with TDS counter
          const tdsInvoiceCount = await googleSheetsService.getTDSInvoiceCountForMentor(mentorName)
          const nameParts = mentorName.trim().split(/\s+/)
          const firstInitial = nameParts[0]?.charAt(0).toUpperCase() || 'X'
          const lastInitial = nameParts[nameParts.length - 1]?.charAt(0).toUpperCase() || 'X'
          const invoiceNumber = `${firstInitial}${lastInitial}-TDS-${String(tdsInvoiceCount + 1).padStart(3, '0')}`

          // Build a minimal HTML for TDS invoice (reuse Puppeteer renderer)
          const invoiceBuffer = await generateSimpleInvoicePDF({
            invoiceNumber,
            mentorName,
            pan,
            mentorEmail,
            mentorPhone,
            totalSessions: mentorTdsRows.reduce((s, p) => s + (p.noOfSessions || 0), 0),
            ratePerSession: totalAmount > 0 ? totalAmount / Math.max(1, mentorTdsRows.reduce((s, p) => s + (p.noOfSessions || 0), 0)) : 0,
            totalAmount: totalAmount,
            dateOfPayment
          })

          // Upload to Drive
          const fileName = `TDS_Invoice_${invoiceNumber}_${mentorName.replace(/\s+/g, '_')}.pdf`
          const invoiceLink = await googleSheetsService.uploadInvoiceToDrive(invoiceBuffer, fileName)

          // Write to TDS summary sheet
          await googleSheetsService.addTDSSummaryRecord({
            dateOfPayment,
            invoiceNumber,
            mentorName,
            panNumber: pan || '',
            totalAmount,
            tdsPaid,
            postTdsAmount,
            tdsStatus: 'Paid',
            invoiceLink
          })
        }

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
        // 1) Normalize the target date consistently with Sheets logic
        const normalizeDate = (dateStr: string): string => {
          try {
            const d = new Date((dateStr || '').toString().trim())
            return isNaN(d.getTime()) ? (dateStr || '').toString().trim() : d.toLocaleDateString('en-IN')
          } catch {
            return (dateStr || '').toString().trim()
          }
        }
        const targetDate = normalizeDate(dateOfPayment)

        // 2) Capture eligible TDS rows for that date BEFORE we set the paid tag
        //    (the unpaid list excludes rows already tagged as Paid in Column P)
        const allTdsPayments = await googleSheetsService.getTDSPaymentsFromMentorCommissionSheet()
        const rowsForDate = allTdsPayments.filter(p => normalizeDate(p.dateOfPayment) === targetDate)

        // 3) Group rows by mentor for per-mentor invoice generation
        const byMentor = new Map<string, typeof rowsForDate>()
        rowsForDate.forEach(r => {
          const key = r.mentorName.toLowerCase().trim()
          const arr = byMentor.get(key) || []
          arr.push(r)
          byMentor.set(key, arr)
        })

        // 4) Mark as Paid on the sheet (Column P) for that date
        const result = await googleSheetsService.markTDSPaymentsByDateAsPaid(dateOfPayment)
        console.log('markTDSPaymentsByDateAsPaid result:', result)

        // 5) For each mentor, generate and upload TDS invoice and add summary row
        if (byMentor.size > 0) {
          const mentorDetails = await googleSheetsService.getMentorDetails()
          for (const [key, items] of Array.from(byMentor.entries())) {
            const mentorName = (items as any[])[0].mentorName

            const totalAmount = (items as any[]).reduce((s: number, p: any) => s + (p.totalPayout || 0), 0)
            const tdsPaid = (items as any[]).reduce((s: number, p: any) => s + (p.tdsAmount || 0), 0)
            const postTdsAmount = (items as any[]).reduce((s: number, p: any) => s + (p.postTdsAmount || 0), 0)
            const totalSessions = (items as any[]).reduce((s: number, p: any) => s + (p.noOfSessions || 0), 0)
            const ratePerSession = totalSessions > 0 ? totalAmount / totalSessions : 0

            // Mentor contact/PAN
            const detail = mentorDetails.find(d => d.mentorName.toLowerCase().trim() === key)
            const mentorEmail = detail?.email || 'N/A'
            const mentorPhone = detail?.phone || 'N/A'
            const pan = await googleSheetsService.getMentorPAN(mentorName)

            // Invoice number per mentor (TDS counter)
            const tdsInvoiceCount = await googleSheetsService.getTDSInvoiceCountForMentor(mentorName)
            const nameParts = mentorName.trim().split(/\s+/)
            const firstInitial = nameParts[0]?.charAt(0).toUpperCase() || 'X'
            const lastInitial = nameParts[nameParts.length - 1]?.charAt(0).toUpperCase() || 'X'
            const invoiceNumber = `${firstInitial}${lastInitial}-TDS-${String(tdsInvoiceCount + 1).padStart(3, '0')}`

            // Generate PDF with Date of Payment as invoice date
            const invoiceBuffer = await generateSimpleInvoicePDF({
              invoiceNumber,
              mentorName,
              pan,
              mentorEmail,
              mentorPhone,
              totalSessions,
              ratePerSession,
              totalAmount,
              dateOfPayment: targetDate
            })

            // Upload to Drive and record in TDS summary sheet
            const fileName = `TDS_Invoice_${invoiceNumber}_${mentorName.replace(/\s+/g, '_')}.pdf`
            const invoiceLink = await googleSheetsService.uploadInvoiceToDrive(invoiceBuffer, fileName)
            await googleSheetsService.addTDSSummaryRecord({
              dateOfPayment: targetDate,
              invoiceNumber,
              mentorName, // Column header in sheet may read "Vendor/Mentor Name"
              panNumber: pan || '',
              totalAmount,
              tdsPaid,
              postTdsAmount,
              tdsStatus: 'Paid',
              invoiceLink
            })
          }
        }

        return NextResponse.json({ success: true, result, processedMentors: byMentor.size })
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

          // Finance summary email (no invoice attachment as per new flow)
          try {
            console.log(`Sending finance summary email for ${mentorName}`)
            const pan = await googleSheetsService.getMentorPAN(mentorName)
            await transporter.sendMail({
              from,
              to: financeTo,
              subject: `Payout Summary - ${mentorName}`,
              text: `Payout processed for ${mentorName}. Total Due (Pre-TDS): ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(totalPayout)}. PAN: ${pan || 'N/A'}.`
            })
            console.log(`Finance summary email sent successfully for ${mentorName}`)
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

      // Get mentor PAN, email, and phone
      const pan = await googleSheetsService.getMentorPAN(mentorName)
      const mentorDetailList = await googleSheetsService.getMentorDetails()
      const mentorDetail = mentorDetailList.find(d => d.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim())
      const mentorEmail = mentorDetail?.email || 'N/A'
      const mentorPhone = mentorDetail?.phone || 'N/A'

      // Generate invoice number based on mentor initials
      const invoiceCount = await googleSheetsService.getVendorInvoiceCountForMentor(mentorName)
      const nameParts = mentorName.trim().split(/\s+/)
      const firstInitial = nameParts[0]?.charAt(0).toUpperCase() || 'X'
      const lastInitial = nameParts[nameParts.length - 1]?.charAt(0).toUpperCase() || 'X'
      const invoiceNumber = `${firstInitial}${lastInitial}-${String(invoiceCount + 1).padStart(3, '0')}`

      // Do not add Vendor Payments record in Final Payments flow as per new requirement

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
        message: `Successfully marked all final payments for ${mentorName} as paid` 
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
