export type SectionStatus = 'verified' | 'illustrative' | 'roadmap' | 'conceptual'

export type InvestorSection = {
  id: string
  number: number
  kicker: string
  headline: string
  subheadline?: string
  body: string[]
  statements?: string[]
  stats?: { value: string; label: string }[]
  rows?: { label: string; human: string; model: string }[]
  columnLabels?: { human: string; model: string }
  businesses?: { title: string; description: string }[]
  chart?: { labels: string[]; values: number[]; caption: string }
  baseline?: string
  scrollHint?: string
  visual: {
    type: string
    src?: string
    alt?: string
    steps?: string[]
    items?: { label: string; value?: string; status?: SectionStatus }[]
    metrics?: { label: string; value: string; status?: SectionStatus }[]
    stack?: string[]
    nodes?: { label: string; description?: string }[]
    branches?: { root: string; children: string[] }
    flow?: string[]
    cta?: 'register' | 'play' | 'test'
  }
  status?: SectionStatus
  statusLabel?: string
  ctas?: ('register' | 'play' | 'test')[]
  finalStatement?: string
}

export type InvestorCTA = {
  id: 'register' | 'play' | 'test'
  label: string
  href: string
  variant: 'primary' | 'secondary'
}

export type InvestorFooter = {
  links: { label: string; href: string }[]
  disclaimer: string
}

export type InvestorContent = {
  title: string
  progressLabel: string
  sections: InvestorSection[]
  ctas: InvestorCTA[]
  footer: InvestorFooter
}

/** Minimal translator surface used by the builder (next-intl `t`). */
type DeckTranslator = {
  (key: string): string
  raw: (key: string) => unknown
}

type LV = { label: string; value?: string }
type LVN = { label: string; description?: string }
type LVV = { value: string; label: string }
type Row = { label: string; human: string; model: string }
type Business = { title: string; description: string }
type Chart = { labels: string[]; values: number[]; caption: string }

const asStrings = (v: unknown) => v as string[]
const asLVN = (v: unknown) => v as LVN[]
const asLVV = (v: unknown) => v as LVV[]
const asRows = (v: unknown) => v as Row[]
const asBusinesses = (v: unknown) => v as Business[]
const asChart = (v: unknown) => v as Chart
const illustrative = <T extends LV>(v: unknown): (T & { status: SectionStatus })[] =>
  (v as T[]).map((i) => ({ ...i, status: 'illustrative' as const }))

/**
 * All user-facing deck copy lives in the `grow_deck` message namespace
 * (src/i18n/<locale>.json). This builder merges that copy with the
 * non-textual section spec (ids, media, status enums, links).
 */
