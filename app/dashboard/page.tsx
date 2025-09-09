'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PaymentTable } from '@/components/payment-table'
import { MentorCommissionTable } from '@/components/mentor-commission-table'
import { CorporateSessionsTable } from '@/components/corporate-sessions-table'
import { AddManualEntryForm } from '@/components/add-manual-entry-form'
import { PaymentRecord, CorporateSessionRecord } from '@/lib/google-sheets'
import { RefreshCw, LogOut, DollarSign, Clock, CheckCircle, Download, Plus, Users, BarChart3, Building2 } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)
  const [activeTab, setActiveTab] = useState<'payments' | 'commissions' | 'corporate'>('payments')

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      router.push('/auth/signin')
      return
    }

    fetchPayments()
    fetchMentorCommissions()
    fetchCorporateSessions()
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

      // Refresh the payments list, mentor commissions, and corporate sessions
      await fetchPayments()
      await fetchMentorCommissions()
      await fetchCorporateSessions()
    } catch (error) {
      console.error('Error marking payments as paid:', error)
    }
  }

  const handleExportToMentorCommission = async () => {
    try {
      setExporting(true)
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'exportToMentorCommission',
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

  const [emailing, setEmailing] = useState(false)
  const handleEmailMentorPayouts = async () => {
    try {
      setEmailing(true)
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'emailMentorPayouts' }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to email mentor payouts')
      }
      alert(data.message || 'Emails queued/sent to mentors with pending payouts')
    } catch (error) {
      console.error('Error emailing mentor payouts:', error)
      alert(error instanceof Error ? error.message : 'Failed to email mentor payouts')
    } finally {
      setEmailing(false)
    }
  }

  const handleAddManualEntry = async (entry: {
    mentorName: string
    menteeName: string
    sessionDate: string
    sessionStatus: string
    rate: number
    paymentStatus: string
    noOfSessions: number
    totalPayout: number
  }) => {
    try {
      setAddingEntry(true)
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'addManualEntry',
          entry,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add manual entry')
      }

      const data = await response.json()
      alert(data.message || 'Successfully added manual entry to Mentor Commission sheet')
      setShowAddForm(false)
    } catch (error) {
      console.error('Error adding manual entry:', error)
      alert(error instanceof Error ? error.message : 'Failed to add manual entry')
    } finally {
      setAddingEntry(false)
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
                  <DollarSign className="w-4 h-4 mr-2" />
                  Due Payments
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
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Mentor Commissions
                </div>
              </button>
              <button
                onClick={() => setActiveTab('corporate')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'corporate'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <Building2 className="w-4 h-4 mr-2" />
                  Corporate Sessions
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
                      onClick={() => setShowAddForm(true)}
                      variant="outline"
                      className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Manual Entry
                    </Button>
                    <Button
                      onClick={handleEmailMentorPayouts}
                      disabled={emailing}
                      variant="outline"
                      className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                    >
                      {emailing ? 'Sending Emails...' : 'Email Mentor Payouts'}
                    </Button>
                    <Button
                      onClick={handleExportToMentorCommission}
                      disabled={exporting || duePayments.length === 0}
                      variant="outline"
                      className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                    >
                      <Download className={`w-4 h-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
                      {exporting ? 'Exporting...' : 'Export to Mentor Commission'}
                    </Button>
                    <Button
                      onClick={() => {
                        fetchPayments()
                        fetchMentorCommissions()
                        fetchCorporateSessions()
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
                  onMarkAsPaid={handleMarkAsPaid}
                  loading={refreshing}
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
                  <CardTitle>Mentor Commission Summary</CardTitle>
                  <CardDescription>
                    Total commission breakdown by mentor (including corporate sessions)
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    fetchMentorCommissions()
                    fetchPayments()
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
              <MentorCommissionTable
                data={mentorCommissions}
                loading={refreshing}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === 'corporate' && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Corporate Sessions</CardTitle>
                  <CardDescription>
                    Corporate session data from multiple company sheets
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    fetchCorporateSessions()
                    fetchPayments()
                    fetchMentorCommissions()
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
              <CorporateSessionsTable
                data={corporateSessions}
                loading={refreshing}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Manual Entry Form Modal */}
      {showAddForm && (
        <AddManualEntryForm
          onAdd={handleAddManualEntry}
          onClose={() => setShowAddForm(false)}
          loading={addingEntry}
        />
      )}
    </div>
  )
}
