'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Mail, DollarSign, Calendar, Search, Filter, TrendingUp, Check } from 'lucide-react'

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
}

export function MentorCommissionTable({ data, loading = false, onMarkMentorPaid }: MentorCommissionTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'payout' | 'sessions'>('payout')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => data
    .filter(mentor => 
      mentor.mentorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mentor.mentorEmail.toLowerCase().includes(searchTerm.toLowerCase())
    )
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
    }), [data, searchTerm, sortBy, sortOrder])

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount)
  }

  const totalCommission = data.reduce((sum, mentor) => sum + mentor.totalPayout, 0)
  const totalSessions = data.reduce((sum, mentor) => sum + mentor.sessions, 0)

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
              Across {data.length} mentors
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
              {formatCurrency(data.length > 0 ? totalCommission / data.length : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Commission per mentor
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Sort Controls */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              {filteredAndSortedData.map((mentor, index) => (
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
                      {formatCurrency(mentor.totalPayout)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {mentor.sessions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatCurrency(mentor.sessions > 0 ? mentor.totalPayout / mentor.sessions : 0)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={processing || !onMarkMentorPaid}
                      onClick={() => handleRowMarkPaid(mentor.mentorName)}
                      className="bg-green-600 text-white border-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark Paid
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-gray-600">
            {selected.size} mentor{selected.size === 1 ? '' : 's'} selected
          </div>
          <Button
            onClick={handleBulkMarkPaid}
            disabled={processing || selected.size === 0 || !onMarkMentorPaid}
            variant="outline"
            className="bg-green-600 text-white border-green-600 hover:bg-green-700"
          >
            <Check className={`w-4 h-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
            {processing ? 'Marking...' : 'Mark Selected as Paid'}
          </Button>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filteredAndSortedData.map((mentor) => (
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
                    <p className="text-sm text-gray-500">Total Commission</p>
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(mentor.totalPayout)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Sessions</p>
                    <p className="text-lg font-bold text-gray-900">{mentor.sessions}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Average per Session</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCurrency(mentor.sessions > 0 ? mentor.totalPayout / mentor.sessions : 0)}
                  </p>
                </div>

                {onMarkMentorPaid && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      disabled={processing}
                      onClick={() => handleRowMarkPaid(mentor.mentorName)}
                      className="w-full bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark as Paid
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
