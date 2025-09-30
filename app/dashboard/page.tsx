'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PaymentTable } from '@/components/payment-table'
import { MentorCommissionTable } from '@/components/mentor-commission-table'
import { CorporateSessionsTable } from '@/components/corporate-sessions-table'
import { PaymentRecord, CorporateSessionRecord } from '@/lib/google-sheets'
import { RefreshCw, LogOut, DollarSign, Clock, CheckCircle, Send, Users, BarChart3, Building2, Mail } from 'lucide-react'

export default function Dashboard() {
  const { isAuthenticated, logout, loading: authLoading } = useAuth()
  const router = useRouter()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [mentorCommissions, setMentorCommissions] = useState<Array<{
    mentorName: string
    mentorEmail: string
    totalPayout: number
    sessions: number
    monthlyBreakdown: Array<{ month: string; payout: number; sessions: number }>
  }>>([])
  const [corporateSessions, setCorporateSessions] = useState<CorporateSessionRecord[]>([])
  const [finalPayments, setFinalPayments] = useState<Array<{
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
  }>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'payments' | 'commissions' | 'final-payments'>('payments')
  const [filteredPayments, setFilteredPayments] = useState<PaymentRecord[]>([])
  const [filteredMentorCommissions, setFilteredMentorCommissions] = useState<Array<{
    mentorName: string
    mentorEmail: string
    totalPayout: number
    sessions: number
    monthlyBreakdown: Array<{ month: string; payout: number; sessions: number }>
  }>>([])
  const [filteredMonths, setFilteredMonths] = useState<string[]>([])

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      router.push('/auth/signin')
      return
    }

    fetchPayments()
    fetchMentorCommissions()
    fetchCorporateSessions()
    fetchFinalPayments()
  }, [isAuthenticated, authLoading, router])

  const fetchPayments = async (showDueOnly = true) => {
    try {
      setRefreshing(true)
      // Use all-payments to include corporate sessions
      const response = await fetch(`/api/payments?type=${showDueOnly ? 'all-payments' : 'all'}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch payments')
      }
      
      const data = await response.json()
      setPayments(data.payments || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchMentorCommissions = async () => {
    try {
      const response = await fetch('/api/payments?type=mentor-commissions')
      
      if (!response.ok) {
        throw new Error('Failed to fetch mentor commissions')
      }
      
      const data = await response.json()
      setMentorCommissions(data.mentorCommissions || [])
    } catch (error) {
      console.error('Error fetching mentor commissions:', error)
    }
  }

  const fetchCorporateSessions = async () => {
    try {
      const response = await fetch('/api/payments?type=corporate-sessions')
      
      if (!response.ok) {
        throw new Error('Failed to fetch corporate sessions')
      }
      
      const data = await response.json()
      setCorporateSessions(data.corporateSessions || [])
    } catch (error) {
      console.error('Error fetching corporate sessions:', error)
    }
  }

  const fetchFinalPayments = async () => {
    try {
      const response = await fetch('/api/payments?type=final-payments')
      
      if (!response.ok) {
        throw new Error('Failed to fetch final payments')
      }
      
      const data = await response.json()
      setFinalPayments(data.finalPayments || [])
    } catch (error) {
      console.error('Error fetching final payments:', error)
    }
  }

  const handleMarkAsPaid = async (paymentIds: string[]) => {
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'markPaid',
          paymentIds,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark payments as paid')
      }

      // Refresh the payments list, mentor commissions, corporate sessions, and final payments
      await fetchPayments()
      await fetchMentorCommissions()
      await fetchCorporateSessions()
      await fetchFinalPayments()
    } catch (error) {
      console.error('Error marking payments as paid:', error)
    }
  }

  const handleExportToMentorCommission = async (filteredData?: { mentors: string[], months: string[] }) => {
    try {
      setExporting(true)
      
      // If filtered data is provided from MentorCommissionTable, apply those filters to payments
      let paymentsToExport = payments
      if (filteredData) {
        paymentsToExport = payments.filter(payment => {
          const matchesMentor = filteredData.mentors.length === 0 || filteredData.mentors.includes(payment.mentorName)
          
          const matchesMonth = filteredData.months.length === 0 || (() => {
            if (!payment.sessionDate) return false
            try {
              const date = new Date(payment.sessionDate)
              if (isNaN(date.getTime())) return false
              const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
              return filteredData.months.includes(monthKey)
            } catch (e) {
              return false
            }
          })()
          
          return matchesMentor && matchesMonth
        })
      } else {
        // Fallback to filtered payments from PaymentTable if no specific filter data provided
        paymentsToExport = filteredPayments.length > 0 ? filteredPayments : payments
      }
      
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'exportToMentorCommission',
          filteredPayments: paymentsToExport
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to export payments')
      }

      const data = await response.json()
      alert(data.message || 'Successfully exported payments to Mentor Commission sheet')
    } catch (error) {
      console.error('Error exporting payments:', error)
      alert(error instanceof Error ? error.message : 'Failed to export payments')
    } finally {
      setExporting(false)
    }
  }

  const handleExportIndividualPayment = async (payment: PaymentRecord) => {
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'exportIndividualToMentorCommission',
          payment: payment
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to export payment')
      }

      const data = await response.json()
      alert(data.message || 'Successfully exported payment to Mentor Commission sheet')
      
      // Refresh data after export
      await fetchPayments()
      await fetchMentorCommissions()
    } catch (error) {
      console.error('Error exporting individual payment:', error)
      alert(error instanceof Error ? error.message : 'Failed to export payment')
      throw error // Re-throw to let the component handle the error display
    }
  }

  const handleMarkMentorCommissionPaid = async (mentorNames: string[]) => {
    if (!mentorNames || mentorNames.length === 0) return
    try {
      for (const mentorName of mentorNames) {
        await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'markMentorCommissionPaid', mentorName }),
        })
      }
      await fetchMentorCommissions()
    } catch (error) {
      console.error('Error marking mentor commissions as paid:', error)
    }
  }

  const handleMarkFinalPaymentsPaid = async (paymentIds: string[]) => {
    if (!paymentIds || paymentIds.length === 0) return
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markFinalPaymentsPaid', paymentIds }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark final payments as paid')
      }

      await fetchFinalPayments()
    } catch (error) {
      console.error('Error marking final payments as paid:', error)
    }
  }

  const [emailing, setEmailing] = useState(false)
  const handleEmailMentorPayouts = async () => {
    try {
      setEmailing(true)
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'emailMentorPayouts',
          filteredPayments: filteredPayments.length > 0 ? filteredPayments : payments
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to email mentor payouts')
      }
      
      // Show detailed summary
      const summary = data.summary || {}
      const skippedMentors = data.results?.filter((r: any) => r.status === 'skipped') || []
      const failedMentors = data.results?.filter((r: any) => r.status === 'failed') || []
      
      let alertMessage = data.message || 'Email process completed'
      
      if (skippedMentors.length > 0) {
        alertMessage += `\n\nMentors skipped (no email in RATE_LIST_SHEET):\n${skippedMentors.map((m: any) => `• ${m.mentorName}`).join('\n')}`
      }
      
      if (failedMentors.length > 0) {
        alertMessage += `\n\nMentors with failed emails:\n${failedMentors.map((m: any) => `• ${m.mentorName} (${m.reason || 'Unknown error'})`).join('\n')}`
      }
      
      alert(alertMessage)
    } catch (error) {
      console.error('Error emailing mentor payouts:', error)
      alert(error instanceof Error ? error.message : 'Failed to email mentor payouts')
    } finally {
      setEmailing(false)
    }
  }


  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const duePayments = payments.filter(p => p.paymentStatus.toLowerCase() === 'due')
  const totalDue = duePayments.reduce((sum, payment) => sum + payment.totalPayout, 0)
  const totalPayments = payments.length
  const paidPayments = payments.filter(p => p.paymentStatus.toLowerCase() === 'paid').length
  
  // Separate regular and corporate payments for display
  const regularPayments = payments.filter(p => !p.id.startsWith('corporate_'))
  const corporatePayments = payments.filter(p => p.id.startsWith('corporate_'))
  const regularDuePayments = regularPayments.filter(p => p.paymentStatus.toLowerCase() === 'due')
  const corporateDuePayments = corporatePayments.filter(p => p.paymentStatus.toLowerCase() === 'due')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Payment Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Dashboard Access
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('payments')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'payments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Mentor Payouts
                </div>
              </button>
              <button
                onClick={() => setActiveTab('commissions')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'commissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Send className="w-4 h-4 mr-2" />
                  Export Mentor Commission
                </div>
              </button>
              <button
                onClick={() => setActiveTab('final-payments')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'final-payments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Final Payments
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'payments' && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Due</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalDue)}</div>
                  <p className="text-xs text-muted-foreground">
                    {duePayments.length} pending payments
                    {corporateDuePayments.length > 0 && (
                      <span className="text-blue-600"> ({corporateDuePayments.length} corporate)</span>
                    )}
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Regular Sessions</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{regularDuePayments.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Regular payments pending
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Corporate Sessions</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{corporateDuePayments.length}</div>
                  <p className="text-xs text-muted-foreground">
                    Corporate payments pending
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{paidPayments}</div>
                  <p className="text-xs text-muted-foreground">
                    Out of {totalPayments} total
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Payments Table */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Due Payments</CardTitle>
                  <CardDescription>
                    Payments that need to be processed (including corporate sessions)
                  </CardDescription>
                </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={handleEmailMentorPayouts}
                      disabled={emailing}
                      variant="outline"
                      className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                    >
                      {emailing ? 'Sending Emails...' : 'Email Mentor Payouts'}
                    </Button>
                    <Button
                      onClick={() => {
                        fetchPayments()
                        fetchMentorCommissions()
                        fetchCorporateSessions()
                        fetchFinalPayments()
                      }}
                      disabled={refreshing}
                      variant="outline"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                      Import Data
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <PaymentTable
                  payments={duePayments}
                  loading={refreshing}
                  showMarkAsPaidActions={false}
                  showSelection={false}
                  onFilteredPaymentsChange={setFilteredPayments}
                />
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'commissions' && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Export Mentor Commission</CardTitle>
                  <CardDescription>
                    Calculate mentor commissions from Google Sheets and Mentor Commission Sheet, then export all payments
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    fetchMentorCommissions()
                    fetchPayments()
                    fetchCorporateSessions()
                    fetchFinalPayments()
                  }}
                  disabled={refreshing}
                  variant="outline"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MentorCommissionTable
                data={mentorCommissions}
                loading={refreshing}
                onExportToMentorCommission={handleExportToMentorCommission}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === 'final-payments' && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Final Payments</CardTitle>
                  <CardDescription>
                    Payments from Mentor Commission Sheet with status "Due" - Mark as Paid only
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    fetchFinalPayments()
                    fetchPayments()
                    fetchMentorCommissions()
                    fetchCorporateSessions()
                  }}
                  disabled={refreshing}
                  variant="outline"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PaymentTable
                payments={finalPayments.map((fp, index) => ({
                  id: `final_${fp.sNo}`,
                  sNo: fp.sNo.toString(),
                  mentorName: fp.mentorName,
                  menteeName: fp.menteeName,
                  sessionDate: fp.sessionDate,
                  sessionStatus: fp.sessionStatus,
                  rate: fp.rate,
                  paymentStatus: fp.paymentStatus,
                  noOfSessions: fp.noOfSessions,
                  totalPayout: fp.totalPayout,
                  rowIndex: index + 1
                }))}
                onMarkAsPaid={handleMarkFinalPaymentsPaid}
                loading={refreshing}
                actionButtonText="Mark as Paid"
                showMarkAsPaidActions={true}
                showSelection={true}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
