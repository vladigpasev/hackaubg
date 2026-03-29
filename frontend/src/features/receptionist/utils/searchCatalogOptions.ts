import type { CatalogOption } from '../types/patient'

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function getWordStarts(text: string) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

export function searchCatalogOptions(
  options: CatalogOption[],
  query: string,
  limit = 3,
): CatalogOption[] {
  const normalizedQuery = normalize(query)

  if (normalizedQuery.length === 0) {
    return []
  }

  return [...options]
    .map((option, index) => {
      const normalizedLabel = normalize(option.label)
      const normalizedKeywords = option.keywords.map(normalize)
      const labelWords = getWordStarts(option.label)
      const keywordWords = option.keywords.flatMap(getWordStarts)

      let bestRank = Number.POSITIVE_INFINITY

      if (normalizedLabel === normalizedQuery) {
        bestRank = 0
      } else if (normalizedLabel.startsWith(normalizedQuery)) {
        bestRank = 1
      } else if (labelWords.some((word) => word.startsWith(normalizedQuery))) {
        bestRank = 2
      } else if (normalizedKeywords.some((keyword) => keyword.startsWith(normalizedQuery))) {
        bestRank = 3
      } else if (keywordWords.some((word) => word.startsWith(normalizedQuery))) {
        bestRank = 4
      } else if (normalizedQuery.length >= 2 && normalizedLabel.includes(normalizedQuery)) {
        bestRank = 5
      } else if (
        normalizedQuery.length >= 2 &&
        normalizedKeywords.some((keyword) => keyword.includes(normalizedQuery))
      ) {
        bestRank = 6
      }

      return {
        bestRank,
        index,
        labelLength: normalizedLabel.length,
        option,
      }
    })
    .filter((entry) => Number.isFinite(entry.bestRank))
    .sort((left, right) => {
      if (left.bestRank !== right.bestRank) {
        return left.bestRank - right.bestRank
      }

      if (left.labelLength !== right.labelLength) {
        return left.labelLength - right.labelLength
      }

      return left.index - right.index
    })
    .slice(0, limit)
    .map((entry) => entry.option)
}
