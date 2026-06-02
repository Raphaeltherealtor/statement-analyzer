import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_CATEGORIES } from '@/lib/types'

export const maxDuration = 60

const client = new Anthropic()

// Hard cap — keeps a single call within Haiku's output budget and the function
// timeout. ~500 transactions is well over a year of statements for most users.
const MAX_TRANSACTIONS_PER_CALL = 500

// Reuses the same rule structure as the PDF parser, but framed as
// classification-only ("here are existing transactions, re-bucket them")
// instead of extraction. Identical content goes in the cached block so
// repeated calls share the parsed prefix.
const CLASSIFY_RULES = `You are classifying financial transactions for a real estate agent's tax prep. Re-classify each transaction below by picking the BEST FIT category — don't default to "Uncategorized" if a category reasonably fits.

Allowed categories (use ONLY these strings unless extras are provided in the next message):
${DEFAULT_CATEGORIES.join(', ')}

Confidence: 1.0 = clearly known brand, 0.8 = strong inference, 0.6 = weak guess, < 0.6 = use "Uncategorized" instead.

Rules — prefer the real-estate-specific buckets over generic Office/SaaS when they fit:

- Gas stations (Costco Gas, Arco, Shell, Chevron, 76, BP, Mobil) → "Gas & Fuel"
- Supermarkets (Trader Joe's, Whole Foods, Safeway, Ralphs, Vons, Sprouts, H-Mart, 99 Ranch) → "Groceries"
- Costco Wholesale non-gas → "Groceries"
- Fast food chains (McDonald's, Taco Bell, Chipotle, In-N-Out, KFC, Subway, Panda Express, Chick-fil-A, Del Taco, Jack in the Box) → "Fast Food"
- Sit-down restaurants → "Restaurants"
- Starbucks, Dutch Bros, Peet's, Philz, local cafés → "Coffee Shops"
- Bars, breweries, BevMo, Total Wine, liquor stores → "Bars & Alcohol"
- DoorDash, Uber Eats, GrubHub, Postmates → "Food Delivery"
- Amazon (general retail/marketplace) → "Amazon"
- Target, Walmart, department stores, Best Buy general → "Shopping & Retail"
- Airlines, hotels, Airbnb, VRBO → "Travel"
- Uber, Lyft, taxi → "Rideshare & Taxi"
- Movie theaters, concerts, events, video games → "Entertainment"
- Netflix, Spotify, Hulu, Disney+, HBO, YouTube Premium → "Streaming & Subscriptions"
- Doctors, dentists, hospitals, urgent care, labs, therapy → "Medical & Health"
- CVS, Walgreens, Rite Aid → "Pharmacy"
- Electric, gas, water, sewer, trash → "Utilities"
- T-Mobile, Verizon, AT&T, Comcast, Xfinity, Spectrum → "Phone & Internet"
- Auto repair, AutoZone, O'Reilly, registration, car wash → "Automotive"
- Home Depot, Lowe's, Ace Hardware, IKEA general → "Home & Garden"
- Tuition, schools, general online courses → "Education"
- Clothing, shoes → "Clothing"
- Vet, Petco, PetSmart, Chewy → "Pets"
- Donations, GoFundMe, nonprofits, churches → "Charity & Donations"
- Generic office supplies, coworking → "Office & Business"
- ATM withdrawals → "Cash & ATM"
- Bank fees, overdraft, late fees, interest → "Fees & Interest"
- IRS, state tax, DMV, passport, government fees → "Taxes & Government"
- Insurance (auto / home / life, not health) → "Insurance"
- Payroll, direct deposits, money received → "Income & Deposits"
- Transfers between own accounts → "Transfers"

Real-estate-specific buckets:
- Postcards (THANKS.IO, Click2Mail, Wise Pelican), business cards (VistaPrint, MOO), flyers/brochures, social ads (Meta, TikTok, LinkedIn, Google Ads), email marketing (Mailchimp, ConvertKit), video marketing (Pictory, Veed, Descript), Canva → "Marketing & Advertising"
- CRM + lead gen: Follow Up Boss, kvCORE, BoldLeads, Zillow Premier Agent, Realtor.com Connections, BoomTown, LionDesk, Ylopo, Curaytor, Top Producer, REDX, Vulcan7, Espresso Agent, Wise Agent, Real Geeks, Sierra Interactive → "CRM & Lead Generation"
- Staging companies, yard signs, banner printing, sign installers, BoxBrownie virtual staging → "Staging & Signage"
- Professional photo shoots, drone services, virtual tour services (Matterport, iGuide, Asteroom), Lightroom → "Photography & Video"
- Squarespace (SQSP), WordPress, Wix, GoDaddy, Google Domains, Bluehost, Cloudflare, Webflow, IDX Broker → "Website & Hosting"
- REALTOR ASSOCIATION, MLS subscriptions, CRMLS, NAR/CAR/NWMLS/state real estate board dues → "MLS & Association Dues"
- eXp Realty fees (PLD, eXp World), Compass / Keller Williams / Coldwell transaction fees, broker desk fees, E&O via brokerage → "Brokerage Fees"
- Supra Real Estate (SUPRA RE), lockbox keys, eKey services, ShowingTime, PacificCoast Agent → "Lockboxes & Showings"
- Closing gifts, client appreciation, thank-you cards, gift baskets clearly tied to clients, open-house refreshments → "Client Gifts & Closing"
- State CE / license renewal, certifications (CRS, GRI, ABR, SRES) → "Continuing Education"
- Conference fees (Inman Connect, NAR conference, eXpCON, KW Family Reunion), mastermind events → "Conferences & Events"
- Attorneys, paralegals, CPAs, tax preparers, bookkeepers (QuickBooks Online subs), financial advisors, referral fees paid to other agents → "Legal & Professional Services"
- Computers, monitors, printers, hard drives, iPads, cameras over ~$200 (B&H Photo, Apple Store, Best Buy hardware, Dell, Lenovo) → "Office Equipment & Tech"
- USPS PO, Stamps.com, UPS, FedEx, DHL, courier services → "Postage & Shipping"
- Tolls (SunPass, EZ Pass, FasTrak), parking meters, ParkMobile, SpotHero, valet → "Tolls & Parking"
- Home-office-only cleaning services, pest control for home, dedicated office furniture (Wayfair/IKEA for home office), home office decor → "Home Office"
- Self-paid health insurance (Blue Shield, Anthem, Kaiser, Aetna, healthcare.gov, Cigna) → "Health Insurance"
- SEP-IRA / Solo 401k / IRA contributions to Fidelity, Vanguard, Schwab, E*Trade — only when clearly retirement contributions → "Retirement Contributions"
- Virtual assistant fees, Upwork, Fiverr, 1099 transaction coordinators, paid showing assistants → "Contract Labor"

Generic productivity NOT in any specific bucket (Microsoft 365, Google Workspace, GitHub, OpenAI/ChatGPT, Anthropic, Adobe non-Lightroom, Everlance, Notion, Slack, Zoom, Dropbox/iCloud/Backblaze) → "Software & SaaS"

- Truly unrecognizable → "Uncategorized"
- Recognizable but doesn't fit anything above → "Other"

Input format: one line per transaction, "ID :: DESCRIPTION :: $AMOUNT :: DATE"
Output: a JSON array, one entry per input, in the same order:
[{ "id": "...", "category": "...", "subcategory": "...", "confidence": 0.95 }, ...]

Return ONLY the JSON array. No preamble, no markdown.`

