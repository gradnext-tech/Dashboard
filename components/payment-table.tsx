'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PaymentRecord } from '@/lib/google-sheets'
import { Check, Calendar, DollarSign, User, Mail, Search, Filter, Building2 } from 'lucide-react'
import { format } from 'date-fns'

interface PaymentTableProps {
  payments: PaymentRecord[]
  onMarkAsPaid?: (paymentIds: string[]) => Promise<void>
  loading?: boolean
  actionButtonText?: string
  showMarkAsPaidActions?: boolean
  showSelection?: boolean
}

export function PaymentTable({ payments, onMarkAsPaid, loading = false, actionButtonText = "Mark as Paid", showMarkAsPaidActions = true, showSelection = true }: PaymentTableProps) {
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMentor, setFilterMentor] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  // Get unique months from payments for filter dropdown
  const getUniqueMonths = () => {
    const months = new Set<string>()
    payments.forEach(payment => {
      if (payment.sessionDate) {
        try {
          const date = new Date(payment.sessionDate)
          if (!isNaN(date.getTime())) {
            const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
            months.add(monthKey)
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    })
    return Array.from(months).sort()
  }

  // Filter payments based on search and filter criteria
  const filteredPayments = payments.filter(payment => {
    const isCorporate = payment.id.startsWith('corporate_')
    
    const matchesSearch = !searchTerm || 
      payment.mentorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.menteeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.sheetName && payment.sheetName.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesMentor = !filterMentor || 
      payment.mentorName.toLowerCase().includes(filterMentor.toLowerCase())
    
    const matchesStatus = !filterStatus || 
      payment.paymentStatus.toLowerCase() === filterStatus.toLowerCase()
    
    const matchesType = !filterType || 
      (filterType === 'corporate' && isCorporate) ||
      (filterType === 'regular' && !isCorporate)
    
    const matchesMonth = !filterMonth || (() => {
      if (!payment.sessionDate) return false
      try {
        const date = new Date(payment.sessionDate)
        if (isNaN(date.getTime())) return false
        const monthKey = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
        return monthKey === filterMonth
      } catch (e) {
        return false
      }
    })()
    
    return matchesSearch && matchesMentor && matchesStatus && matchesType && matchesMonth
  })

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPayments(new Set(filteredPayments.map(p => p.id)))
    } else {
      setSelectedPayments(new Set())
    }
  }

  const handleSelectPayment = (paymentId: string, checked: boolean) => {
    const newSelected = new Set(selectedPayments)
    if (checked) {
      newSelected.add(paymentId)
    } else {
      newSelected.delete(paymentId)
    }
    setSelectedPayments(newSelected)
  }

  const handleMarkSelectedAsPaid = async () => {
    if (selectedPayments.size === 0 || !onMarkAsPaid) return
    
    setProcessing(true)
    try {
      await onMarkAsPaid(Array.from(selectedPayments))
      setSelectedPayments(new Set())
    } catch (error) {
      console.error('Error marking payments as paid:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleMarkIndividualAsPaid = async (paymentId: string) => {
    if (!onMarkAsPaid) return
    
    setProcessing(true)
    try {
      await onMarkAsPaid([paymentId])
      // Remove from selected if it was selected
      setSelectedPayments(prev => {
        const next = new Set(prev)
        next.delete(paymentId)
        return next
      })
    } catch (error) {
      console.error('Error marking payment as paid:', error)
    } finally {
      setProcessing(false)
    }
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

  if (payments.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <Check className="w-12 h-12 text-green-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
        <p className="text-gray-500">No pending payments at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by mentor, mentee, company, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Mentor Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterMentor}
              onChange={(e) => setFilterMentor(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Mentors</option>
              {Array.from(new Set(payments.map(p => p.mentorName))).map(mentor => (
                <option key={mentor} value={mentor}>{mentor}</option>
              ))}
            </select>
          </div>
          
          {/* Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              <option value="regular">Regular Sessions</option>
              <option value="corporate">Corporate Sessions</option>
            </select>
          </div>
          
          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="due">Due</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {/* Month Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Months</option>
              {getUniqueMonths().map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
          
          {/* Clear Filters */}
          <Button
            onClick={() => {
              setSearchTerm('')
              setFilterMentor('')
              setFilterStatus('')
              setFilterType('')
              setFilterMonth('')
            }}
            variant="outline"
            className="w-full"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Actions Bar */}
      {showSelection && (
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedPayments.size === filteredPayments.length && filteredPayments.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-600">
              {selectedPayments.size > 0 
                ? `${selectedPayments.size} selected`
                : `Select all (${filteredPayments.length} items)`
              }
            </span>
          </div>
          
          {selectedPayments.size > 0 && showMarkAsPaidActions && onMarkAsPaid && (
            <Button
              onClick={handleMarkSelectedAsPaid}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              {actionButtonText} ({selectedPayments.size})
            </Button>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                {showSelection && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedPayments.size === filteredPayments.length && filteredPayments.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  S No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Session Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Payout
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {showMarkAsPaidActions && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.map((payment) => {
                const isCorporate = payment.id.startsWith('corporate_')
                return (
                  <tr key={payment.id} className={`hover:bg-gray-50 ${isCorporate ? 'bg-blue-50' : ''}`}>
                    {showSelection && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedPayments.has(payment.id)}
                          onChange={(e) => handleSelectPayment(payment.id, e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.sNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {payment.mentorName}
                        </div>
                        {isCorporate && (
                          <Building2 className="ml-2 w-4 h-4 text-blue-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {isCorporate && payment.sheetName ? (
                          <div>
                            <div className="font-semibold text-blue-700">{payment.sheetName}</div>
                            <div className="text-xs text-gray-500">{payment.menteeName}</div>
                          </div>
                        ) : (
                          payment.menteeName
                        )}
                      </div>
                    </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(payment.sessionDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(payment.rate)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {payment.noOfSessions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(payment.totalPayout)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      {payment.paymentStatus ? 
                        payment.paymentStatus.charAt(0).toUpperCase() + payment.paymentStatus.slice(1).toLowerCase() 
                        : 'Due'
                      }
                    </span>
                  </td>
                  {showMarkAsPaidActions && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={processing || !onMarkAsPaid}
                        onClick={() => handleMarkIndividualAsPaid(payment.id)}
                        className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {actionButtonText}
                      </Button>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredPayments.map((payment) => {
          const isCorporate = payment.id.startsWith('corporate_')
          return (
            <div key={payment.id} className={`bg-white rounded-lg shadow p-4 border ${isCorporate ? 'border-blue-200 bg-blue-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  {showSelection && (
                    <input
                      type="checkbox"
                      checked={selectedPayments.has(payment.id)}
                      onChange={(e) => handleSelectPayment(payment.id, e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  )}
                  <div className="flex-shrink-0 h-8 w-8">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isCorporate ? 'bg-blue-100' : 'bg-primary'}`}>
                      {isCorporate ? (
                        <Building2 className="h-4 w-4 text-blue-600" />
                      ) : (
                        <User className="h-4 w-4 text-white" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 flex items-center">
                      {payment.mentorName}
                      {isCorporate && (
                        <Building2 className="ml-1 w-3 h-3 text-blue-600" />
                      )}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {isCorporate && payment.sheetName ? (
                        <div>
                          <div className="text-blue-600 font-medium">{payment.sheetName}</div>
                          <div>Mentee: {payment.menteeName}</div>
                        </div>
                      ) : (
                        `Mentee: ${payment.menteeName}`
                      )}
                    </p>
                  </div>
                </div>
              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                {payment.paymentStatus ? 
                  payment.paymentStatus.charAt(0).toUpperCase() + payment.paymentStatus.slice(1).toLowerCase() 
                  : 'Due'
                }
              </span>
            </div>
            
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  Session Date
                </span>
                <span className="text-sm text-gray-900">
                  {formatDate(payment.sessionDate)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 flex items-center">
                  <DollarSign className="w-4 h-4 mr-1" />
                  Rate
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(payment.rate)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Sessions
                </span>
                <span className="text-sm text-gray-900">
                  {payment.noOfSessions}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">
                  Total Payout
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {formatCurrency(payment.totalPayout)}
                </span>
              </div>
            </div>
            
            {/* Individual Action Button */}
            {showMarkAsPaidActions && onMarkAsPaid && (
              <div className="pt-3 border-t border-gray-200">
                <Button
                  size="sm"
                  disabled={processing}
                  onClick={() => handleMarkIndividualAsPaid(payment.id)}
                  className="w-full bg-green-600 text-white hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  {actionButtonText}
                </Button>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
