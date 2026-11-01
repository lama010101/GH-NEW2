'use client'

import { useGrowSection } from './GrowSectionContext'
import GrowSlide from './GrowSlide'
import StatusBadge from './StatusBadge'

export default function Section04HumanVsAI() {
  const { content } = useGrowSection()
  const section = content.sections[3]

  return (
    <GrowSlide
      id={section.id}
      index={section.number - 1}
      kicker={section.kicker}
      headline={section.headline}
      accent="blue"
      finalStatement={section.finalStatement}
    >
      {section.body.map((paragraph) => (
        <p key={paragraph} className="max-w-2xl text-base text-[var(--gh-text-secondary)] md:text-lg">
          {paragraph}
        </p>
      ))}

      {section.status && (
        <StatusBadge status={section.status} label={section.statusLabel} />
      )}

      {section.rows && (
        <div className="w-full max-w-3xl overflow-hidden rounded-[var(--gh-radius-md)] border border-[var(--gh-border-default)] bg-[var(--gh-bg-surface)] px-4 py-1">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--gh-border-default)]">
                <th scope="col" className="py-2 pr-2">
                  <span className="sr-only">{section.kicker}</span>
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 font-sora text-[0.625rem] font-bold uppercase tracking-[0.2em] grow-accent md:text-xs"
                >
                  {section.columnLabels?.human}
                </th>
                <th
                  scope="col"
                  className="px-2 py-2 font-sora text-[0.625rem] font-bold uppercase tracking-[0.2em] text-[color:var(--gh-blue)] md:text-xs"
                >
                  {section.columnLabels?.model}
                </th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label} className="border-b border-[var(--gh-border-subtle)] last:border-0">
                  <th
                    scope="row"
                    className="py-2 pr-2 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-[var(--gh-text-muted)] md:text-[0.625rem]"
                  >
                    {row.label}
                  </th>
                  <td className="px-2 py-2 text-xs text-[var(--gh-text-primary)] md:text-sm">
                    {row.human}
                  </td>
                  <td className="px-2 py-2 text-xs text-[var(--gh-text-secondary)] md:text-sm">
                    {row.model}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GrowSlide>
  )
}
