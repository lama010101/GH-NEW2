'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { investorContent } from '@/lib/investorContent'

export default function Section01Hook() {
  const section = investorContent.sections[0]
  const sectionRef = useRef<HTMLElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  const imageY = useTransform(scrollYProgress, [0, 1], ['0%', shouldReduceMotion ? '0%' : '18%'])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const chevronOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-section-id={section.id}
      data-section-index={section.number - 1}
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4"
    >
      {section.visual.src && (
        <motion.div className="absolute inset-0 z-0" style={{ y: imageY }}>
          <Image
            src={section.visual.src}
            alt={section.visual.alt ?? ''}
            fill
            priority
            sizes="100vw"
            className="scale-110 object-cover"
          />
          <div className="absolute inset-0 bg-black/50" />
        </motion.div>
      )}

      <motion.div
        style={{ opacity: contentOpacity }}
        className="relative z-10 flex max-w-4xl flex-col items-center gap-6 text-center"
      >
        <motion.h1
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl font-light leading-tight text-[var(--gh-text-primary)] md:text-6xl lg:text-7xl"
        >
          {section.headline}
        </motion.h1>
        {section.body.map((paragraph, index) => (
          <motion.p
            key={paragraph}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl text-lg text-[var(--gh-text-secondary)] md:text-xl"
          >
            {paragraph}
          </motion.p>
        ))}
        {section.statements?.map((statement, index) => (
          <motion.p
            key={statement}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-medium text-[var(--gh-gold)] md:text-3xl"
          >
            {statement}
          </motion.p>
        ))}
      </motion.div>

      <motion.a
        href={`#${investorContent.sections[1].id}`}
        aria-label="Scroll to next section"
        style={{ opacity: chevronOpacity }}
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-[var(--gh-text-secondary)] transition-colors hover:text-[var(--gh-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gh-orange)]"
      >
        <span className="text-xs font-medium uppercase tracking-widest">Scroll</span>
        <motion.svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={shouldReduceMotion ? undefined : { y: [0, 6, 0] }}
          transition={shouldReduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </motion.a>
    </section>
  )
}
