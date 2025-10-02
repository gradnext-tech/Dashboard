'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Calendar, DollarSign, User, Mail, Search, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { MultiSelect } from '@/components/ui/multi-select'

interface FinalPayment {
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
}

interface CumulativeMentorPayment {
  mentorName: string
  totalSessions: number
  totalPayout: number
  paymentCount: number
  payments: FinalPayment[]
  monthlyBreakdown: { month: string; sessions: number; payout: number }[]
}

interface CumulativeMentorPaymentsTableProps {
  finalPayments: FinalPayment[]
  onMarkMentorPaid?: (mentorName: string, paymentIds: string[]) => Promise<void>
  loading?: boolean
}

export function CumulativeMentorPaymentsTable({ 
  finalPayments, 
  onMarkMentorPaid, 
  loading = false 
}: CumulativeMentorPaymentsTableProps) {
  const [selectedMentors, setSelectedMentors] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMonths, setFilterMonths] = useState<string[]>([])
  const [expandedMentors, setExpandedMentors] = useState<Set<string>>(new Set())

  // Aggregate payments by mentor
  const aggregatePaymentsByMentor = (payments: FinalPayment[]): CumulativeMentorPayment[] => {
    const mentorGroups = payments.reduce((acc, payment) => {
      const mentorName = payment.mentorName
      if (!acc[mentorName]) {
        acc[mentorName] = []
      }
      acc[mentorName].push(payment)
      return acc
    }, {} as Record<string, FinalPayment[]>)

    return Object.entries(mentorGroups).map(([mentorName, mentorPayments]) => {
      const totalSessions = mentorPayments.reduce((sum, p) => sum + p.noOfSessions, 0)
      const totalPayout = mentorPayments.reduce((sum, p) => sum + p.totalPayout, 0)
      
      // Create monthly breakdown
      const monthlyBreakdown = mentorPayments.reduce((acc, payment) => {
        if (payment.sessionDate) {
          try {
            const date = new Date(payment.sessionDate)
            if (!isNaN(date.getTime())) {
              const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
              if (!acc[monthKey]) {
                acc[monthKey] = { sessions: 0, payout: 0 }
              }
              acc[monthKey].sessions += payment.noOfSessions
              acc[monthKey].payout += payment.totalPayout
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
        return acc
      }, {} as Record<string, { sessions: number; payout: number }>)

      return {
        mentorName,
        totalSessions,
        totalPayout,
        paymentCount: mentorPayments.length,
        payments: mentorPayments.sort((a, b) => {
          const dateA = new Date(a.sessionDate).getTime()
          const dateB = new Date(b.sessionDate).getTime()
          return isNaN(dateA) || isNaN(dateB) ? 0 : dateA - dateB
        }),
        monthlyBreakdown: Object.entries(monthlyBreakdown)
          .map(([month, data]) => ({ month, ...data }))
          .sort((a, b) => {
            const dateA = new Date(a.month).getTime()
            const dateB = new Date(b.month).getTime()
            return isNaN(dateA) || isNaN(dateB) ? 0 : dateA - dateB
          })
      }
    }).sort((a, b) => a.mentorName.localeCompare(b.mentorName))
  }

  // Get unique months from payments for filter dropdown
  const getUniqueMonths = () => {
    const monthsWithDates = new Map<string, Date>()
    finalPayments.forEach(payment => {
      if (payment.sessionDate) {
        try {
          const date = new Date(payment.sessionDate)
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
    return Array.from(monthsWithDates.entries())
      .sort(([, dateA], [, dateB]) => dateA.getTime() - dateB.getTime())
      .map(([monthKey]) => monthKey)
  }

  // Filter payments based on search and filter criteria
  const filteredPayments = finalPayments.filter(payment => {
    const matchesSearch = !searchTerm || 
      payment.mentorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.menteeName.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesMonth = filterMonths.length === 0 || (() => {
      if (!payment.sessionDate) return false
      try {
        const date = new Date(payment.sessionDate)
        if (isNaN(date.getTime())) return false
        const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
        return filterMonths.includes(monthKey)
      } catch (e) {
        return false
      }
    })()
    
    return matchesSearch && matchesMonth
  })

  const cumulativePayments = aggregatePaymentsByMentor(filteredPayments)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMentors(new Set(cumulativePayments.map(p => p.mentorName)))
    } else {
      setSelectedMentors(new Set())
    }
  }

  const handleSelectMentor = (mentorName: string, checked: boolean) => {
    const newSelected = new Set(selectedMentors)
    if (checked) {
      newSelected.add(mentorName)
    } else {
      newSelected.delete(mentorName)
    }
    setSelectedMentors(newSelected)
  }

  const handleMarkSelectedAsPaid = async () => {
    if (selectedMentors.size === 0 || !onMarkMentorPaid) return
    
    setProcessing(true)
    try {
      for (const mentorName of Array.from(selectedMentors)) {
        const mentorData = cumulativePayments.find(m => m.mentorName === mentorName)
        if (mentorData) {
          const paymentIds = mentorData.payments.map(p => `final_${p.sNo}`)
          await onMarkMentorPaid(mentorName, paymentIds)
        }
      }
      setSelectedMentors(new Set())
    } catch (error) {
      console.error('Error marking mentor payments as paid:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleMarkIndividualMentorAsPaid = async (mentorName: string) => {
    if (!onMarkMentorPaid) return
    
    setProcessing(true)
    try {
      const mentorData = cumulativePayments.find(m => m.mentorName === mentorName)
      if (mentorData) {
        const paymentIds = mentorData.payments.map(p => `final_${p.sNo}`)
        await onMarkMentorPaid(mentorName, paymentIds)
      }
    } catch (error) {
      console.error('Error marking mentor payments as paid:', error)
    } finally {
      setProcessing(false)
    }
  }

  const toggleMentorExpansion = (mentorName: string) => {
    const newExpanded = new Set(expandedMentors)
    if (newExpanded.has(mentorName)) {
      newExpanded.delete(mentorName)
    } else {
      newExpanded.add(mentorName)
    }
    setExpandedMentors(newExpanded)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date'
    try {
      return format(new Date(dateString), 'MMM dd, yyyy')
    } catch {
      return dateString
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (finalPayments.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-12 h-12 text-green-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
        <p className="text-gray-500">No pending final payments at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by mentor or mentee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Month Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 z-10" />
            <MultiSelect
              options={getUniqueMonths().map(month => ({
                label: month,
                value: month
              }))}
              value={filterMonths}
              onChange={setFilterMonths}
              placeholder="All Months"
              className="pl-10"
            />
          </div>
          
          {/* Clear Filters */}
          <Button
            onClick={() => {
              setSearchTerm('')
              setFilterMonths([])
            }}
            variant="outline"
            className="w-full"
          >
            Clear Filters
          </Button>

          {/* Expand/Collapse All */}
          <Button
            onClick={() => {
              if (expandedMentors.size === cumulativePayments.length) {
                setExpandedMentors(new Set())
              } else {
                setExpandedMentors(new Set(cumulativePayments.map(m => m.mentorName)))
              }
            }}
            variant="outline"
            className="w-full"
          >
            {expandedMentors.size === cumulativePayments.length ? 'Collapse All' : 'Expand All'}
          </Button>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={selectedMentors.size === cumulativePayments.length && cumulativePayments.length > 0}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-600">
            {selectedMentors.size > 0 
              ? `${selectedMentors.size} mentor(s) selected`
              : `Select all (${cumulativePayments.length} mentors)`
            }
          </span>
        </div>
        
        {selectedMentors.size > 0 && onMarkMentorPaid && (
          <Button
            onClick={handleMarkSelectedAsPaid}
            disabled={processing}
            className="bg-green-600 hover:bg-green-700"
          >
            <Check className="w-4 h-4 mr-2" />
            Mark Selected as Paid ({selectedMentors.size})
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Mentors</div>
          <div className="text-2xl font-bold text-gray-900">{cumulativePayments.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Sessions</div>
          <div className="text-2xl font-bold text-gray-900">
            {cumulativePayments.reduce((sum, m) => sum + m.totalSessions, 0)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Payout</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(cumulativePayments.reduce((sum, m) => sum + m.totalPayout, 0))}
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedMentors.size === cumulativePayments.length && cumulativePayments.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Payout
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cumulativePayments.map((mentorData) => (
                <>
                  <tr key={mentorData.mentorName} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedMentors.has(mentorData.mentorName)}
                        onChange={(e) => handleSelectMentor(mentorData.mentorName, e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleMentorExpansion(mentorData.mentorName)}
                          className="mr-2 p-1 hover:bg-gray-100 rounded"
                        >
                          {expandedMentors.has(mentorData.mentorName) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <div className="flex-shrink-0 h-8 w-8">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {mentorData.mentorName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mentorData.totalSessions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {mentorData.paymentCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">
                        {formatCurrency(mentorData.totalPayout)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processing}
                        onClick={() => handleMarkIndividualMentorAsPaid(mentorData.mentorName)}
                        className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Mark as Paid
                      </Button>
                    </td>
                  </tr>
                  
                  {/* Expanded Details */}
                  {expandedMentors.has(mentorData.mentorName) && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          {/* Monthly Breakdown */}
                          {mentorData.monthlyBreakdown.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Monthly Breakdown</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {mentorData.monthlyBreakdown.map((month) => (
                                  <div key={month.month} className="bg-white p-3 rounded border">
                                    <div className="text-xs text-gray-500">{month.month}</div>
                                    <div className="text-sm font-medium">{month.sessions} sessions</div>
                                    <div className="text-sm font-bold text-green-600">{formatCurrency(month.payout)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Individual Payments */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Individual Payments</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mentee</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sessions</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payout</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {mentorData.payments.map((payment) => (
                                    <tr key={payment.sNo}>
                                      <td className="px-3 py-2 text-xs text-gray-900">{formatDate(payment.sessionDate)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-900">{payment.menteeName}</td>
                                      <td className="px-3 py-2 text-xs text-gray-900">{payment.noOfSessions}</td>
                                      <td className="px-3 py-2 text-xs font-medium text-gray-900">{formatCurrency(payment.totalPayout)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
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
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {cumulativePayments.map((mentorData) => (
          <div key={mentorData.mentorName} className="bg-white rounded-lg shadow p-4 border">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={selectedMentors.has(mentorData.mentorName)}
                  onChange={(e) => handleSelectMentor(mentorData.mentorName, e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-shrink-0 h-8 w-8">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900">{mentorData.mentorName}</h3>
                  <p className="text-xs text-gray-500">{mentorData.paymentCount} payments</p>
                </div>
              </div>
              <button
                onClick={() => toggleMentorExpansion(mentorData.mentorName)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                {expandedMentors.has(mentorData.mentorName) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
            
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total Sessions</span>
                <span className="text-sm font-medium text-gray-900">{mentorData.totalSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">Total Payout</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(mentorData.totalPayout)}</span>
              </div>
            </div>
            
            {/* Expanded Details for Mobile */}
            {expandedMentors.has(mentorData.mentorName) && (
              <div className="border-t pt-3 space-y-3">
                {mentorData.monthlyBreakdown.map((month) => (
                  <div key={month.month} className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">{month.month}</div>
                    <div className="flex justify-between">
                      <span className="text-sm">{month.sessions} sessions</span>
                      <span className="text-sm font-bold text-green-600">{formatCurrency(month.payout)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="pt-3 border-t border-gray-200">
              <Button
                size="sm"
                disabled={processing}
                onClick={() => handleMarkIndividualMentorAsPaid(mentorData.mentorName)}
                className="w-full bg-green-600 text-white hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-2" />
                Mark as Paid
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
