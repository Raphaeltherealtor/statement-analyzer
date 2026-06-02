import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: SupabaseClient | null = null
function getClient(): SupabaseClient | null {
  if (cached) return cached
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

// Schema of the JSON blob stored per year. All fields optional so the form
// can grow over time without migrations. Manual line items live in the
// `manualItems` map keyed by stable string IDs from the CPA checklist.
export interface WorkspaceData {
  vehicle?: {
    type?: string
    inServiceDate?: string
    purchasePrice?: number
    leaseMonthly?: number
    mileageStart?: number
    mileageEnd?: number
    businessMiles?: number
    commutingMiles?: number
    notes?: string
  }
  homeOffice?: {
    totalSqFt?: number
    officeSqFt?: number
    firstMortgageInterest?: number
    secondMortgageInterest?: number
    equityLineInterest?: number
    propertyTaxes?: number
    insurance?: number
    repairsWholeHome?: number
    repairsOfficeOnly?: number
    cleaning?: number
    condoFee?: number
    electricity?: number
    gas?: number
    water?: number
    trash?: number
    alarm?: number
    homePurchaseDate?: string
    homePlacedInServiceDate?: string
    landValue?: number
    notes?: string
  }
  travel?: {
    daysOnTravel?: number
    airFare?: number
    trainFare?: number
    carRental?: number
    gasForRental?: number
    taxis?: number
    hotel?: number
    dryCleaning?: number
    travelMeals?: number
    travelTips?: number
    travelInternet?: number
    travelAgencyFees?: number
    securityPassFees?: number
    notes?: string
  }
  // Any extra line items the user typed manually, keyed by stable id (e.g.
  // "office_rent", "business_cards", "wages") so we can place them back in
  // the right CPA section on render.
  manualItems?: Record<string, number>
  notes?: string
}

export async function loadWorkspace(year: number): Promise<WorkspaceData | null> {
  const client = getClient()
  if (!client) return null
  const { data, error } = await client
    .from('sa_tax_workspaces')
    .select('data')
    .eq('year', year)
    .maybeSingle()
  if (error || !data) return null
  return (data.data as WorkspaceData) ?? {}
}

export async function saveWorkspace(year: number, data: WorkspaceData): Promise<boolean> {
  const client = getClient()
  if (!client) return false
  const { error } = await client
    .from('sa_tax_workspaces')
    .upsert(
      { year, data, updated_at: new Date().toISOString() },
      { onConflict: 'year' }
    )
  return !error
}

export async function listWorkspaceYears(): Promise<number[]> {
  const client = getClient()
  if (!client) return []
  const { data, error } = await client
    .from('sa_tax_workspaces')
    .select('year')
    .order('year', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.year as number)
}

export function workspaceConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}
