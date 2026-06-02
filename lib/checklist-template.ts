// Maps the user's CPA "Real Estate Agent/Broker Tax Deductions" checklist
// to the app's category buckets. Each row pulls its total from one of:
//   - category:  sum a single category's transactions
//   - aggregate: sum multiple categories together
//   - manual:    user types it in (workspace.manualItems[key])
// `homeOfficePct` rows are pulled from workspace.homeOffice fields and
// multiplied by office sq ft / total sq ft at render time. Vehicle and
// travel sections pull from workspace.vehicle / workspace.travel directly.

export type LineSource =
  | { kind: 'category'; category: string }
  | { kind: 'aggregate'; categories: string[] }
  | { kind: 'manual'; key: string }
  | { kind: 'workspace'; path: string } // dot path into WorkspaceData

export interface ChecklistRow {
  label: string
  source: LineSource
  note?: string
}

export interface ChecklistSection {
  title: string
  rows: ChecklistRow[]
}

export const CHECKLIST: ChecklistSection[] = [
  {
    title: 'Operating & Administrative Expenses',
    rows: [
      { label: 'Bank Charges', source: { kind: 'category', category: 'Fees & Interest' } },
      { label: 'Clerical & Virtual Assistant', source: { kind: 'category', category: 'Contract Labor' } },
      { label: 'Staff & Colleague Meetings', source: { kind: 'manual', key: 'staff_meetings' } },
      { label: 'Courier & Delivery Service', source: { kind: 'manual', key: 'courier' } },
      { label: 'Desk & Office Rent', source: { kind: 'manual', key: 'office_rent' } },
      { label: 'Film & Photography', source: { kind: 'category', category: 'Photography & Video' } },
      { label: 'Keys & Locksmith Services', source: { kind: 'manual', key: 'locksmith' } },
      { label: 'SentriLock & Supra Lock Boxes', source: { kind: 'category', category: 'Lockboxes & Showings' } },
      { label: 'Maps, Books & Research Materials', source: { kind: 'manual', key: 'maps_books' } },
      { label: 'General Office Expenses', source: { kind: 'category', category: 'Office & Business' } },
      { label: 'Payroll Processing Fees', source: { kind: 'manual', key: 'payroll_fees' } },
      { label: 'Payroll & Unemployment Taxes', source: { kind: 'manual', key: 'payroll_taxes' } },
      { label: 'Employee Benefit Programs', source: { kind: 'manual', key: 'employee_benefits' } },
      { label: 'Photocopying & Printing', source: { kind: 'manual', key: 'photocopying' } },
      { label: 'Postage', source: { kind: 'category', category: 'Postage & Shipping' } },
      { label: 'Equipment Rental & Lease', source: { kind: 'manual', key: 'equipment_rental' } },
      { label: 'Repairs', source: { kind: 'manual', key: 'repairs' } },
      { label: 'Signs & Banners', source: { kind: 'category', category: 'Staging & Signage' } },
      { label: 'Sign Installation & Removal', source: { kind: 'manual', key: 'sign_installation' } },
      { label: 'Office Supplies', source: { kind: 'manual', key: 'office_supplies' } },
      { label: 'Wages & Salary', source: { kind: 'manual', key: 'wages' } },
      { label: 'Tools & Small Equipment', source: { kind: 'manual', key: 'tools' } },
      { label: 'Janitorial Services', source: { kind: 'manual', key: 'janitorial' } },
      { label: 'Document Shredding Service', source: { kind: 'manual', key: 'shredding' } },
      { label: 'Offsite Data Backup Services', source: { kind: 'manual', key: 'data_backup' } },
      { label: 'Computer & IT Maintenance', source: { kind: 'manual', key: 'computer_maintenance' } },
      { label: 'Equipment Warranties', source: { kind: 'manual', key: 'warranties' } },
      { label: 'Website Design & Development', source: { kind: 'category', category: 'Website & Hosting' } },
      { label: 'Bottled Water, Soda & Refreshments', source: { kind: 'manual', key: 'refreshments' } },
      { label: 'Business Cards', source: { kind: 'manual', key: 'business_cards' } },
    ],
  },
  {
    title: 'Communication Expenses',
    rows: [
      { label: 'Cell Phone / Office Landline / Internet', source: { kind: 'category', category: 'Phone & Internet' } },
      { label: 'Mass Client Email & E-Newsletters', source: { kind: 'manual', key: 'email_newsletters' } },
    ],
  },
  {
    title: 'Direct Sales Expenses',
    rows: [
      { label: 'Advertising / Marketing (newspaper, radio, TV, social, online)', source: { kind: 'category', category: 'Marketing & Advertising' } },
      { label: 'Client Accommodations (warranties / inspections)', source: { kind: 'manual', key: 'client_accommodations' } },
      { label: 'Client Gifts & Closing', source: { kind: 'category', category: 'Client Gifts & Closing' } },
      { label: 'Client Moving & Storage Costs', source: { kind: 'manual', key: 'client_moving' } },
      { label: 'Commissions & Referral Fees (broker)', source: { kind: 'category', category: 'Brokerage Fees' } },
      { label: 'Flowers & Cards', source: { kind: 'manual', key: 'flowers_cards' } },
      { label: 'Meals & Entertainment (50% deductible)', source: { kind: 'aggregate', categories: ['Restaurants', 'Fast Food', 'Coffee Shops', 'Bars & Alcohol', 'Food Delivery'] }, note: '50% deductible at the federal level' },
      { label: 'Online Listing & Lead Generation Services', source: { kind: 'category', category: 'CRM & Lead Generation' } },
      { label: 'Open House & Broker Opens', source: { kind: 'manual', key: 'open_house' } },
      { label: 'Staging (decorative items, furniture rental)', source: { kind: 'manual', key: 'staging_items' } },
      { label: 'Property Cleaning Services & Supplies', source: { kind: 'manual', key: 'property_cleaning' } },
    ],
  },
  {
    title: 'Professional Expenses',
    rows: [
      { label: 'Dues & Memberships (NAR / state / local board)', source: { kind: 'category', category: 'MLS & Association Dues' } },
      { label: 'E&O Insurance', source: { kind: 'manual', key: 'eo_insurance' } },
      { label: 'Legal & Professional Services (attorneys, CPA, bookkeeping)', source: { kind: 'category', category: 'Legal & Professional Services' } },
      { label: 'SentriLock / Supra Lock Access Fees', source: { kind: 'manual', key: 'lock_access_fees' } },
      { label: 'Continuing Professional Education', source: { kind: 'category', category: 'Continuing Education' } },
      { label: 'Conferences & Seminars', source: { kind: 'category', category: 'Conferences & Events' } },
      { label: 'Licenses', source: { kind: 'manual', key: 'licenses' } },
      { label: 'Publications & Newspapers', source: { kind: 'manual', key: 'publications' } },
      { label: 'Networking Organizations', source: { kind: 'manual', key: 'networking_orgs' } },
      { label: 'Business & Life Coaching', source: { kind: 'manual', key: 'coaching' } },
      { label: 'Self-Employed Health Insurance', source: { kind: 'category', category: 'Health Insurance' }, note: 'Above-the-line adjustment (Schedule 1)' },
      { label: 'Retirement Contributions (SEP-IRA / Solo 401k)', source: { kind: 'category', category: 'Retirement Contributions' }, note: 'Above-the-line adjustment (Schedule 1)' },
    ],
  },
  {
    title: 'Equipment',
    rows: [
      { label: 'Office Equipment & Tech (computers, monitors, printers, etc.)', source: { kind: 'category', category: 'Office Equipment & Tech' } },
      { label: 'Software & SaaS', source: { kind: 'category', category: 'Software & SaaS' } },
      { label: 'Office Furniture & Decoration', source: { kind: 'manual', key: 'office_furniture' } },
      { label: 'Staging Items (furniture / appliances)', source: { kind: 'manual', key: 'staging_furniture' } },
      { label: 'Brief Case', source: { kind: 'manual', key: 'briefcase' } },
      { label: 'Cleaning Equipment', source: { kind: 'manual', key: 'cleaning_equipment' } },
    ],
  },
  {
    title: 'Auto Information & Expenses',
    rows: [
      { label: 'Vehicle (type)', source: { kind: 'workspace', path: 'vehicle.type' } },
      { label: 'Placed in service', source: { kind: 'workspace', path: 'vehicle.inServiceDate' } },
      { label: 'Purchase price (incl. sales tax)', source: { kind: 'workspace', path: 'vehicle.purchasePrice' } },
      { label: 'Monthly lease cost', source: { kind: 'workspace', path: 'vehicle.leaseMonthly' } },
      { label: 'Mileage on Jan 1', source: { kind: 'workspace', path: 'vehicle.mileageStart' } },
      { label: 'Mileage on Dec 31', source: { kind: 'workspace', path: 'vehicle.mileageEnd' } },
      { label: 'Business miles', source: { kind: 'workspace', path: 'vehicle.businessMiles' } },
      { label: 'Commuting miles', source: { kind: 'workspace', path: 'vehicle.commutingMiles' } },
      { label: 'Gasoline (auto from cards)', source: { kind: 'category', category: 'Gas & Fuel' } },
      { label: 'Auto repair & maintenance (auto)', source: { kind: 'category', category: 'Automotive' } },
      { label: 'Auto insurance', source: { kind: 'manual', key: 'auto_insurance' } },
      { label: 'Registration, licensing, tags', source: { kind: 'manual', key: 'auto_registration' } },
      { label: 'Roadside / OnStar / AAA', source: { kind: 'manual', key: 'roadside' } },
      { label: 'Parking & Tolls', source: { kind: 'category', category: 'Tolls & Parking' } },
      { label: 'Auto loan interest', source: { kind: 'manual', key: 'auto_loan_interest' } },
    ],
  },
  {
    title: 'Business Travel Expenses',
    rows: [
      { label: 'Days on travel', source: { kind: 'workspace', path: 'travel.daysOnTravel' } },
      { label: 'Air fare (incl. baggage)', source: { kind: 'category', category: 'Travel' } },
      { label: 'Train fare', source: { kind: 'workspace', path: 'travel.trainFare' } },
      { label: 'Car rental (incl. insurance)', source: { kind: 'workspace', path: 'travel.carRental' } },
      { label: 'Taxis & local transit (Uber/Lyft)', source: { kind: 'category', category: 'Rideshare & Taxi' } },
      { label: 'Hotel', source: { kind: 'workspace', path: 'travel.hotel' } },
      { label: 'Travel meals', source: { kind: 'workspace', path: 'travel.travelMeals' }, note: 'Separate from local meals (50% deductible)' },
      { label: 'Travel agency / TSA PreCheck / Clear', source: { kind: 'workspace', path: 'travel.securityPassFees' } },
    ],
  },
  {
    title: 'Home Office',
    rows: [
      { label: 'Living space of entire home (sq ft)', source: { kind: 'workspace', path: 'homeOffice.totalSqFt' } },
      { label: 'Size of home office (sq ft)', source: { kind: 'workspace', path: 'homeOffice.officeSqFt' } },
      { label: 'First mortgage interest (full year)', source: { kind: 'workspace', path: 'homeOffice.firstMortgageInterest' } },
      { label: 'Property taxes (full year)', source: { kind: 'workspace', path: 'homeOffice.propertyTaxes' } },
      { label: 'Homeowners insurance (full year)', source: { kind: 'workspace', path: 'homeOffice.insurance' } },
      { label: 'Repairs (whole home)', source: { kind: 'workspace', path: 'homeOffice.repairsWholeHome' } },
      { label: 'Repairs (office only — 100% deductible)', source: { kind: 'workspace', path: 'homeOffice.repairsOfficeOnly' } },
      { label: 'HOA / condo fee (full year)', source: { kind: 'workspace', path: 'homeOffice.condoFee' } },
      { label: 'Electricity (full year)', source: { kind: 'workspace', path: 'homeOffice.electricity' } },
      { label: 'Gas / oil (full year)', source: { kind: 'workspace', path: 'homeOffice.gas' } },
      { label: 'Water (full year)', source: { kind: 'workspace', path: 'homeOffice.water' } },
      { label: 'Trash / sewer', source: { kind: 'workspace', path: 'homeOffice.trash' } },
      { label: 'Cleaning (whole home)', source: { kind: 'workspace', path: 'homeOffice.cleaning' } },
      { label: 'Alarm system', source: { kind: 'workspace', path: 'homeOffice.alarm' } },
    ],
  },
]

// The sections that contribute to the headline "Total Schedule C deductions"
// number. Excludes Home Office (pro-rata), Auto (mileage-based), Travel
// (mixed with workspace fields), and the SE-health/retirement items which
// belong above the line.
export const SECTIONS_IN_SCHEDULE_C_TOTAL = new Set([
  'Operating & Administrative Expenses',
  'Communication Expenses',
  'Direct Sales Expenses',
  'Professional Expenses',
  'Equipment',
])