export function getInvestorContent(t: DeckTranslator): InvestorContent {
  return {
    title: t('title'),
    progressLabel: t('progress_label'),

    ctas: [
      {
        id: 'register',
        label: t('cta_register'),
        href: '/waitlist',
        variant: 'primary',
      },
      {
        id: 'play',
        label: t('cta_play'),
        href: '/home',
        variant: 'secondary',
      },
      {
        id: 'test',
        label: t('cta_test'),
        href: '/waitlist',
        variant: 'primary',
      },
    ],

    sections: [
      {
        id: 'hook',
        number: 1,
        kicker: t('s01.kicker'),
        headline: t('s01.headline'),
        body: asStrings(t.raw('s01.body')),
        statements: asStrings(t.raw('s01.statements')),
        stats: asLVV(t.raw('s01.stats')),
        scrollHint: t('s01.scroll_hint'),
        visual: {
          type: 'image',
          src: '/home_background.webp',
          alt: t('s01.alt'),
        },
      },

      {
        id: 'game',
        number: 2,
        kicker: t('s02.kicker'),
        headline: t('s02.headline'),
        body: asStrings(t.raw('s02.body')),
        visual: {
          type: 'sequence',
          src: '/prototype/landing/hero/hero-1.webp',
          alt: t('s02.alt'),
          steps: asStrings(t.raw('s02.steps')),
        },
      },

      {
        id: 'insight',
        number: 3,
        kicker: t('s03.kicker'),
        headline: t('s03.headline'),
        subheadline: t('s03.subheadline'),
        body: asStrings(t.raw('s03.body')),
        finalStatement: t('s03.final'),
        visual: {
          type: 'data-accumulation',
          src: '/prototype/landing/hero/hero-2.webp',
          alt: t('s03.alt'),
          items: illustrative<LV>(t.raw('s03.items')),
        },
        status: 'illustrative',
      },

      {
        id: 'human-ai',
        number: 4,
        kicker: t('s04.kicker'),
        headline: t('s04.headline'),
        body: asStrings(t.raw('s04.body')),
        rows: asRows(t.raw('s04.rows')),
        columnLabels: { human: t('s04.human'), model: t('s04.model') },
        finalStatement: t('s04.final'),
        visual: {
          type: 'split',
          src: '/prototype/landing/hero/hero-3.webp',
          alt: t('s04.alt'),
        },
        status: 'roadmap',
        statusLabel: t('s04.status_label'),
      },

      {
        id: 'evaluation',
        number: 5,
        kicker: t('s05.kicker'),
        headline: t('s05.headline'),
        body: asStrings(t.raw('s05.body')),
        finalStatement: t('s05.final'),
        baseline: t('s05.baseline'),
        visual: {
          type: 'report',
          metrics: illustrative<{ label: string; value: string }>(t.raw('s05.metrics')),
          flow: asStrings(t.raw('s05.flow')),
        },
        status: 'illustrative',
      },

      {
        id: 'moat',
        number: 6,
        kicker: t('s06.kicker'),
        headline: t('s06.headline'),
        body: asStrings(t.raw('s06.body')),
        finalStatement: t('s06.final'),
        visual: {
          type: 'stack',
          src: '/prototype/landing/hero/hero-5.webp',
          alt: t('s06.alt'),
          stack: asStrings(t.raw('s06.stack')),
        },
      },

      {
        id: 'test-model',
        number: 7,
        kicker: t('s07.kicker'),
        headline: t('s07.headline'),
        body: asStrings(t.raw('s07.body')),
        finalStatement: t('s07.final'),
        visual: {
          type: 'model-flow',
          steps: asStrings(t.raw('s07.steps')),
          metrics: illustrative<{ label: string; value: string }>(t.raw('s07.metrics')),
          cta: 'test',
        },
        status: 'roadmap',
        statusLabel: t('s07.status_label'),
        ctas: ['test'],
      },

      {
        id: 'recurring-revenue',
        number: 8,
        kicker: t('s08.kicker'),
        headline: t('s08.headline'),
        subheadline: t('s08.subheadline'),
        body: asStrings(t.raw('s08.body')),
        finalStatement: t('s08.final'),
        chart: asChart(t.raw('s08.chart')),
        visual: {
          type: 'version-line',
          steps: asStrings(t.raw('s08.steps')),
        },
      },

      {
        id: 'business-model',
        number: 9,
        kicker: t('s09.kicker'),
        headline: t('s09.headline'),
        body: asStrings(t.raw('s09.body')),
        visual: {
          type: 'cards',
          nodes: asLVN(t.raw('s09.nodes')),
          branches: {
            root: t('s09.branches_root'),
            children: asStrings(t.raw('s09.branches_children')),
          },
        },
      },

      {
        id: 'flywheel',
        number: 10,
        kicker: t('s10.kicker'),
        headline: t('s10.headline'),
        body: asStrings(t.raw('s10.body')),
        finalStatement: t('s10.final'),
        visual: {
          type: 'flow',
          flow: asStrings(t.raw('s10.flow')),
        },
      },

      {
        id: 'platform',
        number: 11,
        kicker: t('s11.kicker'),
        headline: t('s11.headline'),
        body: asStrings(t.raw('s11.body')),
        finalStatement: t('s11.final'),
        visual: {
          type: 'branch',
          branches: {
            root: t('s11.branches_root'),
            children: asStrings(t.raw('s11.branches_children')),
          },
        },
        status: 'roadmap',
        statusLabel: t('s11.status_label'),
      },

      {
        id: 'investment',
        number: 12,
        kicker: t('s12.kicker'),
        headline: t('s12.headline'),
        body: [],
        businesses: asBusinesses(t.raw('s12.businesses')),
        statements: asStrings(t.raw('s12.statements')),
        finalStatement: t('s12.final'),
        visual: {
          type: 'close',
        },
        ctas: ['register', 'play'],
      },
    ],

    footer: {
      links: [
        { label: t('footer_link_home'), href: '/' },
        { label: t('footer_link_contact'), href: '/help' },
        { label: t('footer_link_privacy'), href: '/privacy' },
        { label: t('footer_link_terms'), href: '/terms' },
        { label: t('footer_link_sources'), href: '/help' },
        { label: t('footer_link_disclaimer'), href: '#disclaimer' },
      ],
      disclaimer: t('footer_disclaimer'),
    },
  }
}
