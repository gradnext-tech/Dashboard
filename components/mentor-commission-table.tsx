'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Mail, DollarSign, Calendar, Search, Filter, TrendingUp, Check, Download } from 'lucide-react'

interface MentorCommissionData {
  mentorName: string
  mentorEmail: string
  totalPayout: number
  sessions: number
  monthlyBreakdown: Array<{ month: string; payout: number; sessions: number }>
}

interface MentorCommissionTableProps {
  data: MentorCommissionData[]
  loading?: boolean
  onMarkMentorPaid?: (mentorNames: string[]) => Promise<void>
  onExportToMentorCommission?: () => Promise<void>
}

export function MentorCommissionTable({ data, loading = false, onMarkMentorPaid, onExportToMentorCommission }: MentorCommissionTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'payout' | 'sessions'>('payout')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterMonth, setFilterMonth] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Get unique months from mentor commission data for filter dropdown
  const getUniqueMonths = useMemo(() => {
    const months = new Set<string>()
    data.forEach(mentor => {
      mentor.monthlyBreakdown.forEach(monthData => {
        if (monthData.month && monthData.month !== 'Unknown Month') {
          months.add(monthData.month)
        }
      })
    })
    return Array.from(months).sort()
  }, [data])

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => data
    .filter(mentor => {
      const matchesSearch = mentor.mentorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mentor.mentorEmail.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesMonth = !filterMonth || mentor.monthlyBreakdown.some(monthData => 
        monthData.month === filterMonth
      )
      
      return matchesSearch && matchesMonth
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.mentorName.localeCompare(b.mentorName)
          break
        case 'payout':
          comparison = a.totalPayout - b.totalPayout
          break
        case 'sessions':
          comparison = a.sessions - b.sessions
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    }), [data, searchTerm, filterMonth, sortBy, sortOrder])

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredAndSortedData.map(m => m.mentorName)))
    } else {
      setSelected(new Set())
    }
  }

  const toggleOne = (mentorName: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(mentorName)
    else next.delete(mentorName)
    setSelected(next)
  }

  const handleBulkMarkPaid = async () => {
    if (!onMarkMentorPaid) return
    try {
      setProcessing(true)
      await onMarkMentorPaid(Array.from(selected))
      setSelected(new Set())
    } finally {
      setProcessing(false)
    }
  }

  const handleRowMarkPaid = async (mentorName: string) => {
    if (!onMarkMentorPaid) return
    try {
      setProcessing(true)
      await onMarkMentorPaid([mentorName])
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(mentorName)
        return next
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleExportToMentorCommission = async () => {
    if (!onExportToMentorCommission) return
    try {
      setExporting(true)
      await onExportToMentorCommission()
    } finally {
      setExporting(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  // Helper function to get display values based on month filter
  const getDisplayValues = (mentor: MentorCommissionData) => {
    if (filterMonth) {
      const monthData = mentor.monthlyBreakdown.find(m => m.month === filterMonth)
      return {
        payout: monthData?.payout || 0,
        sessions: monthData?.sessions || 0
      }
    }
    return {
      payout: mentor.totalPayout,
      sessions: mentor.sessions
    }
  }

  // Calculate totals based on filtered data and month filter
  const { totalCommission, totalSessions } = useMemo(() => {
    return filteredAndSortedData.reduce((acc, mentor) => {
      if (filterMonth) {
        // If month filter is applied, only count data for that specific month
        const monthData = mentor.monthlyBreakdown.find(m => m.month === filterMonth)
        if (monthData) {
          acc.totalCommission += monthData.payout
          acc.totalSessions += monthData.sessions
        }
      } else {
        // If no month filter, use total payout and sessions
        acc.totalCommission += mentor.totalPayout
        acc.totalSessions += mentor.sessions
      }
      return acc
    }, { totalCommission: 0, totalSessions: 0 })
  }, [filteredAndSortedData, filterMonth])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <TrendingUp className="w-12 h-12 text-blue-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No commission data</h3>
        <p className="text-gray-500">No mentor commission data available at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCommission)}</div>
            <p className="text-xs text-muted-foreground">
              Across {filteredAndSortedData.length} mentors{filterMonth ? ` (${filterMonth})` : ''}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSessions}</div>
            <p className="text-xs text-muted-foreground">
              Sessions completed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average per Mentor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredAndSortedData.length > 0 ? totalCommission / filteredAndSortedData.length : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Commission per mentor{filterMonth ? ` (${filterMonth})` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Sort Controls */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by mentor name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Sort By */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'payout' | 'sessions')}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="payout">Sort by Commission</option>
              <option value="name">Sort by Name</option>
              <option value="sessions">Sort by Sessions</option>
            </select>
          </div>
          
          {/* Sort Order */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="desc">High to Low</option>
              <option value="asc">Low to High</option>
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
              {getUniqueMonths.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selected.size} mentor{selected.size === 1 ? '' : 's'} selected
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={handleExportToMentorCommission}
              disabled={exporting || !onExportToMentorCommission}
              variant="outline"
              className="bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
            >
              <Download className={`w-4 h-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
              {exporting ? 'Exporting...' : 'Export to Mentor Commission'}
            </Button>
            {onMarkMentorPaid && (
              <Button
                onClick={handleBulkMarkPaid}
                disabled={processing || selected.size === 0}
                variant="outline"
                className="bg-green-600 text-white border-green-600 hover:bg-green-700"
              >
                <Check className={`w-4 h-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
                {processing ? 'Marking...' : 'Mark Selected as Paid'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all mentors"
                    checked={selected.size > 0 && filteredAndSortedData.every(m => selected.has(m.mentorName))}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Commission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg per Session
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedData.map((mentor, index) => {
                const displayValues = getDisplayValues(mentor)
                return (
                  <tr key={`${mentor.mentorName}-${mentor.mentorEmail}`} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selected.has(mentor.mentorName)}
                        onChange={(e) => toggleOne(mentor.mentorName, e.target.checked)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            {mentor.mentorName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-gray-400" />
                        {mentor.mentorEmail || 'No email'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">
                        {formatCurrency(displayValues.payout)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {displayValues.sessions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(displayValues.sessions > 0 ? displayValues.payout / displayValues.sessions : 0)}
                      </div>
                    </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exporting || !onExportToMentorCommission}
                        onClick={handleExportToMentorCommission}
                        className="bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                      {onMarkMentorPaid && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={processing}
                          onClick={() => handleRowMarkPaid(mentor.mentorName)}
                          className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredAndSortedData.map((mentor) => {
          const displayValues = getDisplayValues(mentor)
          return (
            <Card key={`${mentor.mentorName}-${mentor.mentorEmail}`}>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{mentor.mentorName}</CardTitle>
                    <CardDescription className="flex items-center">
                      <Mail className="w-4 h-4 mr-1" />
                      {mentor.mentorEmail || 'No email'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">{filterMonth ? `Commission (${filterMonth})` : 'Total Commission'}</p>
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(displayValues.payout)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{filterMonth ? `Sessions (${filterMonth})` : 'Sessions'}</p>
                      <p className="text-lg font-bold text-gray-900">{displayValues.sessions}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Average per Session</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(displayValues.sessions > 0 ? displayValues.payout / displayValues.sessions : 0)}
                    </p>
                  </div>

                <div className="pt-2 space-y-2">
                  {onExportToMentorCommission && (
                    <Button
                      size="sm"
                      disabled={exporting}
                      onClick={handleExportToMentorCommission}
                      className="w-full bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export to Mentor Commission
                    </Button>
                  )}
                  {onMarkMentorPaid && (
                    <Button
                      size="sm"
                      disabled={processing}
                      onClick={() => handleRowMarkPaid(mentor.mentorName)}
                      className="w-full bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark as Paid
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>
    </div>
  )
}
