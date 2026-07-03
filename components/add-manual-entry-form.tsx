'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, X } from 'lucide-react'

interface AddManualEntryFormProps {
  onAdd: (entry: {
    mentorName: string
    menteeName: string
    sessionDate: string
    sessionStatus: string
    rate: number
    paymentStatus: string
    noOfSessions: number
    totalPayout: number
  }) => Promise<void>
  onClose: () => void
  loading?: boolean
}

export function AddManualEntryForm({ onAdd, onClose, loading = false }: AddManualEntryFormProps) {
  const [formData, setFormData] = useState({
    mentorName: '',
    menteeName: '',
    sessionDate: '',
    sessionStatus: 'Completed',
    rate: 0 as number | string,
    paymentStatus: 'Due',
    noOfSessions: 1 as number | string,
    totalPayout: 0 as number | string
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleNumberChange = (field: string, value: string) => {
    // Allow empty string for better UX
    if (value === '') {
      setFormData(prev => ({ ...prev, [field]: '' }))
    } else {
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        setFormData(prev => ({ ...prev, [field]: numValue }))
      }
    }
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.mentorName.trim()) newErrors.mentorName = 'Mentor Name is required'
    if (!formData.menteeName.trim()) newErrors.menteeName = 'Mentee Name is required'
    if (!formData.sessionDate.trim()) newErrors.sessionDate = 'Session Date is required'
    if (!formData.sessionStatus.trim()) newErrors.sessionStatus = 'Session Status is required'
    if (formData.rate !== '' && typeof formData.rate === 'number' && formData.rate < 0) newErrors.rate = 'Rate must be non-negative'
    if (!formData.paymentStatus.trim()) newErrors.paymentStatus = 'Payment Status is required'
    if (formData.noOfSessions === '' || (typeof formData.noOfSessions === 'number' && formData.noOfSessions < 1)) newErrors.noOfSessions = 'No. of Sessions must be at least 1'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      // Convert empty strings to 0 for optional fields, keep required fields as numbers
      const submitData = {
        mentorName: formData.mentorName,
        menteeName: formData.menteeName,
        sessionDate: formData.sessionDate,
        sessionStatus: formData.sessionStatus,
        rate: formData.rate === '' ? 0 : (typeof formData.rate === 'number' ? formData.rate : parseFloat(formData.rate) || 0),
        paymentStatus: formData.paymentStatus,
        noOfSessions: formData.noOfSessions === '' ? 1 : (typeof formData.noOfSessions === 'number' ? formData.noOfSessions : parseInt(formData.noOfSessions) || 1),
        totalPayout: formData.totalPayout === '' ? 0 : (typeof formData.totalPayout === 'number' ? formData.totalPayout : parseFloat(formData.totalPayout) || 0)
      }

      await onAdd(submitData)
      // Reset form after successful submission
      setFormData({
        mentorName: '',
        menteeName: '',
        sessionDate: '',
        sessionStatus: 'Completed',
        rate: 0,
        paymentStatus: 'Due',
        noOfSessions: 1,
        totalPayout: 0
      })
      setErrors({})
    } catch (error) {
      console.error('Error adding manual entry:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Add Manual Entry</CardTitle>
              <CardDescription>
                Add a new entry to the Mentor Commission sheet
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mentor Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mentor Name *
                </label>
                <input
                  type="text"
                  value={formData.mentorName}
                  onChange={(e) => handleInputChange('mentorName', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.mentorName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="Enter Mentor Name"
                />
                {errors.mentorName && <p className="text-red-500 text-xs mt-1">{errors.mentorName}</p>}
              </div>

              {/* Mentee Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mentee Name *
                </label>
                <input
                  type="text"
                  value={formData.menteeName}
                  onChange={(e) => handleInputChange('menteeName', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.menteeName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="Enter Mentee Name"
                />
                {errors.menteeName && <p className="text-red-500 text-xs mt-1">{errors.menteeName}</p>}
              </div>

              {/* Session Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Date *
                </label>
                <input
                  type="text"
                  value={formData.sessionDate}
                  onChange={(e) => handleInputChange('sessionDate', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.sessionDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="e.g., Monday, September 9, 2025"
                />
                {errors.sessionDate && <p className="text-red-500 text-xs mt-1">{errors.sessionDate}</p>}
              </div>

              {/* Session Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Status *
                </label>
                <select
                  value={formData.sessionStatus}
                  onChange={(e) => handleInputChange('sessionStatus', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.sessionStatus ? 'border-red-500' : 'border-gray-300'
                    }`}
                >
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
                {errors.sessionStatus && <p className="text-red-500 text-xs mt-1">{errors.sessionStatus}</p>}
              </div>

              {/* Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rate
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.rate}
                  onChange={(e) => handleNumberChange('rate', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.rate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="0.00"
                />
                {errors.rate && <p className="text-red-500 text-xs mt-1">{errors.rate}</p>}
              </div>

              {/* Payment Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Status *
                </label>
                <select
                  value={formData.paymentStatus}
                  onChange={(e) => handleInputChange('paymentStatus', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.paymentStatus ? 'border-red-500' : 'border-gray-300'
                    }`}
                >
                  <option value="Due">Due</option>
                  <option value="Paid">Paid</option>
                </select>
                {errors.paymentStatus && <p className="text-red-500 text-xs mt-1">{errors.paymentStatus}</p>}
              </div>

              {/* No. of Sessions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. of Sessions *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.noOfSessions}
                  onChange={(e) => handleNumberChange('noOfSessions', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.noOfSessions ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="1"
                />
                {errors.noOfSessions && <p className="text-red-500 text-xs mt-1">{errors.noOfSessions}</p>}
              </div>

              {/* Total Payout */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Payout
                  <span className="ml-1 text-xs text-gray-400 font-normal">(negative = deduction)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.totalPayout}
                  onChange={(e) => handleNumberChange('totalPayout', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.totalPayout ? 'border-red-500' : 'border-gray-300'
                    }`}
                  placeholder="0.00"
                />
                {errors.totalPayout && <p className="text-red-500 text-xs mt-1">{errors.totalPayout}</p>}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                {loading ? 'Adding...' : 'Add Entry'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
