import React, { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { X, Plus } from 'lucide-react'
import { Input } from '@rois/ui'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  testId?: string
}

export const TagInput = ({ tags, onChange, placeholder = 'Add…', disabled = false, testId }: TagInputProps): ReactNode => {
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputVisible) {
      inputRef.current?.focus()
    }
  }, [inputVisible])

  const addTag = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInputValue('')
    setInputVisible(false)
  }

  const removeTag = (tag: string): void => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={testId}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-2xs font-medium text-accent-foreground"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => removeTag(tag)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        inputVisible ? (
          <Input
            ref={inputRef}
            data-testid={testId ? `${testId}-input` : undefined}
            className="h-5 w-24 px-1 text-xs"
            value={inputValue}
            placeholder={placeholder}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(inputValue) }
              if (e.key === 'Escape') { setInputVisible(false); setInputValue('') }
            }}
            onBlur={() => {
              if (inputValue.trim()) {
                addTag(inputValue)
              } else {
                setInputValue('')
                setInputVisible(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            aria-label="Add tag"
            data-testid={testId ? `${testId}-add` : undefined}
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-2xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            onClick={() => setInputVisible(true)}
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
        )
      )}
    </div>
  )
}
