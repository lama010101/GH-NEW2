export type SectionStatus = 'verified' | 'illustrative' | 'roadmap' | 'conceptual'

export type InvestorSection = {
  id: string
  number: number
  headline: string
  subheadline?: string
  body: string[]
  statements?: string[]
  visual: {
    type: string
    src?: string
    alt?: string
    steps?: string[]
    items?: { label: string; value?: string; status?: SectionStatus }[]
    columns?: { title: string; items: string[] }[]
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

export const investorContent: InvestorContent = {
  title: 'Guess History',
  progressLabel: 'GUESS HISTORY',

  ctas: [
    {
      id: 'register',
      label: 'Register Your Interest',
      href: '/waitlist',
      variant: 'primary',
    },
    {
      id: 'play',
      label: 'Play Guess History',
      href: '/home',
      variant: 'secondary',
    },
    {
      id: 'test',
      label: 'Register Interest',
      href: '/waitlist',
      variant: 'primary',
    },
  ],

  sections: [
    {
      id: 'hook',
      number: 1,
      headline: 'What if a game could become an AI benchmark?',
      body: [
        'Guess History is a game where players reconstruct where and when historical events happened.',
        'But the game can create something much larger: a human-grounded visual AI benchmark.',
      ],
      statements: ['The game is the beginning.'],
      visual: {
        type: 'image',
        src: '/home_background.webp',
        alt: 'Cinematic historical scene with depth, human figures, and visually ambiguous clues',
      },
    },

    {
      id: 'game',
      number: 2,
      headline: 'A simple game with an unusual data engine.',
      body: [
        'Look at a historical photograph. Guess where it was taken and when. That is the whole game.',
      ],
      visual: {
        type: 'sequence',
        src: '/prototype/landing/hero/hero-1.webp',
        alt: 'Historical scene used for the where-and-when mini-demo',
        steps: ['Historical scene', 'Where?', 'When?', 'Reveal'],
      },
    },

    {
      id: 'insight',
      number: 3,
      headline: "Players aren't just players.",
      subheadline: 'They are creating a human benchmark.',
      body: [
        'Every answer makes the benchmark more informative.',
      ],
      finalStatement: 'Every answer makes the benchmark more informative.',
      visual: {
        type: 'data-accumulation',
        src: '/prototype/landing/hero/hero-2.webp',
        alt: 'The same historical image used to anchor the accumulating human observations',
        items: [
          { label: 'Human attempts', value: '10,281', status: 'illustrative' },
          { label: 'Median year error', value: '8 years', status: 'illustrative' },
          { label: 'Median location error', value: '74 km', status: 'illustrative' },
          { label: 'Difficulty', value: 'HARD', status: 'illustrative' },
        ],
      },
      status: 'illustrative',
    },

    {
      id: 'human-ai',
      number: 4,
      headline: 'Now give the same challenge to AI.',
      body: [
        'Human and AI are given the same image and the same two questions. Their results can be compared directly.',
      ],
      finalStatement: 'Now we can compare them.',
      visual: {
        type: 'split',
        src: '/prototype/landing/hero/hero-3.webp',
        alt: 'Split-screen visual showing the same image tested against a human and an AI model',
        columns: [
          { title: 'HUMAN', items: ['Where?', 'When?', 'Result'] },
          { title: 'AI MODEL', items: ['Where?', 'When?', 'Result'] },
        ],
      },
      status: 'roadmap',
      statusLabel: 'Planned evaluation capability',
    },

    {
      id: 'evaluation',
      number: 5,
      headline: 'A new layer of AI evaluation.',
      body: [
        'A clean evaluation report. The benchmark is not just "right or wrong."',
      ],
      finalStatement: "Not just 'right or wrong.'",
      visual: {
        type: 'report',
        metrics: [
          { label: 'TEMPORAL REASONING', value: 'Median error: 8 years', status: 'illustrative' },
          { label: 'SPATIAL REASONING', value: 'Median distance: 182 km', status: 'illustrative' },
          { label: 'CALIBRATION', value: 'High-confidence error: 9%', status: 'illustrative' },
          { label: 'LATENCY', value: 'P95: 3.1 s', status: 'illustrative' },
          { label: 'COST', value: '$0.014 / evaluation', status: 'illustrative' },
        ],
        flow: ['MODEL', 'BENCHMARK', 'HUMAN BASELINE', 'PERFORMANCE'],
      },
      status: 'illustrative',
    },

    {
      id: 'moat',
      number: 6,
      headline: "The valuable asset isn't the image.",
      body: [
        'The moat grows through usage.',
        'More human observations → stronger benchmark.',
        'More model evaluations → richer comparison.',
        'More history → stronger longitudinal dataset.',
      ],
      finalStatement: 'It is the dataset around the image.',
      visual: {
        type: 'stack',
        src: '/prototype/landing/hero/hero-5.webp',
        alt: 'Historical image with progressively denser data layers building around it',
        stack: [
          'Verified ground truth',
          'Human observations',
          'Human difficulty',
          'Confidence',
          'AI responses',
          'Model versions',
          'Evaluation methodology',
        ],
      },
    },

    {
      id: 'test-model',
      number: 7,
      headline: 'Test your model.',
      body: [
        'A model provider submits a vision model, runs the benchmark, and receives a reproducible, human-grounded evaluation.',
      ],
      finalStatement: 'Independent. Human-grounded. Reproducible.',
      visual: {
        type: 'model-flow',
        steps: ['Vision Model v4.2', 'RUN BENCHMARK'],
        metrics: [
          { label: 'TEMPORAL', value: '72%', status: 'illustrative' },
          { label: 'LOCATION', value: '81%', status: 'illustrative' },
          { label: 'CALIBRATION', value: '0.11', status: 'illustrative' },
          { label: 'HUMAN WIN', value: '64%', status: 'illustrative' },
          { label: 'P95 LATENCY', value: '2.4s', status: 'illustrative' },
        ],
        cta: 'test',
      },
      status: 'roadmap',
      statusLabel: 'Planned evaluation capability',
      ctas: ['test'],
    },

    {
      id: 'recurring-revenue',
      number: 8,
      headline: "Don't test a model once.",
      subheadline: 'Track every version.',
      body: [
        'Three model versions travel through the same benchmark. A line graph evolves. Metrics improve or regress.',
      ],
      finalStatement: 'Did your model actually improve?',
      visual: {
        type: 'version-line',
        steps: ['MODEL v1 → BENCHMARK', 'MODEL v2 → BENCHMARK', 'MODEL v3 → BENCHMARK'],
      },
    },

    {
      id: 'business-model',
      number: 9,
      headline: 'Four ways to monetize the benchmark.',
      body: [
        'Every human-verified answer becomes evaluation data a model provider can buy access to, in four distinct products.',
      ],
      visual: {
        type: 'cards',
        nodes: [
          { label: '01 — Benchmark API', description: 'Automated model evaluations' },
          { label: '02 — Enterprise Monitoring', description: 'Continuous model-version testing' },
          { label: '03 — Custom Benchmarks', description: 'Customer-specific evaluation programs' },
          { label: '04 — Data & Research', description: 'Controlled benchmark and data access' },
        ],
        branches: {
          root: 'Secondary opportunities',
          children: ['Education', 'Model selection', 'Benchmark sponsorship'],
        },
      },
    },

    {
      id: 'flywheel',
      number: 10,
      headline: 'The game feeds the benchmark.',
      body: [
        'The loop progressively accelerates. Consumer gameplay and B2B evaluation reinforce one another.',
      ],
      finalStatement: 'Two products. One reinforcing system.',
      visual: {
        type: 'flow',
        flow: [
          'MORE PLAYERS',
          'MORE HUMAN DATA',
          'BETTER BASELINES',
          'BETTER BENCHMARK',
          'MORE AI INTEREST',
          'B2B REVENUE',
          'MORE CONTENT',
          'MORE PLAYERS',
        ],
      },
    },

    {
      id: 'platform',
      number: 11,
      headline: 'History is the starting point.',
      body: [
        'The platform can expand from historical imagery into broader visual-reasoning evaluation categories.',
      ],
      finalStatement: 'Human-grounded visual AI evaluation.',
      visual: {
        type: 'branch',
        branches: {
          root: 'HISTORY',
          children: [
            'Geography',
            'Architecture',
            'Culture',
            'Visual chronology',
            'Maps',
            'Documents',
            'General visual reasoning',
          ],
        },
      },
      status: 'roadmap',
      statusLabel: 'Long-term platform opportunity',
    },

    {
      id: 'investment',
      number: 12,
      headline: 'We are building two businesses that strengthen each other.',
      body: [
        'GUESS HISTORY: A game that attracts players and generates proprietary human intelligence.',
        'GUESS HISTORY EVALUATION: A platform that measures AI performance against that intelligence.',
      ],
      statements: [
        'Game → Data → Benchmark',
        'Benchmark → Evaluation → Revenue',
        'Revenue → More Data → Stronger Platform',
      ],
      finalStatement: 'Can AI understand history as well as humans?',
      visual: {
        type: 'close',
      },
      ctas: ['register', 'play'],
    },
  ],

  footer: {
    links: [
      { label: 'Guess History', href: '/' },
      { label: 'Contact', href: '/help' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Sources', href: '/help' },
      { label: 'Legal disclaimer', href: '#disclaimer' },
    ],
    disclaimer:
      'This page is for informational purposes only and does not constitute an offer or solicitation to purchase securities. Forward-looking statements represent goals and opportunities, not guarantees or projections.',
  },
} as const
