'use client'

import { type ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

type Tag = 'div' | 'section' | 'ul' | 'ol' | 'dl' | 'li'

type RevealOnScrollProps = {
  children: ReactNode
  className?: string
  as?: Tag
  delay?: number
  y?: number
  amount?: number
  once?: boolean
}

const MotionByTag = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  ol: motion.ol,
  dl: motion.dl,
  li: motion.li,
} as const

/**
 * Fade+slide-up reveal triggered when the element scrolls into view.
 * Respects prefers-reduced-motion by rendering the content statically.
 */
export function RevealOnScroll({
  children,
  className,
  as = 'div',
  delay = 0,
  y = 24,
  amount = 0.3,
  once = true,
}: RevealOnScrollProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    const Static = as
    return <Static className={className}>{children}</Static>
  }

  const MotionTag = MotionByTag[as]

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  )
}

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
}

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

type StaggerGroupProps = {
  children: ReactNode
  className?: string
  as?: Tag
  amount?: number
  once?: boolean
}

/**
 * Container that staggers the entrance of its StaggerItem children as it
 * scrolls into view. Use for lists of stats, cards, steps, etc.
 */
export function StaggerGroup({
  children,
  className,
  as = 'div',
  amount = 0.2,
  once = true,
}: StaggerGroupProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    const Static = as
    return <Static className={className}>{children}</Static>
  }

  const MotionTag = MotionByTag[as]

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={staggerContainerVariants}
    >
      {children}
    </MotionTag>
  )
}

type StaggerItemProps = {
  children: ReactNode
  className?: string
  as?: Tag
}

export function StaggerItem({ children, className, as = 'div' }: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    const Static = as
    return <Static className={className}>{children}</Static>
  }

  const MotionTag = MotionByTag[as]

  return (
    <MotionTag className={className} variants={staggerItemVariants}>
      {children}
    </MotionTag>
  )
}
