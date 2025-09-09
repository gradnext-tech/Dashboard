'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, Phone, Calendar, Clock, Search, Filter, Building2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface CorporateSessionRecord {
  id: string
  sNo: string
  mentorName: string
  mentorEmail: string
  menteeName: string // This will be the sheet name
  menteeEmail: string
  menteePhone: string
  date: string
  time: string
  inviteTitle: string
  invitationStatus: string
  mentorConfirmationStatus: string
  menteeConfirmationStatus: string
  sessionStatus: string
  mentorFeedback: string
  menteeFeedback: string
  paymentStatus: string
  rowIndex: number
  sheetName: string
}

interface CorporateSessionsTableProps {
  data: CorporateSessionRecord[]
  loading?: boolean
}

export function CorporateSessionsTable({ data, loading = false }: CorporateSessionsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSheet, setFilterSheet] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('')

  // Filter data based on search and filter criteria
  const filteredData = data.filter(session => {
    const matchesSearch = !searchTerm || 
      session.mentorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.menteeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.mentorEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.menteeEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.inviteTitle.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesSheet = !filterSheet || 
      session.sheetName.toLowerCase().includes(filterSheet.toLowerCase())
    
    const matchesStatus = !filterStatus || 
      session.sessionStatus.toLowerCase() === filterStatus.toLowerCase()
    
    const matchesPaymentStatus = !filterPaymentStatus || 
      session.paymentStatus.toLowerCase() === filterPaymentStatus.toLowerCase()
    
    return matchesSearch && matchesSheet && matchesStatus && matchesPaymentStatus
  })

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date'
    try {
      return format(new Date(dateString), 'MMM dd, yyyy')
    } catch {
      return dateString
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'cancelled':
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'pending':
      case 'scheduled':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'pending':
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800'
      case 'due':
        return 'bg-yellow-100 text-yellow-800'
      case 'pending':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const uniqueSheets = Array.from(new Set(data.map(s => s.sheetName)))
  const uniqueStatuses = Array.from(new Set(data.map(s => s.sessionStatus)))
  const uniquePaymentStatuses = Array.from(new Set(data.map(s => s.paymentStatus)))

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
          <Building2 className="w-12 h-12 text-blue-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No corporate sessions</h3>
        <p className="text-gray-500">No corporate session data available at the moment.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.length}</div>
            <p className="text-xs text-muted-foreground">
              Corporate sessions
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Companies</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSheets.length}</div>
            <p className="text-xs text-muted-foreground">
              Different companies
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.filter(s => s.sessionStatus.toLowerCase() === 'completed' || s.sessionStatus.toLowerCase() === 'done').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Sessions completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Payments</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.filter(s => s.paymentStatus.toLowerCase() === 'due').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Pending payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Controls */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Company Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterSheet}
              onChange={(e) => setFilterSheet(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Companies</option>
              {uniqueSheets.map(sheet => (
                <option key={sheet} value={sheet}>{sheet}</option>
              ))}
            </select>
          </div>
          
          {/* Session Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={filterPaymentStatus}
              onChange={(e) => setFilterPaymentStatus(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Payment Status</option>
              {uniquePaymentStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          
          {/* Clear Filters */}
          <button
            onClick={() => {
              setSearchTerm('')
              setFilterSheet('')
              setFilterStatus('')
              setFilterPaymentStatus('')
            }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  S No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mentor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invite Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Session Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feedback
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((session) => (
                <tr key={session.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {session.sNo}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {session.menteeName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {session.menteeEmail}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {session.mentorName}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center">
                      <Mail className="w-3 h-3 mr-1" />
                      {session.mentorEmail}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDate(session.date)}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {session.time}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {session.inviteTitle}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(session.sessionStatus)}
                      <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(session.sessionStatus)}`}>
                        {session.sessionStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(session.paymentStatus)}`}>
                      {session.paymentStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {session.mentorFeedback && (
                        <div className="mb-1">
                          <span className="font-medium">Mentor:</span> {session.mentorFeedback}
                        </div>
                      )}
                      {session.menteeFeedback && (
                        <div>
                          <span className="font-medium">Mentee:</span> {session.menteeFeedback}
                        </div>
                      )}
                      {!session.mentorFeedback && !session.menteeFeedback && (
                        <span className="text-gray-400">No feedback</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {filteredData.map((session) => (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div>
                    <CardTitle className="text-lg">{session.menteeName}</CardTitle>
                    <CardDescription>{session.mentorName}</CardDescription>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(session.sessionStatus)}`}>
                    {session.sessionStatus}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusColor(session.paymentStatus)}`}>
                    {session.paymentStatus}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Date & Time</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(session.date)} {session.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Invite Title</p>
                    <p className="text-sm font-medium text-gray-900">
                      {session.inviteTitle}
                    </p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Mentor Email</p>
                  <p className="text-sm text-gray-900 flex items-center">
                    <Mail className="w-3 h-3 mr-1" />
                    {session.mentorEmail}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Mentee Email</p>
                  <p className="text-sm text-gray-900 flex items-center">
                    <Mail className="w-3 h-3 mr-1" />
                    {session.menteeEmail}
                  </p>
                </div>

                {(session.mentorFeedback || session.menteeFeedback) && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2">Feedback</p>
                    {session.mentorFeedback && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-700">Mentor:</span>
                        <p className="text-sm text-gray-600">{session.mentorFeedback}</p>
                      </div>
                    )}
                    {session.menteeFeedback && (
                      <div>
                        <span className="text-sm font-medium text-gray-700">Mentee:</span>
                        <p className="text-sm text-gray-600">{session.menteeFeedback}</p>
                      </div>
                    )}
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
