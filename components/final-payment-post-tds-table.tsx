'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Calendar, DollarSign, User, Mail, Search, Filter, ChevronDown, ChevronRight, CreditCard, Building } from 'lucide-react'
import { format } from 'date-fns'
import { MultiSelect } from '@/components/ui/multi-select'
import { MentorBankingDetails } from '@/lib/google-sheets'
import * as XLSX from 'xlsx'

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

interface CumulativeMentorPaymentPostTDS {
  mentorName: string
  totalSessions: number
  totalPayout: number
  totalPayoutPostTDS: number
  tdsAmount: number
  paymentCount: number
  payments: FinalPayment[]
  monthlyBreakdown: { month: string; sessions: number; payout: number; payoutPostTDS: number; tdsAmount: number }[]
  bankingDetails?: MentorBankingDetails
}

interface FinalPaymentPostTDSTableProps {
  finalPayments: FinalPayment[]
  bankingDetails: MentorBankingDetails[]
  onMarkMentorPaid?: (mentorName: string, paymentIds: string[]) => Promise<void>
  loading?: boolean
}

export function FinalPaymentPostTDSTable({ 
  finalPayments, 
  bankingDetails,
  onMarkMentorPaid, 
  loading = false 
}: FinalPaymentPostTDSTableProps) {
  const [selectedMentors, setSelectedMentors] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMonths, setFilterMonths] = useState<string[]>([])
  const [expandedMentors, setExpandedMentors] = useState<Set<string>>(new Set())
  const [downloadScope, setDownloadScope] = useState<'all_filtered' | 'selected_mentors'>('all_filtered')

  // TDS rate (10%)
  const TDS_RATE = 0.10

  // Aggregate payments by mentor with TDS calculations
  const aggregatePaymentsByMentor = (payments: FinalPayment[]): CumulativeMentorPaymentPostTDS[] => {
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
      const tdsAmount = totalPayout * TDS_RATE
      const totalPayoutPostTDS = totalPayout - tdsAmount
      
      // Find banking details for this mentor
      const mentorBankingDetails = bankingDetails.find(bd => 
        bd.mentorName.toLowerCase().trim() === mentorName.toLowerCase().trim()
      )
      
      // Create monthly breakdown with TDS calculations
      const monthlyBreakdown = mentorPayments.reduce((acc, payment) => {
        if (payment.sessionDate) {
          try {
            const date = new Date(payment.sessionDate)
            if (!isNaN(date.getTime())) {
              const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
              if (!acc[monthKey]) {
                acc[monthKey] = { sessions: 0, payout: 0, payoutPostTDS: 0, tdsAmount: 0 }
              }
              acc[monthKey].sessions += payment.noOfSessions
              acc[monthKey].payout += payment.totalPayout
              const monthTDS = payment.totalPayout * TDS_RATE
              acc[monthKey].tdsAmount += monthTDS
              acc[monthKey].payoutPostTDS += (payment.totalPayout - monthTDS)
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
        return acc
      }, {} as Record<string, { sessions: number; payout: number; payoutPostTDS: number; tdsAmount: number }>)

      return {
        mentorName,
        totalSessions,
        totalPayout,
        totalPayoutPostTDS,
        tdsAmount,
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
          }),
        bankingDetails: mentorBankingDetails
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

  const getMonthShort = (monthKey: string) => {
    // monthKey is like "February 2026" from toLocaleDateString('en-IN', { year:'numeric', month:'long' })
    const firstWord = (monthKey || '').split(' ')[0] || ''
    if (!firstWord) return ''
    return firstWord.slice(0, 3)
  }

  const buildTransferId = (monthShortLower: string, mentorName: string) => {
    const firstName = ((mentorName || '').trim().split(/\s+/)[0] || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    return `${monthShortLower}-${firstName}`
  }

  const handleDownloadPayments = () => {
    const mentorsToInclude = downloadScope === 'selected_mentors'
      ? new Set(Array.from(selectedMentors))
      : new Set(cumulativePayments.map(m => m.mentorName))

    if (mentorsToInclude.size === 0) {
      alert(downloadScope === 'selected_mentors'
        ? 'No mentors selected. Select mentors first, or switch scope to All (filtered).'
        : 'No mentors found for the current filters.'
      )
      return
    }

    // Group filtered payments by mentor + monthKey
    const groups = new Map<string, { mentorName: string; monthKey: string; totalPayout: number }>()
    for (const p of filteredPayments) {
      if (!mentorsToInclude.has(p.mentorName)) continue
      if (!p.sessionDate) continue
      const date = new Date(p.sessionDate)
      if (isNaN(date.getTime())) continue
      const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
      const key = `${p.mentorName}__${monthKey}`
      const existing = groups.get(key)
      if (existing) {
        existing.totalPayout += (p.totalPayout || 0)
      } else {
        groups.set(key, { mentorName: p.mentorName, monthKey, totalPayout: (p.totalPayout || 0) })
      }
    }

    const rows = Array.from(groups.values())
      .sort((a, b) => {
        const byMentor = a.mentorName.localeCompare(b.mentorName)
        if (byMentor !== 0) return byMentor
        const da = new Date(a.monthKey).getTime()
        const db = new Date(b.monthKey).getTime()
        return isNaN(da) || isNaN(db) ? a.monthKey.localeCompare(b.monthKey) : da - db
      })
      .map(g => {
        const monthShort = getMonthShort(g.monthKey)
        const monthShortLower = monthShort.toLowerCase()
        const monthShortCap = monthShort.charAt(0).toUpperCase() + monthShort.slice(1).toLowerCase()

        const bd = bankingDetails.find(b =>
          b.mentorName.toLowerCase().trim() === g.mentorName.toLowerCase().trim()
        )

        const postTdsAmount = Number((g.totalPayout || 0) * (1 - TDS_RATE))

        return {
          TransferID: buildTransferId(monthShortLower, g.mentorName),
          'Bank Account Number': bd?.accountNumber || '',
          IFSC: bd?.ifsc || '',
          Name: bd?.accountHolderName || '',
          Email: bd?.email || '',
          'Phone Number A': bd?.phone || '',
          'Amount Post TDS': postTdsAmount,
          Remarks: `gradnext - ${monthShortCap}`,
          transferMode: 'neft'
        }
      })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        'TransferID',
        'Bank Account Number',
        'IFSC',
        'Name',
        'Email',
        'Phone Number A',
        'Amount Post TDS',
        'Remarks',
        'transferMode'
      ]
    })

    // Format Amount column as number with 2 decimals
    // Column index starts at 0; "Amount Post TDS" is 6 => column "G"
    for (let r = 2; r <= rows.length + 1; r++) {
      const cell = ws[`G${r}`]
      if (cell) {
        cell.t = 'n'
        cell.z = '0.00'
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'payments')

    const monthPart = (filterMonths.length > 0 ? filterMonths : getUniqueMonths())
      .map(m => getMonthShort(m).toLowerCase())
      .filter(Boolean)
      .join('-') || 'all'
    const datePart = new Date().toISOString().slice(0, 10)
    const fileName = `final-payments_${monthPart}_${datePart}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

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

        <div className="flex items-center space-x-2">
          <select
            value={downloadScope}
            onChange={(e) => setDownloadScope(e.target.value as 'all_filtered' | 'selected_mentors')}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="all_filtered">Download: All (filtered)</option>
            <option value="selected_mentors">Download: Selected mentors</option>
          </select>

          <Button
            onClick={handleDownloadPayments}
            variant="outline"
          >
            Download Payments
          </Button>

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
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
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
          <div className="text-sm text-gray-500">Total Payout (Pre-TDS)</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(cumulativePayments.reduce((sum, m) => sum + m.totalPayout, 0))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="text-sm text-gray-500">Total Payout (Post-TDS)</div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(cumulativePayments.reduce((sum, m) => sum + m.totalPayoutPostTDS, 0))}
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg" style={{ maxWidth: '100%' }}>
          <table className="min-w-full divide-y divide-gray-300" style={{ minWidth: '1200px', tableLayout: 'fixed' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={selectedMentors.size === cumulativePayments.length && cumulativePayments.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  Mentor
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Sessions
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Pre-TDS
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                  TDS (10%)
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Post-TDS
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                  Banking
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {cumulativePayments.map((mentorData) => (
                <>
                  <tr key={mentorData.mentorName} className="hover:bg-gray-50">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedMentors.has(mentorData.mentorName)}
                        onChange={(e) => handleSelectMentor(mentorData.mentorName, e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                        <div className="flex-shrink-0 h-6 w-6">
                          <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-3 w-3 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-2">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {mentorData.mentorName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {mentorData.paymentCount} payments
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                      {mentorData.totalSessions}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className={`text-sm font-medium ${mentorData.totalPayout < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(mentorData.totalPayout)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-red-600">
                        {mentorData.tdsAmount >= 0 ? `-${formatCurrency(mentorData.tdsAmount)}` : formatCurrency(mentorData.tdsAmount)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className={`text-sm font-bold ${mentorData.totalPayoutPostTDS >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(mentorData.totalPayoutPostTDS)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {mentorData.bankingDetails ? (
                        <div className="text-xs text-gray-600">
                          <div className="truncate" title={mentorData.bankingDetails.accountHolderName}>
                            {mentorData.bankingDetails.accountHolderName || 'N/A'}
                          </div>
                          <div className="truncate" title={mentorData.bankingDetails.accountNumber}>
                            {mentorData.bankingDetails.accountNumber || 'N/A'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-red-500">No details</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processing}
                        onClick={() => handleMarkIndividualMentorAsPaid(mentorData.mentorName)}
                        className="bg-green-600 text-white border-green-600 hover:bg-green-700 text-xs px-2 py-1"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Mark Paid
                      </Button>
                    </td>
                  </tr>
                  
                  {/* Expanded Details */}
                  {expandedMentors.has(mentorData.mentorName) && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          {/* Banking Details */}
                          {mentorData.bankingDetails && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Banking Details</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 rounded border">
                                <div>
                                  <span className="text-xs text-gray-500">Account Holder:</span>
                                  <div className="text-sm font-medium">{mentorData.bankingDetails.accountHolderName || 'N/A'}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">Account Number:</span>
                                  <div className="text-sm font-medium">{mentorData.bankingDetails.accountNumber || 'N/A'}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">IFSC Code:</span>
                                  <div className="text-sm font-medium">{mentorData.bankingDetails.ifsc || 'N/A'}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-500">UPI ID:</span>
                                  <div className="text-sm font-medium">{mentorData.bankingDetails.upiId || 'N/A'}</div>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Monthly Breakdown */}
                          {mentorData.monthlyBreakdown.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Monthly Breakdown</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {mentorData.monthlyBreakdown.map((month) => (
                                  <div key={month.month} className="bg-white p-3 rounded border">
                                    <div className="text-xs text-gray-500">{month.month}</div>
                                    <div className="text-sm font-medium">{month.sessions} sessions</div>
                                    <div className={`text-sm ${month.payout < 0 ? 'text-red-600' : 'text-gray-600'}`}>Pre-TDS: {formatCurrency(month.payout)}</div>
                                    <div className="text-sm text-red-600">TDS: {month.tdsAmount >= 0 ? `-${formatCurrency(month.tdsAmount)}` : formatCurrency(month.tdsAmount)}</div>
                                    <div className={`text-sm font-bold ${month.payoutPostTDS >= 0 ? 'text-green-600' : 'text-red-600'}`}>Post-TDS: {formatCurrency(month.payoutPostTDS)}</div>
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
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pre-TDS</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">TDS</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Post-TDS</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {mentorData.payments.map((payment) => {
                                    const isDeduction = payment.totalPayout < 0
                                    const paymentTDS = payment.totalPayout * TDS_RATE
                                    const paymentPostTDS = payment.totalPayout - paymentTDS
                                    return (
                                      <tr key={payment.sNo} className={isDeduction ? 'bg-red-50' : ''}>
                                        <td className="px-3 py-2 text-xs text-gray-900">{formatDate(payment.sessionDate)}</td>
                                        <td className="px-3 py-2 text-xs text-gray-900">
                                          {payment.menteeName}
                                          {isDeduction && (
                                            <span className="ml-1 px-1 py-0.5 text-xs bg-red-100 text-red-700 rounded">Deduction</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-900">{payment.noOfSessions}</td>
                                        <td className={`px-3 py-2 text-xs font-medium ${isDeduction ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(payment.totalPayout)}</td>
                                        <td className="px-3 py-2 text-xs font-medium text-red-600">
                                          {paymentTDS >= 0 ? `-${formatCurrency(paymentTDS)}` : formatCurrency(paymentTDS)}
                                        </td>
                                        <td className={`px-3 py-2 text-xs font-medium ${paymentPostTDS >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(paymentPostTDS)}</td>
                                      </tr>
                                    )
                                  })}
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
                <span className="text-sm text-gray-500">Pre-TDS Amount</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(mentorData.totalPayout)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">TDS (10%)</span>
                <span className="text-sm font-medium text-red-600">-{formatCurrency(mentorData.tdsAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">Post-TDS Amount</span>
                <span className="text-sm font-bold text-green-600">{formatCurrency(mentorData.totalPayoutPostTDS)}</span>
              </div>
            </div>
            
            {/* Banking Details for Mobile */}
            {mentorData.bankingDetails && (
              <div className="border-t pt-3 mb-3">
                <div className="text-xs text-gray-500 mb-1">Banking Details</div>
                <div className="text-xs text-gray-700">
                  <div>{mentorData.bankingDetails.accountHolderName || 'N/A'}</div>
                  <div>{mentorData.bankingDetails.accountNumber || 'N/A'}</div>
                  <div>{mentorData.bankingDetails.ifsc || 'N/A'}</div>
                </div>
              </div>
            )}
            
            {/* Expanded Details for Mobile */}
            {expandedMentors.has(mentorData.mentorName) && (
              <div className="border-t pt-3 space-y-3">
                {mentorData.monthlyBreakdown.map((month) => (
                  <div key={month.month} className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">{month.month}</div>
                    <div className="flex justify-between">
                      <span className="text-sm">{month.sessions} sessions</span>
                      <span className="text-sm font-bold text-green-600">{formatCurrency(month.payoutPostTDS)}</span>
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