interface InputTxn {
  id: string
  description: string
  amount: number
  date?: string
  currentCategory?: string
}

interface ResultRow {
  id: string
  category: string
  subcategory?: string
  confidence: number
}

export async function POST(request: NextRequest) {
  let body: { transactions?: unknown; extraCategories?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const txns = body.transactions
  if (!Array.isArray(txns) || txns.length === 0) {
    return Response.json({ error: 'Provide a non-empty transactions array' }, { status: 400 })
  }
  if (txns.length > MAX_TRANSACTIONS_PER_CALL) {
    return Response.json(
      { error: `Too many transactions in one call (${txns.length}). Split into batches of ${MAX_TRANSACTIONS_PER_CALL}.` },
      { status: 400 }
    )
  }

  const cleanTxns: InputTxn[] = txns
    .filter((t): t is InputTxn =>
      typeof t === 'object' && t !== null &&
      typeof (t as InputTxn).id === 'string' &&
      typeof (t as InputTxn).description === 'string' &&
      typeof (t as InputTxn).amount === 'number'
    )

  const extras: string[] = Array.isArray(body.extraCategories)
    ? body.extraCategories.filter((c): c is string => typeof c === 'string')
    : []

  const lines = cleanTxns
    .map(t => `${t.id} :: ${t.description} :: $${t.amount.toFixed(2)} :: ${t.date || 'unknown'}`)
    .join('\n')

  const extrasNote = extras.length > 0
    ? `\n\nUser-defined extra categories you may also use when they fit: ${extras.join(', ')}.\n`
    : ''

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: CLASSIFY_RULES, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `${extrasNote}\nTransactions to classify:\n${lines}\n\nReturn the JSON array now.` },
        ],
      }],
    })

    const first = message.content[0]
    if (first.type !== 'text') throw new Error('Unexpected response type')

    const text = first.text.trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array found in response')

    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) throw new Error('Response was not an array')

    const results: ResultRow[] = parsed
      .filter((r: unknown): r is ResultRow =>
        typeof r === 'object' && r !== null &&
        typeof (r as ResultRow).id === 'string' &&
        typeof (r as ResultRow).category === 'string'
      )
      .map((r: ResultRow) => ({
        id: r.id,
        category: r.category,
        subcategory: r.subcategory,
        confidence: typeof r.confidence === 'number' ? r.confidence : 1,
      }))

    return Response.json({ results })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Recategorize failed' },
      { status: 500 }
    )
  }
}
