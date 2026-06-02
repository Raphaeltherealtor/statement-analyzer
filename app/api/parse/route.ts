import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { Transaction, DEFAULT_CATEGORIES } from '@/lib/types'
import { createJob, completeJob, failJob, dbConfigured, JobError } from '@/lib/jobs'
import { randomUUID } from 'crypto'

// Even though we return early via waitUntil, the function must stay alive until
// the background work finishes. 60s is the Hobby cap.
export const maxDuration = 60

const client = new Anthropic()

async function parseCSVorExcel(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  let text = ''
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    text += `Sheet: ${sheetName}\n`
    text += XLSX.utils.sheet_to_csv(sheet)
    text += '\n\n'
  }
  return text
}

// Static parser instructions — identical for every call. Marked with
// cache_control below so Anthropic can reuse the prefix across requests.
const PARSER_RULES = `You are a financial transaction parser. Extract ALL transactions from this bank/financial statement and return them as JSON.

For each transaction return:
- date: "YYYY-MM-DD" (or "unknown")
- description: the ACTUAL merchant or payee. Strip bank-level wrappers
  (POS DEBIT, DEBIT CARD PURCHASE, CHECK CARD, ACH, etc.), but for
  pass-through processors the REAL merchant is the part AFTER the asterisk —
  use that, NEVER leave the description as just the processor name:
    "PAYPAL *GOOGLE YOUTUBE" → "Google YouTube"
    "SQ *DUTCH BROS COFFEE"  → "Dutch Bros Coffee"
    "TST* RANCHO CUCAMONGA"  → "Rancho Cucamonga" (restaurant on Toast)
    "PP *EVERLANCE"          → "Everlance"
  If the description is literally just "PAYPAL" with no merchant, keep it
  as "PayPal" (the user will recategorize individually).
- amount: positive = money spent, negative = money received (credits, deposits, refunds)
- category: best match from the list below — pick "Uncategorized" if you are not confident
- subcategory: short brand/merchant name (e.g. "Starbucks", "Costco Gas")
- confidence: 0.0 to 1.0 — how sure you are about the category

Confidence rubric:
- 1.0  — clearly a known brand (Starbucks, Chevron, Netflix, Amazon)
- 0.8  — strong inference (a name that obviously reads like a restaurant)
- 0.6  — weak guess
- < 0.6 — set category to "Uncategorized" instead

Allowed categories (use ONLY these strings, plus any extra ones provided after this block):
${DEFAULT_CATEGORIES.join(', ')}

Category rules:
- Gas stations (Costco Gas, Arco, Shell, Chevron, 76, BP, Mobil, Valero, ExxonMobil) → "Gas & Fuel"
- Supermarkets (Trader Joe's, Whole Foods, Safeway, Ralphs, Vons, Sprouts, H-Mart, Aldi) → "Groceries"
- Costco Wholesale (non-gas) → "Groceries"
- Fast food chains (McDonald's, Burger King, Taco Bell, Chipotle, In-N-Out, KFC, Wendy's, Jack in the Box, Subway, Five Guys, Panda Express, Popeyes, Chick-fil-A) → "Fast Food"
- Sit-down restaurants, casual dining, food trucks (not fast food) → "Restaurants"
- Starbucks, Dutch Bros, Peet's, Philz, Blue Bottle, local coffee, cafés → "Coffee Shops"
- Bars, breweries, wineries, BevMo, Total Wine, liquor stores → "Bars & Alcohol"
- DoorDash, Uber Eats, GrubHub, Postmates, Caviar, Instacart restaurant orders → "Food Delivery"
- Amazon.com, Amazon Prime, Amazon Marketplace, AMZN → "Amazon"
- Target, Walmart, department stores, general retail, Best Buy → "Shopping & Retail"
- Airlines, hotels, Airbnb, VRBO, cruise lines → "Travel"
- Uber, Lyft, taxi, ride sharing → "Rideshare & Taxi"
- Movie theaters, concerts, events, video games, ticketing → "Entertainment"
- Netflix, Spotify, Hulu, Disney+, HBO Max, YouTube Premium, Apple TV+, Paramount, Peacock → "Streaming & Subscriptions"
- Doctors, dentists, hospitals, urgent care, labs, therapy → "Medical & Health"
- CVS, Walgreens, Rite Aid, prescriptions → "Pharmacy"
- Electric, gas, water, sewer, trash bills → "Utilities"
- T-Mobile, Verizon, AT&T, Comcast, Xfinity, Spectrum, Cox, internet/phone bills → "Phone & Internet"
- Adobe, Microsoft, Google Workspace, GitHub, OpenAI, Anthropic, dev tools, App Store, Google Play, SaaS → "Software & SaaS"
- Insurance payments (auto, home, health, life) → "Insurance"
- Payroll, direct deposits, money received from clients → "Income & Deposits"
- Transfers between own accounts, Zelle to self, ACH transfers → "Transfers"
- Auto repair, auto parts, AutoZone, O'Reilly, car wash, DMV registration → "Automotive"
- Home Depot, Lowe's, Ace Hardware, IKEA, furniture, home improvement → "Home & Garden"
- Tuition, schools, general online courses, Udemy, Coursera, textbooks (NOT professional CE) → "Education"
- Clothing stores, shoe stores, athletic apparel → "Clothing"
- Vet, Petco, PetSmart, Chewy, pet food, grooming → "Pets"
- Donations, GoFundMe, nonprofits, churches, religious orgs → "Charity & Donations"
- Staples, office supplies, coworking, generic business services → "Office & Business"
- ATM withdrawals, cash advances → "Cash & ATM"
- Bank fees, late fees, overdraft, interest charges, foreign transaction fees → "Fees & Interest"
- IRS, state tax payments, DMV, passport, government fees → "Taxes & Government"

Real-estate / professional-services specific rules (prefer these over the generic Office/SaaS buckets when they fit):
- Postcard mailers (THANKS.IO, Click2Mail), business cards (VistaPrint, MOO), Zillow/Realtor.com/Trulia/Homes.com lead ads, social ads (Meta, TikTok, Google Ads), email marketing (Mailchimp, ActiveCampaign, ConvertKit), video marketing tools (Pictory, Veed, Descript), Canva → "Marketing & Advertising"
- REALTOR ASSOCIATION, MLS subscriptions, CRMLS, NAR/CAR/NWMLS/state real estate board dues → "MLS & Association Dues"
- eXp Realty fees (PLD, eXp World, eXpand Mentor), Compass / Keller Williams / Coldwell transaction fees, E&O insurance billed by brokerage, broker desk fees → "Brokerage Fees"
- Supra Real Estate (SUPRA RE), lockbox keys, eKey services, showing services (ShowingTime, Aligned Showings), PacificCoast Agent → "Lockboxes & Showings"
- Client closing gifts, client appreciation, thank-you cards, gift baskets when clearly tied to clients → "Client Gifts & Closing"
- Squarespace (SQSP), WordPress, Wix, GoDaddy, Google Domains (g.co/helppay#), Bluehost, Cloudflare → "Website & Hosting"
- Professional photo shoots, drone services, virtual tour services (Matterport, iGuide, Asteroom), photo editing subs (Lightroom, BoxBrownie) → "Photography & Video"
- State CE / license renewal for an active profession (real estate, mortgage, insurance CE) → "Continuing Education"

Generic productivity tools that AREN'T marketing or website-specific (Microsoft 365, Google Workspace, GitHub, OpenAI/ChatGPT, Adobe (non-Lightroom), Everlance, Notion, password managers) → "Software & SaaS"

- Truly unrecognizable merchants or ambiguous descriptors → "Uncategorized"
- Recognizable but doesn't fit any bucket above → "Other"

Amazon order history files (PDF or Excel) are special — they list individual products bought, not a single charge. When the input looks like an Amazon order export:
- Create ONE transaction per line item (per product), not per order
- description: the actual product name (e.g. "Anker USB-C Charger 60W")
- subcategory: a short label for the item (e.g. "USB-C Charger")
- category: pick based on the product itself, NOT the fact that it came from Amazon. Examples:
    - Cables, chargers, electronics, monitors, hard drives, keyboards, headphones, software licenses → "Office & Business"
    - Books for work or business courses → "Education"
    - Office supplies (paper, pens, organizers, desk gear) → "Office & Business"
    - Household items, kitchen, decor, toys → "Shopping & Retail"
    - Clothing, shoes → "Clothing"
    - Pet products → "Pets"
    - Health/wellness, vitamins → "Medical & Health"
    - Truly unrecognizable → "Amazon"
- amount: the per-item price (not the order total). If only an order total is shown, use that with the description listing all items.

Return ONLY a valid JSON array with no markdown or explanation:
[
  {
    "date": "YYYY-MM-DD",
    "description": "Starbucks #4823",
    "amount": 6.45,
    "category": "Coffee Shops",
    "subcategory": "Starbucks",
    "confidence": 1.0
  }
]

Skip balance lines, headers, summary rows, and "BEGINNING BALANCE" / "ENDING BALANCE" entries.`

