import { describe, expect, it } from 'vitest'
import type { CatalogOption } from '../types/patient'
import { searchCatalogOptions } from './searchCatalogOptions'

const options: CatalogOption[] = [
  {
    id: 'cardiology',
    kind: 'doctor',
    keywords: ['cardio', 'heart'],
    label: 'Cardiology',
  },
  {
    id: 'echocardiogram',
    kind: 'doctor',
    keywords: ['echo'],
    label: 'Echocardiogram',
  },
  {
    id: 'emergency',
    kind: 'doctor',
    keywords: ['er'],
    label: 'Emergency',
  },
]

describe('searchCatalogOptions', () => {
  it('does not match one-letter queries against deep keyword substrings', () => {
    const results = searchCatalogOptions(options, 'e', 5)

    expect(results.map((option) => option.label)).toEqual([
      'Emergency',
      'Echocardiogram',
    ])
  })

  it('still allows longer substring matches when the query is specific enough', () => {
    const results = searchCatalogOptions(options, 'hear', 5)

    expect(results.map((option) => option.label)).toEqual(['Cardiology'])
  })
})

