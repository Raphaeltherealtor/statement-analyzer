import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Transaction, ALL_CATEGORIES } from '@/lib/types'
import { randomUUID } from 'crypto'

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

async function parseCSVorExcel(buffer: Buffer, filename: string): Promise<string> {
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

async function categorizeWithClaude(rawText: string, filename: string): Promise<Transaction[]> {
  const prompt = `You are a financial transaction parser. Extract ALL transactions from this bank/financial statement text and return them as JSON.

For each transaction, determine the best category from this list:
${ALL_CATEGORIES.join(', ')}

Rules:
- Gas stations (Costco Gas, Arco, Shell, Chevron, 76, BP, Mobil, etc.) → "Gas & Fuel"
- Supermarkets, grocery stores (Costco (non-gas), Trader Joe's, Whole Foods, Safeway, etc.) → "Groceries"
- Restaurants, fast food, cafes, DoorDash, Uber Eats, GrubHub → "Restaurants & Dining"
- Amazon.com, Amazon Prime, Amazon orders → "Amazon"
- Target, Walmart, Costco (general), department stores → "Shopping & Retail"
- Airlines, hotels, Airbnb, Uber, Lyft, parking → "Travel"
- Netflix, Spotify, Apple, Disney+, games, movies → "Entertainment"
- Pharmacies, doctors, dentists, hospitals → "Medical & Health"
- Electric, gas, water, internet, phone bills → "Utilities"
- Software subscriptions, SaaS, app stores, Adobe, Microsoft → "Subscriptions & Software"
- Insurance payments → "Insurance"
- Payroll, direct deposits, transfers IN → "Income & Deposits"
- Transfers between accounts → "Transfers"
- Car repairs, auto parts, registration, car wash → "Automotive"
- Home Depot, Lowe's, furniture, home improvement → "Home & Garden"
- Tuition, books, online courses → "Education"
- Clothing stores, shoes → "Clothing"
- Everything else → "Other"

For the amount field:
- Positive numbers = money spent (expenses/debits)
- Negative numbers = money received (credits, deposits, refunds)

Return ONLY a valid JSON array with no markdown or explanation:
[
  {
    "date": "YYYY-MM-DD",
    "description": "merchant name as it appears",
    "amount": 45.23,
    "category": "Gas & Fuel",
    "subcategory": "Costco Gas"
  }
]

If you cannot determine a date, use "unknown". Skip balance lines, headers, and summary rows.

Statement text:
${rawText.slice(0, 80000)}`

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  // Extract JSON from response
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
  }) => ({
    id: randomUUID(),
    date: t.date || 'unknown',
    description: t.description || 'Unknown',
    amount: parseFloat(String(t.amount)) || 0,
    category: t.category || 'Other',
    subcategory: t.subcategory,
    source: filename,
  })) as Transaction[]
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 })
    }

    const allTransactions: Transaction[] = []
    const errors: { file: string; error: string }[] = []

    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const filename = file.name
        const ext = filename.split('.').pop()?.toLowerCase()

        let rawText = ''

        if (ext === 'pdf') {
          rawText = await extractTextFromPDF(buffer)
        } else if (ext === 'csv') {
          rawText = buffer.toString('utf-8')
        } else if (ext === 'xlsx' || ext === 'xls') {
          rawText = await parseCSVorExcel(buffer, filename)
        } else {
          errors.push({ file: filename, error: 'Unsupported file type' })
          continue
        }

        if (!rawText.trim()) {
          errors.push({ file: filename, error: 'Could not extract text from file' })
          continue
        }

        const transactions = await categorizeWithClaude(rawText, filename)
        allTransactions.push(...transactions)
      } catch (err) {
        errors.push({
          file: file.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return Response.json({ transactions: allTransactions, errors })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to parse files' },
      { status: 500 }
    )
  }
}
