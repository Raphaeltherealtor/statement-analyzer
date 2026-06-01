// Bank statement descriptions look like:
//   "POS DEBIT STARBUCKS #4823 LOS ANGELE"
//   "SQ *DUTCH BROS COFFE SAN DIEGO"
//   "AMZN MKTP US*1A2B3C4D"
// We want all variants of the same merchant to normalize to the same key.

const BANK_PREFIXES = [
  /^pos\s+debit\s+/,
  /^pos\s+purchase\s+/,
  /^debit\s+card\s+purchase\s+/,
  /^debit\s+purchase\s+/,
  /^check\s+card\s+purchase\s+/,
  /^card\s+purchase\s+/,
  /^purchase\s+/,
  /^online\s+payment\s+/,
  /^recurring\s+/,
  /^ach\s+credit\s+/,
  /^ach\s+debit\s+/,
  /^ach\s+/,
  /^sq\s*\*\s*/,
  /^tst\s*\*\s*/,
  /^pp\s*\*\s*/,
  /^paypal\s*\*\s*/,
  /^debit\s+/,
  /^pos\s+/,
  /^card\s+/,
]

const STOPWORDS = new Set([
  'the', 'a', 'an',
  'inc', 'llc', 'corp', 'co', 'ltd', 'company',
  'usa', 'com', 'us', 'net', 'org',
  'store', 'storefront', 'shop',
])

export function normalizeMerchant(description: string): string {
  if (!description) return ''

  let s = description.toLowerCase().trim()

  // Strip common bank prefixes
  for (const p of BANK_PREFIXES) s = s.replace(p, '')

  // Replace punctuation with spaces (keeps letters and digits)
  s = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  // Location/store info usually starts at the first digit after the brand.
  // If a digit appears past character 3, cut there.
  const digitMatch = s.match(/^([^\d]{3,}?)\s*\d/)
  if (digitMatch) s = digitMatch[1].trim()

  // Tokenize, drop stopwords and single letters
  const words = s.split(' ').filter(w => w.length > 1 && !STOPWORDS.has(w))

  if (words.length === 0) return ''

  // If the first significant word is long enough to be uniquely a brand, use it alone.
  // Otherwise combine the first two so we don't collide short names like "amzn" / "shell".
  if (words[0].length >= 6) return words[0]
  return words.slice(0, 2).join(' ')
}

export function merchantsMatch(descriptionA: string, descriptionB: string): boolean {
  const a = normalizeMerchant(descriptionA)
  const b = normalizeMerchant(descriptionB)
  return Boolean(a) && a === b
}
