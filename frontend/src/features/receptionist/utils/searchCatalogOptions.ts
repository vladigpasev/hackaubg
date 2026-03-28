import type { CatalogOption } from '../types/patient'

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function getCandidateText(option: CatalogOption) {
  return [option.label, ...option.keywords].map(normalize)
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
      const candidates = getCandidateText(option)

      const bestRank = candidates.reduce<number>((currentRank, candidate) => {
        if (candidate.startsWith(normalizedQuery)) {
          return Math.min(currentRank, 0)
        }

        if (candidate.includes(normalizedQuery)) {
          return Math.min(currentRank, 1)
        }

        return currentRank
      }, Number.POSITIVE_INFINITY)

      return {
        bestRank,
        index,
        option,
      }
    })
    .filter((entry) => Number.isFinite(entry.bestRank))
    .sort((left, right) => {
      if (left.bestRank !== right.bestRank) {
        return left.bestRank - right.bestRank
      }

      return left.index - right.index
    })
    .slice(0, limit)
    .map((entry) => entry.option)
}
