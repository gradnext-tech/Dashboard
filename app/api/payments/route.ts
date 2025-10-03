import { NextRequest, NextResponse } from 'next/server'
import { googleSheetsService } from '@/lib/google-sheets'
import nodemailer from 'nodemailer'

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
    const body = await request.json()
    const { action, paymentIds, mentorName } = body

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
          `Best,\nGradNext`
        
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

    if (action === 'markFinalPaymentsPaid') {
      const { paymentIds } = body
      
      if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
        return NextResponse.json(
          { error: 'paymentIds array is required' },
          { status: 400 }
        )
      }

      // Mark final payments as paid in the Mentor Commission sheet
      await googleSheetsService.markFinalPaymentsAsPaid(paymentIds)

      return NextResponse.json({ 
        success: true, 
        message: `Successfully marked ${paymentIds.length} final payments as paid` 
      })
    }

    if (action === 'markFinalPaymentsByMentorPaid') {
      const { mentorName } = body
      
      if (!mentorName || typeof mentorName !== 'string') {
        return NextResponse.json(
          { error: 'mentorName is required' },
          { status: 400 }
        )
      }

      // Mark all final payments for this mentor as paid in the Mentor Commission sheet
      await googleSheetsService.markFinalPaymentsByMentorAsPaid(mentorName)

      return NextResponse.json({ 
        success: true, 
        message: `Successfully marked all final payments for ${mentorName} as paid` 
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing payment action:', error)
    return NextResponse.json(
      { error: 'Failed to process payment action' },
      { status: 500 }
    )
  }
}
