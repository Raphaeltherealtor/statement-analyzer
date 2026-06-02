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

// Generic bank / financial / processor names where the FIRST word alone is
// ambiguous — same name covers multiple distinct products (Capital One has
// credit cards AND auto loans AND mortgages; Wells Fargo has cards AND
// mortgage AND ATM; Chase has cards AND mortgage AND brokerage). For these,
// the qualifier after the company name is what actually identifies the
// product — "Capital One Mobile Pymt" vs "Capital One Auto Pymt" must
// normalize to different keys or they collapse into the same merchant
// group and the user can't tell which payment is which.
const NEEDS_QUALIFIER = new Set([
  'capital',   // Capital One (cards / auto / mortgage)
  'wells',     // Wells Fargo (cards / mortgage / atm / personal)
  'chase',     // Chase (cards / mortgage / personal loans / brokerage)
  'bank',      // generic "bank of X" / "bank pmt"
  'discover',  // Discover (cards / personal loans / online savings)
  'citi',      // Citi (cards / mortgage)
  'american',  // American Express / American Airlines / etc.
  'usaa',      // USAA (banking / insurance / auto / member)
  'navy',      // Navy Federal Credit Union
  'pnc',       // PNC Bank
  'truist',    // Truist (BB&T + SunTrust)
  'fidelity',  // Fidelity (brokerage / retirement / cash mgmt)
  'schwab',    // Charles Schwab (brokerage / banking)
  'vanguard',  // Vanguard (brokerage / retirement)
  'sofi',      // SoFi (banking / student loans / auto loans)
  'ally',      // Ally (banking / auto loans / mortgage)
  'marcus',    // Marcus by Goldman Sachs
  'synchrony', // Synchrony (multiple branded cards)
  'mercury',   // Mercury (business banking)
])

// When the first word IS a qualifier-needing name, take this many words to
// keep enough product context (e.g. "capital one mobile pymt").
const QUALIFIER_KEEP_WORDS = 4

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

  // Generic bank/financial name as first word — keep the product qualifier
  // so "Capital One Mobile Pymt" vs "Capital One Auto Pymt" stay separate.
  if (NEEDS_QUALIFIER.has(words[0])) {
    return words.slice(0, QUALIFIER_KEEP_WORDS).join(' ')
  }

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
