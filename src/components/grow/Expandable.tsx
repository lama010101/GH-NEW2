'use client'

import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'

interface ExpandableProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  isOpen?: boolean
  onToggle?: () => void
  id?: string
  className?: string
  titleClassName?: string
}

export default function Expandable({
  title,
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  id,
  className,
  titleClassName,
}: ExpandableProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = controlledIsOpen ?? internalOpen
  const toggle = () => {
    if (onToggle) {
      onToggle()
    } else {
      setInternalOpen((prev) => !prev)
    }
  }

  const shouldReduceMotion = useReducedMotion() ?? false
  const baseId = useId()
  const panelId = id ?? `${baseId}-panel`
  const buttonId = `${panelId}-btn`

  return (
    <div className={clsx('rounded-lg', className)}>
      <button
        id={buttonId}
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={clsx(
          'w-full text-left font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-accent)]',
          titleClassName,
        )}
      >
        {title}
      </button>
      {shouldReduceMotion ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          hidden={!isOpen}
          className="text-[var(--gh-text-secondary)]"
        >
          {children}
        </div>
      ) : (
        <motion.div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          aria-hidden={!isOpen}
          initial={false}
          animate={{
            height: isOpen ? 'auto' : 0,
            opacity: isOpen ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{ overflow: 'hidden' }}
          className="text-[var(--gh-text-secondary)]"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}
