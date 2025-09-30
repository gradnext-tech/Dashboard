'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  label: string
  value: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  maxDisplay?: number
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options...",
  className,
  maxDisplay = 2
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleToggle = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue]
    onChange(newValue)
  }

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter(v => v !== optionValue))
  }

  const getDisplayText = () => {
    if (value.length === 0) return placeholder
    if (value.length <= maxDisplay) {
      return value.map(v => options.find(opt => opt.value === v)?.label).join(', ')
    }
    return `${value.length} selected`
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer bg-white flex items-center justify-between min-h-[40px]"
      >
        <div className="flex-1 flex items-center gap-1 flex-wrap">
          {value.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : value.length <= maxDisplay ? (
            value.map(v => {
              const option = options.find(opt => opt.value === v)
              return option ? (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                >
                  {option.label}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-blue-600"
                    onClick={(e) => handleRemove(v, e)}
                  />
                </span>
              ) : null
            })
          ) : (
            <span className="text-gray-700">{value.length} selected</span>
          )}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isOpen && "rotate-180")} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
            ) : (
              filteredOptions.map(option => (
                <div
                  key={option.value}
                  onClick={() => handleToggle(option.value)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <div className={cn(
                    "w-4 h-4 border border-gray-300 rounded flex items-center justify-center",
                    value.includes(option.value) && "bg-blue-500 border-blue-500"
                  )}>
                    {value.includes(option.value) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <span className="text-sm">{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}