"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'

type TDSPayment = {
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
}

interface TdsPaymentsTableProps {
  tdsPayments: TDSPayment[]
  loading?: boolean
  onMarkMentorPaid?: (mentorName: string, paymentIds: string[]) => Promise<void> | void
}

interface DateTDSData {
  date: string
  totalTDS: number
  mentors: Array<{
    mentorName: string
    totalTDS: number
    payments: TDSPayment[]
  }>
  allPayments: TDSPayment[]
}

export function TDSPaymentsTable({ tdsPayments, loading = false, onMarkMentorPaid }: TdsPaymentsTableProps) {
  const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [groupMode, setGroupMode] = useState<'date' | 'mentor'>('date')
  const [expandedMentors, setExpandedMentors] = useState<Set<string>>(new Set())
  const [selectedMonth, setSelectedMonth] = useState<string>('') // Format: "YYYY-MM" or empty for all

  // Normalize date for consistent grouping - ALWAYS treat as DD/MM/YYYY (en-IN format)
  const normalizeDateKey = (dateStr: string): string => {
    if (!dateStr) return ''
    const trimmed = dateStr.toString().trim()
    
    // Parse as DD/MM/YYYY format (en-IN standard) - never use Date() constructor
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, '0')
      const month = ddmmyyyyMatch[2].padStart(2, '0')
      let year = ddmmyyyyMatch[3]
      if (year.length === 2) year = `20${year}`
      // Return in DD/MM/YYYY format
      return `${day}/${month}/${year}`
    }
    
    // If regex doesn't match, return original string
    return trimmed
  }

  // Extract month/year from dateOfPayment (DD/MM/YYYY format) to YYYY-MM
  const getMonthYear = (dateStr: string): string => {
    const normalized = normalizeDateKey(dateStr)
    const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (match) {
      const day = match[1]
      const month = match[2]
      const year = match[3]
      return `${year}-${month}` // Return as YYYY-MM
    }
    return ''
  }

  // Filter payments by selected month
  const filteredPayments = selectedMonth
    ? tdsPayments.filter(payment => getMonthYear(payment.dateOfPayment) === selectedMonth)
    : tdsPayments

  // Get unique months from all payments for the dropdown
  const availableMonths = Array.from(
    new Set(tdsPayments.map(p => getMonthYear(p.dateOfPayment)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a)) // Sort descending (newest first)

  // Group by Date of Payment, then by Mentor
  const groupByDate = (payments: TDSPayment[]): DateTDSData[] => {
    const dateGroups = payments.reduce((acc, payment) => {
      const dateKey = normalizeDateKey(payment.dateOfPayment)
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(payment)
      return acc
    }, {} as Record<string, TDSPayment[]>)

    return Object.entries(dateGroups).map(([date, datePayments]) => {
      // Group by mentor within this date
      const mentorGroups = datePayments.reduce((acc, payment) => {
        const mentorName = payment.mentorName
        if (!acc[mentorName]) {
          acc[mentorName] = []
        }
        acc[mentorName].push(payment)
        return acc
      }, {} as Record<string, TDSPayment[]>)

      const mentors = Object.entries(mentorGroups).map(([mentorName, mentorPayments]) => ({
        mentorName,
        totalTDS: mentorPayments.reduce((sum, p) => sum + (p.tdsAmount || 0), 0),
        payments: mentorPayments.sort((a, b) => {
          const dateA = new Date(a.sessionDate).getTime()
          const dateB = new Date(b.sessionDate).getTime()
          return isNaN(dateA) || isNaN(dateB) ? 0 : dateA - dateB
        })
      })).sort((a, b) => a.mentorName.localeCompare(b.mentorName))

      const totalTDS = datePayments.reduce((sum, p) => sum + (p.tdsAmount || 0), 0)

      return {
        date,
        totalTDS,
        mentors,
        allPayments: datePayments
      }
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return isNaN(dateA) || isNaN(dateB) ? 0 : dateA - dateB
    })
  }

  // Group by Mentor, then by Date of Payment
  const groupByMentor = (payments: TDSPayment[]): Array<{
    mentorName: string
    totalTDS: number
    dates: Array<{
      date: string
      totalTDS: number
      payments: TDSPayment[]
    }>
  }> => {
    const mentorGroups = payments.reduce((acc, payment) => {
      const key = payment.mentorName || 'Unknown Mentor'
      if (!acc[key]) acc[key] = []
      acc[key].push(payment)
      return acc
    }, {} as Record<string, TDSPayment[]>)

    const result = Object.entries(mentorGroups).map(([mentorName, mentorPayments]) => {
      // group this mentor's payments by payment date
      const dateGroups = mentorPayments.reduce((acc, p) => {
    const dateKey = normalizeDateKey(p.dateOfPayment)
        if (!acc[dateKey]) acc[dateKey] = []
        acc[dateKey].push(p)
    return acc
      }, {} as Record<string, TDSPayment[]>)

      const dates = Object.entries(dateGroups).map(([date, payments]) => ({
      date,
        totalTDS: payments.reduce((sum, x) => sum + (x.tdsAmount || 0), 0),
        payments: payments.sort((a, b) => {
          const da = new Date(a.sessionDate).getTime()
          const db = new Date(b.sessionDate).getTime()
          return isNaN(da) || isNaN(db) ? 0 : da - db
        })
      })).sort((a, b) => {
        const da = new Date(a.date).getTime()
        const db = new Date(b.date).getTime()
        return isNaN(da) || isNaN(db) ? 0 : da - db
      })

      const totalTDS = mentorPayments.reduce((sum, p) => sum + (p.tdsAmount || 0), 0)

      return {
        mentorName,
        totalTDS,
        dates
      }
    }).sort((a, b) => a.mentorName.localeCompare(b.mentorName))

    return result
  }

  const dateData = groupByDate(filteredPayments || [])
  const mentorData = groupByMentor(filteredPayments || [])
  const totalTDS = dateData.reduce((sum, d) => sum + d.totalTDS, 0)

  // Format month for display (YYYY-MM -> "Month YYYY")
  const formatMonthDisplay = (monthStr: string): string => {
    if (!monthStr) return 'All Months'
    const [year, month] = monthStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDates(new Set(dateData.map(d => d.date)))
    } else {
      setSelectedDates(new Set())
    }
  }

  const handleSelectDate = (date: string, checked: boolean) => {
    const newSelected = new Set(selectedDates)
    if (checked) {
      newSelected.add(date)
    } else {
      newSelected.delete(date)
    }
    setSelectedDates(newSelected)
  }

  const handleMarkSelectedAsPaid = async () => {
    if (selectedDates.size === 0) return
    
    setProcessing(true)
    try {
      for (const date of Array.from(selectedDates)) {
        await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'markTdsDatePaid', dateOfPayment: date })
        })
      }
      setSelectedDates(new Set())
    } catch (error) {
      console.error('Error marking TDS payments as paid:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleMarkIndividualDateAsPaid = async (date: string) => {
    setProcessing(true)
    try {
      await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markTdsDatePaid', dateOfPayment: date })
      })
    } catch (error) {
      console.error('Error marking TDS payment as paid:', error)
    } finally {
      setProcessing(false)
    }
  }

  const toggleDateExpansion = (date: string) => {
    const newExpanded = new Set(expandedDates)
    if (newExpanded.has(date)) {
      newExpanded.delete(date)
    } else {
      newExpanded.add(date)
    }
    setExpandedDates(newExpanded)
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
      
      {!loading && dateData.length === 0 && (
        <div className="text-center py-8">
          <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="w-12 h-12 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {selectedMonth ? 'No TDS payments found for selected month' : 'All caught up!'}
          </h3>
          <p className="text-gray-500">
            {selectedMonth ? 'Try selecting a different month or clear the filter.' : 'No TDS payments pending.'}
          </p>
        </div>
      )}

      {!loading && (groupMode === 'date' ? dateData.length > 0 : mentorData.length > 0) && (
        <>
          {/* Actions Bar */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                <button
                  className={`text-xs px-2 py-1 rounded border ${groupMode === 'date' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  onClick={() => setGroupMode('date')}
                >
                  Group by Date
                </button>
                <button
                  className={`text-xs px-2 py-1 rounded border ${groupMode === 'mentor' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                  onClick={() => setGroupMode('mentor')}
                >
                  Group by Mentor
                </button>
              </div>
              {/* Month Filter */}
              <div className="flex items-center space-x-2 ml-4">
                <label htmlFor="month-filter" className="text-sm text-gray-600 whitespace-nowrap">
                  Filter by Month:
                </label>
                <select
                  id="month-filter"
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value)
                    setSelectedDates(new Set()) // Clear date selections when month changes
                  }}
                  className="text-sm px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Months</option>
                  {availableMonths.map(month => (
                    <option key={month} value={month}>
                      {formatMonthDisplay(month)}
                    </option>
                  ))}
                </select>
              </div>
              {groupMode === 'date' && (
                <>
                  <input
                    type="checkbox"
                    checked={selectedDates.size === dateData.length && dateData.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary ml-3"
                  />
                  <span className="text-sm text-gray-600">
                    {selectedDates.size > 0 
                      ? `${selectedDates.size} date(s) selected`
                      : `Select all (${dateData.length} dates)`
                    }
                  </span>
                </>
              )}
            </div>
            
            {groupMode === 'date' && selectedDates.size > 0 && onMarkMentorPaid && (
              <Button
                onClick={handleMarkSelectedAsPaid}
                disabled={processing}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-2" />
                Mark Selected as Paid ({selectedDates.size})
              </Button>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Total Payment Dates</div>
                <div className="text-2xl font-bold text-gray-900">{dateData.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-500">Total TDS Amount</div>
                <div className="text-2xl font-bold text-red-600">{formatter.format(totalTDS)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tables */}
          {groupMode === 'date' ? (
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        checked={selectedDates.size === dateData.length && dateData.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Date
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mentors
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payments
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total TDS
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dateData.map((dateGroup) => (
                    <>
                      <tr key={dateGroup.date} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedDates.has(dateGroup.date)}
                            onChange={(e) => handleSelectDate(dateGroup.date, e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <button
                              onClick={() => toggleDateExpansion(dateGroup.date)}
                              className="mr-2 p-1 hover:bg-gray-100 rounded"
                            >
                              {expandedDates.has(dateGroup.date) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <div className="text-sm font-medium text-gray-900">{dateGroup.date}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                          {dateGroup.mentors.length}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                          {dateGroup.allPayments.length}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-bold text-red-600">
                            {formatter.format(dateGroup.totalTDS)}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={processing}
                            onClick={() => handleMarkIndividualDateAsPaid(dateGroup.date)}
                            className="bg-green-600 text-white border-green-600 hover:bg-green-700 text-xs px-2 py-1"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Mark Paid
                          </Button>
                        </td>
                      </tr>
                      
                      {/* Expanded Details */}
                      {expandedDates.has(dateGroup.date) && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-2">TDS Breakdown by Mentor</h4>
                              
                              {/* Mentor Summary */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                {dateGroup.mentors.map((mentor) => (
                                  <div key={mentor.mentorName} className="bg-white p-3 rounded border">
                                    <div className="text-sm font-medium text-gray-900">{mentor.mentorName}</div>
                                    <div className="text-xs text-gray-500">{mentor.payments.length} sessions</div>
                                    <div className="text-sm font-bold text-red-600 mt-1">{formatter.format(mentor.totalTDS)}</div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Detailed Session Table */}
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Session Details</h4>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mentor</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mentee</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session Date</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Payout</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">TDS Amount</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Post-TDS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {dateGroup.allPayments.map((payment) => (
                                      <tr key={payment.sNo}>
                                        <td className="px-3 py-2 text-xs text-gray-900">{payment.mentorName}</td>
                                        <td className="px-3 py-2 text-xs text-gray-900">{payment.menteeName}</td>
                                        <td className="px-3 py-2 text-xs text-gray-900">{payment.sessionDate}</td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-900">{formatter.format(payment.totalPayout)}</td>
                                        <td className="px-3 py-2 text-xs text-right text-red-600">{formatter.format(payment.tdsAmount)}</td>
                                        <td className="px-3 py-2 text-xs text-right text-green-600">{formatter.format(payment.postTdsAmount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                    </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mentor
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dates
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total TDS
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mentorData.map((mentorGroup) => (
                    <>
                      <tr key={mentorGroup.mentorName} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <button
                              onClick={() => {
                                const s = new Set(expandedMentors)
                                s.has(mentorGroup.mentorName) ? s.delete(mentorGroup.mentorName) : s.add(mentorGroup.mentorName)
                                setExpandedMentors(s)
                              }}
                              className="mr-2 p-1 hover:bg-gray-100 rounded"
                            >
                              {expandedMentors.has(mentorGroup.mentorName) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <div className="text-sm font-medium text-gray-900">{mentorGroup.mentorName}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {mentorGroup.dates.length}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-bold text-red-600">
                            {formatter.format(mentorGroup.totalTDS)}
                          </div>
                        </td>
                      </tr>
                      {expandedMentors.has(mentorGroup.mentorName) && (
                        <tr>
                          <td colSpan={3} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-2">TDS Dates for {mentorGroup.mentorName}</h4>
                              <div className="space-y-3">
                                {mentorGroup.dates.map((dg) => (
                                  <div key={`${mentorGroup.mentorName}-${dg.date}`} className="bg-white border rounded">
                                    <div className="flex items-center justify-between px-3 py-2 border-b">
                                      <div className="text-sm font-medium text-gray-900">{dg.date}</div>
                                      <div className="flex items-center space-x-3">
                                        <div className="text-sm font-bold text-red-600">{formatter.format(dg.totalTDS)}</div>
                                        {onMarkMentorPaid && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={processing}
                                            onClick={async () => {
                                              try {
                                                setProcessing(true)
                                                const ids = dg.payments.map(p => `tds_${p.sNo}`)
                                                await onMarkMentorPaid(mentorGroup.mentorName, ids)
                                              } finally {
                                                setProcessing(false)
                                              }
                                            }}
                                            className="bg-green-600 text-white border-green-600 hover:bg-green-700 text-xs px-2 py-1"
                                          >
                                            <Check className="w-3 h-3 mr-1" />
                                            Mark Paid
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mentee</th>
                                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session Date</th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total Payout</th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">TDS Amount</th>
                                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Post-TDS</th>
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {dg.payments.map((p) => (
                                            <tr key={p.sNo}>
                                              <td className="px-3 py-2 text-xs text-gray-900">{p.menteeName}</td>
                                              <td className="px-3 py-2 text-xs text-gray-900">{p.sessionDate}</td>
                                              <td className="px-3 py-2 text-xs text-right text-gray-900">{formatter.format(p.totalPayout)}</td>
                                              <td className="px-3 py-2 text-xs text-right text-red-600">{formatter.format(p.tdsAmount)}</td>
                                              <td className="px-3 py-2 text-xs text-right text-green-600">{formatter.format(p.postTdsAmount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}


