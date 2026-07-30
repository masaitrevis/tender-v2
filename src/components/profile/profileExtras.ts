/**
 * Extended Company Profile fields (v2.0 "easy editor").
 *
 * The store's `CompanyProfile` shape only covers the letterhead essentials
 * (name, contacts, one bank account, logo/signature/stamp). The v2.0 profile
 * editor design (profile.md) adds trading name, tax/registration certificates
 * with expiry tracking, repeatable bank accounts, M-Pesa details, directors,
 * and branding options. These extras are persisted INTO the same profile
 * object via `updateProfile` (additive keys — the store itself is untouched),
 * and read back through this module so every consumer gets sane defaults.
 */
import type { CompanyProfile } from '@/lib/store';

export interface BankAccount {
  id: string;
  bankName: string;
  branch: string;
  accountName: string;
  accountNumber: string;
  swift: string;
  primary: boolean;
}

export type MpesaType = 'paybill' | 'till' | 'sendmoney';

export interface MpesaDetails {
  type: MpesaType;
  number: string;
  accountName: string;
}

export interface Director {
  id: string;
  name: string;
  idNumber: string;
  role: string;
  phone: string;
  email: string;
  signatureData?: string; // base64
  canSign: boolean;
}

export interface ProfileExtras {
  /* Company Details */
  tradingName: string;
  companyType: string; // Ltd / LLP / Sole Proprietor / Partnership
  yearFounded: string;
  altPhone: string;
  county: string;
  /* Tax & Registration */
  cr12Ref: string;
  businessPermitNo: string;
  businessPermitExpiry: string;
  taxComplianceNo: string;
  taxComplianceExpiry: string;
  agpoCategory: string; // Youth / Women / PWD / None
  agpoCertNo: string;
  agpoExpiry: string;
  ncaClass: string;
  ncaExpiry: string;
  /* Bank & M-Pesa */
  bankAccounts: BankAccount[];
  mpesa: MpesaDetails;
  /* Directors */
  directors: Director[];
  /* Branding */
  accentColor: string; // hex — letterhead header accent
  goldRule: boolean; // gold rule under the header
  footerText: string;
}

export type FullProfile = CompanyProfile & ProfileExtras;

export const KENYAN_BANKS = [
  'KCB Bank Kenya Ltd',
  'Equity Bank Kenya',
  'Co-operative Bank of Kenya',
  'Absa Bank Kenya',
  'Stanbic Bank Kenya',
  'NCBA Bank Kenya',
  'Standard Chartered Kenya',
  'Diamond Trust Bank',
  'I&M Bank Kenya',
  'Family Bank',
];

export const KENYAN_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Machakos', 'Uasin Gishu',
  'Nyeri', 'Kakamega', 'Kilifi', 'Kwale', 'Meru', 'Embu', 'Garissa', 'Turkana',
  'Kajiado', 'Bungoma', 'Busia', 'Siaya', 'Homa Bay', 'Migori', 'Kisii',
  'Nyamira', 'Kericho', 'Bomet', 'Nandi', 'Elgeyo-Marakwet', 'West Pokot',
  'Trans Nzoia', 'Laikipia', 'Isiolo', 'Marsabit', 'Mandera', 'Wajir', 'Tana River',
  'Lamu', 'Taita-Taveta', 'Makueni', 'Kitui', 'Tharaka-Nithi', "Murang'a",
  'Kirinyaga', 'Nyandarua', 'Samburu', 'Baringo', 'Vihiga',
];

export const COMPANY_TYPES = ['Limited Company (Ltd)', 'LLP', 'Sole Proprietor', 'Partnership'];
export const AGPO_CATEGORIES = ['Youth', 'Women', 'PWD', 'None'];
export const DIRECTOR_ROLES = ['Managing Director', 'Director', 'Company Secretary'];
export const NCA_CLASSES = ['NCA1', 'NCA2', 'NCA3', 'NCA4', 'NCA5', 'NCA6', 'NCA7', 'NCA8'];