type CategorizeInput =
  | { kind: 'pdf'; pdfBase64: string; filename: string }
  | { kind: 'text'; text: string; filename: string }

async function categorizeWithClaude(
  input: CategorizeInput,
  extraCategories: string[],
): Promise<Transaction[]> {
  // Build content blocks. cache_control on the static rules block lets the
  // API reuse the parsed prefix across calls (helps once the user has run
  // a few uploads).
  const content: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: 'text',
      text: PARSER_RULES,
      cache_control: { type: 'ephemeral' },
    },
  ]

  if (extraCategories.length > 0) {
    content.push({
      type: 'text',
      text: `Additional user-defined categories you may also use when they clearly fit: ${extraCategories.join(', ')}`,
    })
  }

  if (input.kind === 'pdf') {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: input.pdfBase64,
      },
    })
    content.push({
      type: 'text',
      text: `Parse the PDF above (filename: ${input.filename}). Return the JSON array now, with no preamble.`,
    })
  } else {
    content.push({
      type: 'text',
      text: `Statement text (filename: ${input.filename}):\n\n${input.text.slice(0, 80000)}\n\nReturn the JSON array now, with no preamble.`,
    })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content }],
  })

  const first = message.content[0]
  if (first.type !== 'text') throw new Error('Unexpected response type')

  const text = first.text.trim()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('No JSON array found in response')

  const parsed = JSON.parse(jsonMatch[0])

  return parsed.map((t: {
    date: string
    description: string
    amount: number
    category: string
    subcategory?: string
    confidence?: number
  }) => ({
    id: randomUUID(),
    date: t.date || 'unknown',
    description: t.description || 'Unknown',
    amount: parseFloat(String(t.amount)) || 0,
    category: t.category || 'Uncategorized',
    subcategory: t.subcategory,
    confidence: typeof t.confidence === 'number' ? t.confidence : undefined,
    source: input.filename,
  })) as Transaction[]
}

