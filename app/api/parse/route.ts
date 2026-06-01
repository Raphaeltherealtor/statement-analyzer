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

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFParser = require('pdf2json')
  return new Promise((resolve, reject) => {
    const parser = new PDFParser()
    parser.on('pdfParser_dataError', (err: { parserError: Error }) => reject(err.parserError))
    parser.on('pdfParser_dataReady', (data: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => {
      const text = data.Pages.map((page) =>
        page.Texts.map((t) => t.R.map((r) => decodeURIComponent(r.T)).join('')).join(' ')
      ).join('\n')
      resolve(text)
    })
    parser.parseBuffer(buffer)
  })
}

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

async function categorizeWithClaude(
  rawText: string,
  filename: string,
  extraCategories: string[],
): Promise<Transaction[]> {
  const allCategories = [...DEFAULT_CATEGORIES, ...extraCategories.filter(c => !DEFAULT_CATEGORIES.includes(c))]

  const customLine = extraCategories.length
    ? `\nThe user has also defined custom categories: ${extraCategories.join(', ')}. Use one of these if it clearly fits a transaction.\n`
    : ''

  const prompt = `You are a financial transaction parser. Extract ALL transactions from this bank/financial statement text and return them as JSON.

For each transaction return:
- date: "YYYY-MM-DD" (or "unknown")
- description: the merchant name as it appears, cleaned up (drop POS DEBIT / SQ * / TST * style prefixes)
- amount: positive = money spent, negative = money received (credits, deposits, refunds)
- category: best match from the list below — pick "Uncategorized" if you are not confident
- subcategory: short brand/merchant name (e.g. "Starbucks", "Costco Gas")
- confidence: 0.0 to 1.0 — how sure you are about the category

Confidence rubric:
- 1.0  — clearly a known brand (Starbucks, Chevron, Netflix, Amazon)
- 0.8  — strong inference (a name that obviously reads like a restaurant)
- 0.6  — weak guess
- < 0.6 — set category to "Uncategorized" instead

Allowed categories (use ONLY these strings):
${allCategories.join(', ')}
${customLine}
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
- Tuition, schools, online courses, Udemy, Coursera, textbooks → "Education"
- Clothing stores, shoe stores, athletic apparel → "Clothing"
- Vet, Petco, PetSmart, Chewy, pet food, grooming → "Pets"
- Donations, GoFundMe, nonprofits, churches, religious orgs → "Charity & Donations"
- Staples, office supplies, coworking, business services → "Office & Business"
- ATM withdrawals, cash advances → "Cash & ATM"
- Bank fees, late fees, overdraft, interest charges, foreign transaction fees → "Fees & Interest"
- IRS, state tax payments, DMV, passport, government fees → "Taxes & Government"
- Truly unrecognizable merchants or ambiguous descriptors → "Uncategorized"
- Recognizable but doesn't fit any bucket above → "Other"

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

Skip balance lines, headers, summary rows, and "BEGINNING BALANCE" / "ENDING BALANCE" entries.

Statement text:
${rawText.slice(0, 80000)}`

  // Haiku 4.5 is dramatically faster than Sonnet/Opus on structured extraction
  // and is the only Claude tier consistently completing inside Vercel's 60s
  // serverless cap on real multi-page statements.
  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const text = content.text.trim()
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
    source: filename,
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
        let rawText = ''

        if (ext === 'pdf') rawText = await extractTextFromPDF(f.buffer)
        else if (ext === 'csv') rawText = f.buffer.toString('utf-8')
        else if (ext === 'xlsx' || ext === 'xls') rawText = await parseCSVorExcel(f.buffer)
        else return { transactions: [], error: { file: f.name, error: 'Unsupported file type' } }

        if (!rawText.trim()) {
          return { transactions: [], error: { file: f.name, error: 'Could not extract text from file' } }
        }

        const transactions = await categorizeWithClaude(rawText, f.name, extraCategories)
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