export const ACCENT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Navy', hex: '#1F3B57' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Gold', hex: '#C9A227' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Charcoal', hex: '#1A2B3C' },
];

function defaultBankAccounts(p: CompanyProfile): BankAccount[] {
  return [
    {
      id: 'bank-001',
      bankName: p.bankName,
      branch: p.bankBranch,
      accountName: p.name,
      accountNumber: p.bankAccount,
      swift: p.bankSwift,
      primary: true,
    },
  ];
}

/** Read the profile with all v2.0 extras filled with sensible defaults. */
export function getFullProfile(p: CompanyProfile): FullProfile {
  const x = p as CompanyProfile & Partial<ProfileExtras>;
  return {
    ...p,
    tradingName: x.tradingName ?? '',
    companyType: x.companyType ?? 'Limited Company (Ltd)',
    yearFounded: x.yearFounded ?? '',
    altPhone: x.altPhone ?? '',
    county: x.county ?? 'Nairobi',
    cr12Ref: x.cr12Ref ?? '',
    businessPermitNo: x.businessPermitNo ?? '',
    businessPermitExpiry: x.businessPermitExpiry ?? '',
    taxComplianceNo: x.taxComplianceNo ?? '',
    taxComplianceExpiry: x.taxComplianceExpiry ?? '',
    agpoCategory: x.agpoCategory ?? 'None',
    agpoCertNo: x.agpoCertNo ?? '',
    agpoExpiry: x.agpoExpiry ?? '',
    ncaClass: x.ncaClass ?? '',
    ncaExpiry: x.ncaExpiry ?? '',
    bankAccounts:
      Array.isArray(x.bankAccounts) && x.bankAccounts.length > 0
        ? x.bankAccounts
        : defaultBankAccounts(p),
    mpesa: x.mpesa ?? { type: 'paybill', number: '', accountName: p.name },
    directors: Array.isArray(x.directors) ? x.directors : [],
    accentColor: x.accentColor ?? '#1F3B57',
    goldRule: x.goldRule ?? true,
    footerText: x.footerText ?? 'Thank you for doing business with us.',
  };
}

/** Scalar (autosaved) keys — everything that is NOT a structural list. */
export const SCALAR_KEYS: Array<keyof FullProfile> = [
  'name', 'tagline', 'tradingName', 'companyType', 'yearFounded',
  'phone', 'altPhone', 'email', 'website',
  'address', 'city', 'county', 'poBox', 'country',
  'kraPin', 'vatNo', 'regNo', 'cr12Ref',
  'businessPermitNo', 'businessPermitExpiry', 'taxComplianceNo', 'taxComplianceExpiry',
  'agpoCategory', 'agpoCertNo', 'agpoExpiry', 'ncaClass', 'ncaExpiry',
  'bankName', 'bankBranch', 'bankAccount', 'bankSwift',
  'logoData', 'signatureData', 'stampData',
  'accentColor', 'goldRule', 'footerText',
];

/** Structural keys require the explicit "Save changes" bar. */
export const STRUCTURAL_KEYS: Array<keyof FullProfile> = ['bankAccounts', 'mpesa', 'directors'];

export function pickScalars(p: FullProfile): Partial<FullProfile> {
  const out: Partial<FullProfile> = {};
  SCALAR_KEYS.forEach((k) => {
    (out as Record<string, unknown>)[k] = p[k];
  });
  return out;
}

export function pickStructural(p: FullProfile): Partial<FullProfile> {
  const out: Partial<FullProfile> = {};
  STRUCTURAL_KEYS.forEach((k) => {
    (out as Record<string, unknown>)[k] = p[k];
  });
  return out;
}

/** KRA PIN format: letter + 9 digits + letter, e.g. P051234567X. */
export function isValidKraPin(pin: string): boolean {
  return /^[A-Z]\d{9}[A-Z]$/.test(pin.trim().toUpperCase());
}

export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