// Stay a few seconds under maxDuration so we have time to write the error
// row to Supabase before Vercel kills the function.
const PROCESS_TIMEOUT_MS = 55_000

async function runFiles(
  fileData: Array<{ name: string; buffer: Buffer }>,
  extraCategories: string[],
) {
  const results = await Promise.all(
    fileData.map(async (f): Promise<{ transactions: Transaction[]; error: JobError | null }> => {
      try {
        const ext = f.name.split('.').pop()?.toLowerCase()

        let input: CategorizeInput
        if (ext === 'pdf') {
          // Send the PDF straight to Claude — native document input preserves
          // table layout (date/desc/amount columns) that pdf2json flattened.
          input = { kind: 'pdf', pdfBase64: f.buffer.toString('base64'), filename: f.name }
        } else if (ext === 'csv') {
          const text = f.buffer.toString('utf-8')
          if (!text.trim()) return { transactions: [], error: { file: f.name, error: 'CSV is empty' } }
          input = { kind: 'text', text, filename: f.name }
        } else if (ext === 'xlsx' || ext === 'xls') {
          const text = await parseCSVorExcel(f.buffer)
          if (!text.trim()) return { transactions: [], error: { file: f.name, error: 'Spreadsheet is empty' } }
          input = { kind: 'text', text, filename: f.name }
        } else {
          return { transactions: [], error: { file: f.name, error: 'Unsupported file type' } }
        }

        const transactions = await categorizeWithClaude(input, extraCategories)
        return { transactions, error: null }
      } catch (err) {
        return {
          transactions: [],
          error: { file: f.name, error: err instanceof Error ? err.message : 'Unknown error' },
        }
      }
    })
  )

  const transactions = results.flatMap(r => r.transactions)
  const errors = results.flatMap(r => (r.error ? [r.error] : []))
  return { transactions, errors }
}

async function processJob(
  jobId: string,
  fileData: Array<{ name: string; buffer: Buffer }>,
  extraCategories: string[],
) {
  try {
    const { transactions, errors } = await Promise.race([
      runFiles(fileData, extraCategories),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Processing exceeded the 55s budget. Try a smaller file or split into multiple uploads.')),
          PROCESS_TIMEOUT_MS
        )
      ),
    ])

    await completeJob(jobId, transactions, errors)
  } catch (err) {
    await failJob(jobId, err instanceof Error ? err.message : 'Unknown error')
  }
}

export async function POST(request: NextRequest) {
  if (!dbConfigured()) {
    return Response.json(
      { error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project env vars.' },
      { status: 500 }
    )
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const extraCategoriesRaw = formData.get('extraCategories')
    const extraCategories: string[] = (() => {
      if (typeof extraCategoriesRaw !== 'string') return []
      try {
        const parsed = JSON.parse(extraCategoriesRaw)
        return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : []
      } catch {
        return []
      }
    })()

    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 })
    }

    // Read file contents into memory before returning — formData/File objects
    // are tied to the request and won't be valid in the waitUntil handler.
    const fileData = await Promise.all(
      files.map(async f => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) }))
    )
    const fileNames = fileData.map(f => f.name)

    const jobId = await createJob(fileNames)

    // Kick off processing in the background and return immediately
    waitUntil(processJob(jobId, fileData, extraCategories))

    return Response.json({ jobId, fileNames })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to start parse job' },
      { status: 500 }
    )
  }
}
