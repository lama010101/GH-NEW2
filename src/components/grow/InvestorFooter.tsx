'use client'

import Link from 'next/link'
import { investorContent } from '@/lib/investorContent'

export default function InvestorFooter() {
  const { links, disclaimer } = investorContent.footer

  return (
    <footer className="border-t border-[var(--gh-border-default)] bg-[var(--gh-bg-base)] px-4 py-12 text-sm text-[var(--gh-text-secondary)] md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Investor footer">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="transition-colors hover:text-[var(--gh-text-primary)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p id="disclaimer" className="max-w-4xl text-xs leading-relaxed text-[var(--gh-text-muted)]">
          {disclaimer}
        </p>
      </div>
    </footer>
  )
}
