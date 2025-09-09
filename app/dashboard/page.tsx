'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PaymentTable } from '@/components/payment-table'
import { AddManualEntryForm } from '@/components/add-manual-entry-form'
import { PaymentRecord } from '@/lib/google-sheets'
import { RefreshCw, LogOut, DollarSign, Clock, CheckCircle, Download, Plus } from 'lucide-react'

export default function Dashboard() {
  const { isAuthenticated, logout, loading: authLoading } = useAuth()
  const router = useRouter()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      router.push('/auth/signin')
      return
    }

    fetchPayments()
  }, [isAuthenticated, authLoading, router])

  const fetchPayments = async (showDueOnly = true) => {
    try {
      setRefreshing(true)
      const response = await fetch(`/api/payments?type=${showDueOnly ? 'due' : 'all'}`)
      
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

      // Refresh the payments list
      await fetchPayments()
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Due</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalDue)}</div>
              <p className="text-xs text-muted-foreground">
                {duePayments.length} pending payments
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{duePayments.length}</div>
              <p className="text-xs text-muted-foreground">
                Payments awaiting processing
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
                  Payments that need to be processed
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
                  onClick={() => fetchPayments()}
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
