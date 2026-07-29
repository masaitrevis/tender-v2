/**
 * FBV Tender & Contract Management System v2.0 — central data layer.
 *
 * Single localStorage-persisted store with seeded Kenyan demo data.
 * Any page imports `useStore()` to read state and the typed helpers
 * (`addItem`, `updateItem`, `removeItem`, `mutateStore`) to mutate it —
 * every mutation automatically appends an AuditTrail entry and a
 * Recent Activity entry and persists to localStorage.
 */
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ClientType = 'Government' | 'County Government' | 'Parastatal' | 'Corporate' | 'NGO';
export type EntityStatus = 'Active' | 'Inactive';

export interface Client {
  id: string;
  code: string; // FBV-CLI-001
  name: string;
  type: ClientType;
  contactPerson: string;
  email: string;
  phone: string; // +254…
  kraPin: string;
  address: string;
  city: string;
  status: EntityStatus;
  notes?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string; // FBV-SUP-001
  name: string;
  category: string;
  contactPerson: string;
  email: string;
  phone: string;
  kraPin: string;
  address: string;
  city: string;
  status: EntityStatus;
  rating?: number; // 1–5
  notes?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  code: string; // FBV-PRD-001
  name: string;
  category: string;
  unit: string; // pcs, box, set, service…
  costPrice: number;
  sellingPrice: number;
  vatRate: number; // 16
  stockQty?: number;
  status: EntityStatus;
  createdAt: string;
}

export interface Employee {
  id: string;
  code: string; // FBV-EMP-001
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  kraPin: string;
  status: EntityStatus;
  hiredAt: string;
}

export type TenderStatus = 'Open' | 'Submitted' | 'Under Evaluation' | 'Won' | 'Lost' | 'Cancelled';

export interface Tender {
  id: string;
  refNo: string; // FBV-TND-2026-001
  title: string;
  clientId: string;
  category: string;
  status: TenderStatus;
  value: number;
  publishedDate: string;
  submissionDeadline: string;
  awardDate?: string;
  notes?: string;
  createdAt: string;
}

export type DocType = 'quotation' | 'proforma' | 'invoice' | 'receipt' | 'purchase-order' | 'contract';
export type DocStatus =
  | 'Draft'
  | 'Issued'
  | 'Sent'
  | 'Partly Paid'
  | 'Paid'
  | 'Overdue'
  | 'Cancelled';

export interface DocumentLine {
  id: string;
  productId?: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface FbvDocument {
  id: string;
  docNo: string; // FBV-QUO-2026-003
  type: DocType;
  clientId: string;
  tenderId?: string;
  issueDate: string;
  dueDate?: string;
  status: DocStatus;
  lines: DocumentLine[];
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  convertedFromId?: string;
  notes?: string;
  createdAt: string;
}

export type PaymentMethod = 'M-Pesa' | 'RTGS' | 'Bank Transfer' | 'Cheque' | 'Cash';

export interface Payment {
  id: string;
  refNo: string; // FBV-PAY-2026-001
  invoiceId: string;
  clientId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string; // M-Pesa / RTGS / cheque reference
  notes?: string;
}

export type DeadlineType =
  | 'submission'
  | 'invoice'
  | 'milestone'
  | 'clarification'
  | 'license'
  | 'certification'
  | 'bond'
  | 'other';

export interface Deadline {
  id: string;
  title: string;
  clientId?: string;
  clientName?: string;
  date: string;
  type: DeadlineType;
  status: 'open' | 'done';
  sourceRef?: string;
}

export type BondStatus = 'Active' | 'Released' | 'Expired';

export interface Bond {
  id: string;
  refNo: string; // FBV-BND-2026-001
  tenderId?: string;
  tenderTitle: string;
  kind: 'Bid Bond' | 'Performance Bond' | 'Advance Payment Guarantee';
  issuer: string;
  amount: number;
  issueDate: string;
  expiryDate: string;
  status: BondStatus;
}

export type MilestoneStatus = 'Pending' | 'In Progress' | 'Complete' | 'Overdue';

export interface ContractMilestone {
  id: string;
  contractId: string;
  contractTitle: string;
  clientId: string;
  title: string;
  dueDate: string;
  amount?: number;
  status: MilestoneStatus;
  completedDate?: string;
}

export interface Risk {
  id: string;
  refNo: string; // FBV-RSK-001
  title: string;
  description: string;
  category: string;
  likelihood: number; // 1–5
  impact: number; // 1–5
  owner: string;
  status: 'Open' | 'Mitigating' | 'Closed';
  createdAt: string;
}

export interface Approval {
  id: string;
  refNo: string; // FBV-APR-2026-001
  type: string; // e.g. 'Purchase Order', 'Credit Note', 'Discount'
  title: string;
  amount?: number;
  requestedBy: string;
  requestedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decidedBy?: string;
  decidedAt?: string;
  notes?: string;
}

export interface CRMEntry {
  id: string;
  clientId: string;
  date: string;
  channel: 'Call' | 'Email' | 'Meeting' | 'Site Visit' | 'WhatsApp';
  subject: string;
  notes: string;
  user: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string; // Created / Updated / Deleted / Submitted …
  entity: string; // Clients / Tenders / Invoice …
  entityRef: string; // mono ref or name
  details: string;
}

export type DmsDocType = 'license' | 'certification' | 'permit' | 'registration' | 'insurance' | 'other';

export interface DmsDocument {
  id: string;
  docType: DmsDocType;
  refNo: string;
  title: string;
  issuer: string;
  issueDate: string;
  expiryDate?: string;
  fileName: string;
  fileData: string; // base64 (capped at 2 MB)
  version: string;
  notes?: string;
  createdAt: string;
}

export interface CompanyProfile {
  name: string;
  tagline: string;
  kraPin: string;
  regNo: string;
  vatNo?: string;
  poBox: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  bankSwift: string;
  logoData?: string; // base64
  signatureData?: string; // base64
  stampData?: string; // base64
}

export interface Settings {
  vatRate: number; // 16
  currency: 'KES';
  warningDays: number; // 30
  criticalDays: number; // 7
  uploadCapMB: number; // 2
  docPrefixes: Record<string, string>; // quotation -> FBV-QUO
  docYear: number; // 2026
}

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Finance' | 'Officer' | 'Viewer';
  status: EntityStatus;
  avatarColor: string; // hex
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  verb: string; // Created / Submitted / Issued / Received payment / Marked Won …
  verbColor: 'grey' | 'blue' | 'navy' | 'green' | 'gold' | 'red';
  ref: string; // FBV-QUO-2026-003
  text: string;
  user: string;
}

export interface AppState {
  version: number;
  seededAt: string;
  clients: Client[];
  suppliers: Supplier[];
  products: Product[];
  employees: Employee[];
  tenders: Tender[];
  documents: FbvDocument[];
  payments: Payment[];
  deadlines: Deadline[];
  bonds: Bond[];
  milestones: ContractMilestone[];
  risks: Risk[];
  approvals: Approval[];
  crm: CRMEntry[];
  audit: AuditEntry[];
  dms: DmsDocument[];
  users: User[];
  activity: ActivityEntry[];
  profile: CompanyProfile;
  settings: Settings;
}

export type CollectionKey =
  | 'clients'
  | 'suppliers'
  | 'products'
  | 'employees'
  | 'tenders'
  | 'documents'
  | 'payments'
  | 'deadlines'
  | 'bonds'
  | 'milestones'
  | 'risks'
  | 'approvals'
  | 'crm'
  | 'audit'
  | 'dms'
  | 'users'
  | 'activity';

export type AlertLevel = 'OK' | 'WARNING' | 'CRITICAL' | 'EXPIRED';

/** Fixed demo "today" so countdowns match the seeded mid-2026 scenario. */
export const TODAY = '2026-07-30';
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB cap for uploads

/* ------------------------------------------------------------------ */
/* Seed data (mirrors the live site — mid-2026, Kenya)                 */
/* ------------------------------------------------------------------ */

let seq = 0;
const sid = (p: string) => `${p}-${(++seq).toString(36).padStart(4, '0')}`;

function seedState(): AppState {
  const clients: Client[] = [
    { id: 'cli-001', code: 'FBV-CLI-001', name: 'Ministry of Health', type: 'Government', contactPerson: 'Dr. Peter Njoroge', email: 'procurement@health.go.ke', phone: '+254 20 271 7077', kraPin: 'P051100001A', address: 'Afya House, Cathedral Road', city: 'Nairobi', status: 'Active', createdAt: '2025-02-10T09:00:00' },
    { id: 'cli-002', code: 'FBV-CLI-002', name: 'Safaricom PLC', type: 'Corporate', contactPerson: 'Grace Wambui', email: 'supplychain@safaricom.co.ke', phone: '+254 722 002 100', kraPin: 'P051100002B', address: 'Safaricom House, Waiyaki Way', city: 'Nairobi', status: 'Active', createdAt: '2025-03-04T10:30:00' },
    { id: 'cli-003', code: 'FBV-CLI-003', name: 'Kenya Ports Authority', type: 'Parastatal', contactPerson: 'Eng. John Mwangi', email: 'tenders@kpa.co.ke', phone: '+254 41 211 2999', kraPin: 'P051100003C', address: 'KPA Headquarters, Moi Avenue', city: 'Mombasa', status: 'Active', createdAt: '2025-04-18T08:15:00' },
    { id: 'cli-004', code: 'FBV-CLI-004', name: 'Kisumu County Government', type: 'County Government', contactPerson: 'Mary Atieno', email: 'procurement@kisumu.go.ke', phone: '+254 57 202 0800', kraPin: 'P051100004D', address: 'Prosperity House, Oginga Odinga Road', city: 'Kisumu', status: 'Active', createdAt: '2025-05-22T11:00:00' },
    { id: 'cli-005', code: 'FBV-CLI-005', name: 'Mombasa County Government', type: 'County Government', contactPerson: 'Ali Hassan', email: 'supply@mombasa.go.ke', phone: '+254 41 231 1531', kraPin: 'P051100005E', address: 'County Headquarters, Moi Avenue', city: 'Mombasa', status: 'Active', createdAt: '2025-06-30T14:20:00' },
    { id: 'cli-006', code: 'FBV-CLI-006', name: 'Nairobi City County', type: 'County Government', contactPerson: 'Esther Nyambura', email: 'procurement@nairobi.go.ke', phone: '+254 20 222 2481', kraPin: 'P051100006F', address: 'City Hall, City Hall Way', city: 'Nairobi', status: 'Active', createdAt: '2025-07-15T09:45:00' },
    { id: 'cli-007', code: 'FBV-CLI-007', name: 'Kenya Power & Lighting Co.', type: 'Parastatal', contactPerson: 'Samuel Kiprop', email: 'tenders@kplc.co.ke', phone: '+254 20 320 1000', kraPin: 'P051100007G', address: 'Stima Plaza, Kolobot Road', city: 'Nairobi', status: 'Active', createdAt: '2025-09-02T13:10:00' },
    { id: 'cli-008', code: 'FBV-CLI-008', name: 'Kenya Railways Corporation', type: 'Parastatal', contactPerson: 'Lucy Muthoni', email: 'procurement@krc.co.ke', phone: '+254 20 221 4610', kraPin: 'P051100008H', address: 'Railways Headquarters, Haile Selassie Ave', city: 'Nairobi', status: 'Active', createdAt: '2025-10-11T10:00:00' },
    { id: 'cli-009', code: 'FBV-CLI-009', name: 'World Vision Kenya', type: 'NGO', contactPerson: 'James Otieno', email: 'kenya_procurement@wvi.org', phone: '+254 20 883 6520', kraPin: 'P051100009J', address: 'Karen Road, Karen', city: 'Nairobi', status: 'Active', createdAt: '2026-01-20T15:30:00' },
  ];

  const suppliers: Supplier[] = [
    { id: 'sup-001', code: 'FBV-SUP-001', name: 'Davis & Shirtliff Ltd', category: 'Equipment & Machinery', contactPerson: 'Charles Mbugua', email: 'sales@dayliff.com', phone: '+254 20 696 8000', kraPin: 'P051200001A', address: 'Industrial Area, Dundori Road', city: 'Nairobi', status: 'Active', rating: 5, createdAt: '2025-02-12T09:00:00' },
    { id: 'sup-002', code: 'FBV-SUP-002', name: 'Text Book Centre Ltd', category: 'Stationery & Office Supplies', contactPerson: 'Anne Wairimu', email: 'corporate@tbc.co.ke', phone: '+254 730 175 000', kraPin: 'P051200002B', address: 'Kijabe Street', city: 'Nairobi', status: 'Active', rating: 4, createdAt: '2025-03-19T10:00:00' },
    { id: 'sup-003', code: 'FBV-SUP-003', name: 'Securex Agencies (K) Ltd', category: 'Security & Surveillance', contactPerson: 'David Karanja', email: 'info@securex.co.ke', phone: '+254 20 260 2000', kraPin: 'P051200003C', address: 'Securex House, Enterprise Road', city: 'Nairobi', status: 'Active', rating: 4, createdAt: '2025-05-08T11:30:00' },
    { id: 'sup-004', code: 'FBV-SUP-004', name: 'Nakumatt Office Solutions', category: 'Furniture & Fittings', contactPerson: 'Rose Auma', email: 'sales@nakumatt-office.co.ke', phone: '+254 722 445 566', kraPin: 'P051200004D', address: 'Likoni Road, Industrial Area', city: 'Nairobi', status: 'Active', rating: 3, createdAt: '2025-08-14T08:45:00' },
    { id: 'sup-005', code: 'FBV-SUP-005', name: 'CompuLynx Ltd', category: 'ICT Equipment', contactPerson: 'Brian Kiptoo', email: 'orders@compulynx.co.ke', phone: '+254 20 386 1100', kraPin: 'P051200005E', address: 'Westlands, Woodvale Grove', city: 'Nairobi', status: 'Active', rating: 5, createdAt: '2025-11-05T14:00:00' },
    { id: 'sup-006', code: 'FBV-SUP-006', name: 'Ramco Printing Works', category: 'Printing & Branding', contactPerson: 'Fatuma Said', email: 'quotes@ramcoprint.co.ke', phone: '+254 733 610 200', kraPin: 'P051200006F', address: 'Bunyala Road', city: 'Nairobi', status: 'Inactive', rating: 3, createdAt: '2026-02-01T09:20:00' },
  ];

  const products: Product[] = [
    { id: 'prd-001', code: 'FBV-PRD-001', name: 'HP EliteBook 840 G10 Laptop', category: 'ICT Equipment', unit: 'pcs', costPrice: 145000, sellingPrice: 178000, vatRate: 16, stockQty: 12, status: 'Active', createdAt: '2025-03-01T08:00:00' },
    { id: 'prd-002', code: 'FBV-PRD-002', name: 'Canon imageRUNNER 2645i Copier', category: 'Office Machines', unit: 'pcs', costPrice: 385000, sellingPrice: 462000, vatRate: 16, stockQty: 3, status: 'Active', createdAt: '2025-03-01T08:00:00' },
    { id: 'prd-003', code: 'FBV-PRD-003', name: 'Ergonomic Office Chair (High Back)', category: 'Furniture', unit: 'pcs', costPrice: 18500, sellingPrice: 26500, vatRate: 16, stockQty: 45, status: 'Active', createdAt: '2025-04-10T08:00:00' },
    { id: 'prd-004', code: 'FBV-PRD-004', name: 'A4 Printing Paper 80gsm (Box of 5 Reams)', category: 'Stationery', unit: 'box', costPrice: 2450, sellingPrice: 3200, vatRate: 16, stockQty: 300, status: 'Active', createdAt: '2025-04-10T08:00:00' },
    { id: 'prd-005', code: 'FBV-PRD-005', name: 'CCTV Surveillance Kit (16-Channel, 8 Cameras)', category: 'Security Systems', unit: 'set', costPrice: 185000, sellingPrice: 248000, vatRate: 16, stockQty: 6, status: 'Active', createdAt: '2025-06-20T08:00:00' },
    { id: 'prd-006', code: 'FBV-PRD-006', name: 'Diesel Generator 20kVA (Silent, ATS)', category: 'Power Equipment', unit: 'pcs', costPrice: 685000, sellingPrice: 845000, vatRate: 16, stockQty: 2, status: 'Active', createdAt: '2025-07-30T08:00:00' },
    { id: 'prd-007', code: 'FBV-PRD-007', name: 'Medical Examination Gloves (Carton of 1000)', category: 'Medical Consumables', unit: 'carton', costPrice: 9800, sellingPrice: 14200, vatRate: 16, stockQty: 150, status: 'Active', createdAt: '2025-09-15T08:00:00' },
    { id: 'prd-008', code: 'FBV-PRD-008', name: 'Conference Table (12-Seater, Mahogany)', category: 'Furniture', unit: 'pcs', costPrice: 78000, sellingPrice: 112000, vatRate: 16, stockQty: 4, status: 'Active', createdAt: '2025-10-02T08:00:00' },
  ];

  const employees: Employee[] = [
    { id: 'emp-001', code: 'FBV-EMP-001', name: 'Admin User', role: 'System Administrator', department: 'Management', email: 'admin@fbv.co.ke', phone: '+254 700 000 001', kraPin: 'A001234567X', status: 'Active', hiredAt: '2024-01-08' },
    { id: 'emp-002', code: 'FBV-EMP-002', name: 'Caroline Wanjiru', role: 'Tender Manager', department: 'Tenders & Bids', email: 'c.wanjiru@fbv.co.ke', phone: '+254 722 345 678', kraPin: 'A002345678Y', status: 'Active', hiredAt: '2024-03-18' },
    { id: 'emp-003', code: 'FBV-EMP-003', name: 'Daniel Mutiso', role: 'Finance Officer', department: 'Finance', email: 'd.mutiso@fbv.co.ke', phone: '+254 733 456 789', kraPin: 'A003456789Z', status: 'Active', hiredAt: '2024-06-03' },
    { id: 'emp-004', code: 'FBV-EMP-004', name: 'Faith Achieng', role: 'Procurement Officer', department: 'Procurement', email: 'f.achieng@fbv.co.ke', phone: '+254 711 567 890', kraPin: 'A004567890A', status: 'Active', hiredAt: '2024-09-23' },
    { id: 'emp-005', code: 'FBV-EMP-005', name: 'Kevin Omondi', role: 'Sales Executive', department: 'Sales', email: 'k.omondi@fbv.co.ke', phone: '+254 745 678 901', kraPin: 'A005678901B', status: 'Active', hiredAt: '2025-02-10' },
    { id: 'emp-006', code: 'FBV-EMP-006', name: 'Mercy Njeri', role: 'Document Controller', department: 'Compliance', email: 'm.njeri@fbv.co.ke', phone: '+254 708 789 012', kraPin: 'A006789012C', status: 'Active', hiredAt: '2025-05-19' },
  ];

  const tenders: Tender[] = [
    { id: 'tnd-001', refNo: 'FBV-TND-2026-001', title: 'Supply & Delivery of Medical Consumables (Framework)', clientId: 'cli-001', category: 'Medical Supplies', status: 'Won', value: 4850000, publishedDate: '2026-01-15', submissionDeadline: '2026-02-10', awardDate: '2026-03-20', createdAt: '2026-01-16T09:00:00' },
    { id: 'tnd-002', refNo: 'FBV-TND-2026-002', title: 'Installation of CCTV Surveillance System — City Hall Annex', clientId: 'cli-006', category: 'Security Systems', status: 'Won', value: 2780000, publishedDate: '2026-02-02', submissionDeadline: '2026-03-05', awardDate: '2026-04-14', createdAt: '2026-02-03T10:00:00' },
    { id: 'tnd-003', refNo: 'FBV-TND-2026-003', title: 'Supply of Forklift Spare Parts — Port of Mombasa', clientId: 'cli-003', category: 'Mechanical Parts', status: 'Lost', value: 8900000, publishedDate: '2026-02-20', submissionDeadline: '2026-03-25', createdAt: '2026-02-21T11:00:00' },
    { id: 'tnd-004', refNo: 'FBV-TND-2026-004', title: 'Smart Meter Installation Support Services', clientId: 'cli-007', category: 'Energy Services', status: 'Lost', value: 3730000, publishedDate: '2026-03-10', submissionDeadline: '2026-04-08', createdAt: '2026-03-11T09:30:00' },
    { id: 'tnd-005', refNo: 'FBV-TND-2026-005', title: 'Catering Services Framework Agreement (3 Years)', clientId: 'cli-005', category: 'Hospitality', status: 'Open', value: 14500000, publishedDate: '2026-07-06', submissionDeadline: '2026-08-10', createdAt: '2026-07-07T08:00:00' },
    { id: 'tnd-006', refNo: 'FBV-TND-2026-006', title: 'Supply of Concrete Railway Sleepers', clientId: 'cli-008', category: 'Construction Materials', status: 'Open', value: 18500000, publishedDate: '2026-07-14', submissionDeadline: '2026-08-21', createdAt: '2026-07-15T09:00:00' },
    { id: 'tnd-007', refNo: 'FBV-TND-2026-007', title: 'School Furniture — Western Kenya Education Project', clientId: 'cli-009', category: 'Furniture', status: 'Open', value: 6000000, publishedDate: '2026-07-20', submissionDeadline: '2026-08-14', createdAt: '2026-07-21T10:30:00' },
    { id: 'tnd-008', refNo: 'FBV-TND-2026-008', title: 'Supply of Branded Corporate Merchandise', clientId: 'cli-002', category: 'Branding', status: 'Submitted', value: 3200000, publishedDate: '2026-06-18', submissionDeadline: '2026-07-24', createdAt: '2026-06-19T08:30:00' },
    { id: 'tnd-009', refNo: 'FBV-TND-2026-009', title: 'Supply of Laboratory Reagents & Test Kits', clientId: 'cli-001', category: 'Medical Supplies', status: 'Under Evaluation', value: 5400000, publishedDate: '2026-06-02', submissionDeadline: '2026-06-30', createdAt: '2026-06-03T09:00:00' },
    { id: 'tnd-010', refNo: 'FBV-TND-2026-010', title: 'Road Maintenance Materials — Kisumu Urban Roads', clientId: 'cli-004', category: 'Construction Materials', status: 'Cancelled', value: 2100000, publishedDate: '2026-05-05', submissionDeadline: '2026-06-02', createdAt: '2026-05-06T08:00:00' },
  ];

  const line = (productId: string | undefined, description: string, qty: number, unit: string, unitPrice: number): DocumentLine =>
    ({ id: sid('ln'), productId, description, qty, unit, unitPrice, amount: qty * unitPrice });

  const mkDoc = (d: Omit<FbvDocument, 'subtotal' | 'vatAmount' | 'total'>): FbvDocument => {
    const subtotal = d.lines.reduce((s, l) => s + l.amount, 0);
    const vatAmount = Math.round(subtotal * 0.16 * 100) / 100;
    return { ...d, subtotal, vatAmount, total: subtotal + vatAmount };
  };

  const documents: FbvDocument[] = [
    mkDoc({ id: 'doc-001', docNo: 'FBV-QUO-2026-001', type: 'quotation', clientId: 'cli-009', tenderId: 'tnd-007', issueDate: '2026-07-22', dueDate: '2026-08-05', status: 'Sent', amountPaid: 0, createdAt: '2026-07-22T10:00:00',
      lines: [line('prd-003', 'Ergonomic Office Chair (High Back)', 40, 'pcs', 26500), line('prd-008', 'Conference Table (12-Seater, Mahogany)', 6, 'pcs', 112000)] }),
    mkDoc({ id: 'doc-002', docNo: 'FBV-QUO-2026-002', type: 'quotation', clientId: 'cli-005', tenderId: 'tnd-005', issueDate: '2026-07-25', dueDate: '2026-08-08', status: 'Sent', amountPaid: 0, createdAt: '2026-07-25T09:00:00',
      lines: [line(undefined, 'Catering services — monthly retainer (36 months)', 36, 'month', 335000)] }),
    mkDoc({ id: 'doc-003', docNo: 'FBV-QUO-2026-003', type: 'quotation', clientId: 'cli-008', tenderId: 'tnd-006', issueDate: '2026-07-27', dueDate: '2026-08-10', status: 'Issued', amountPaid: 0, createdAt: '2026-07-27T20:04:00',
      lines: [line(undefined, 'Concrete railway sleepers (pre-stressed)', 5000, 'pcs', 2900), line(undefined, 'Delivery & handling — Nairobi to Voi', 1, 'lot', 480000)] }),
    mkDoc({ id: 'doc-004', docNo: 'FBV-PRO-2026-001', type: 'proforma', clientId: 'cli-006', tenderId: 'tnd-002', issueDate: '2026-04-20', status: 'Paid', amountPaid: 0, createdAt: '2026-04-20T11:00:00',
      lines: [line('prd-005', 'CCTV Surveillance Kit (16-Channel, 8 Cameras)', 4, 'set', 248000)] }),
    mkDoc({ id: 'doc-005', docNo: 'FBV-INV-2026-001', type: 'invoice', clientId: 'cli-001', tenderId: 'tnd-001', issueDate: '2026-05-10', dueDate: '2026-06-09', status: 'Paid', amountPaid: 0, createdAt: '2026-05-10T09:00:00',
      lines: [line('prd-007', 'Medical Examination Gloves (Carton of 1000)', 88, 'carton', 14200)] }),
    mkDoc({ id: 'doc-006', docNo: 'FBV-INV-2026-002', type: 'invoice', clientId: 'cli-004', issueDate: '2026-05-30', dueDate: '2026-06-29', status: 'Overdue', amountPaid: 0, createdAt: '2026-05-30T10:00:00',
      lines: [line('prd-004', 'A4 Printing Paper 80gsm (Box of 5 Reams)', 131, 'box', 3200)] }),
    mkDoc({ id: 'doc-007', docNo: 'FBV-INV-2026-003', type: 'invoice', clientId: 'cli-002', issueDate: '2026-06-09', dueDate: '2026-07-09', status: 'Overdue', amountPaid: 300000, createdAt: '2026-06-09T14:00:00',
      lines: [line('prd-001', 'HP EliteBook 840 G10 Laptop', 4, 'pcs', 175000)] }),
    mkDoc({ id: 'doc-008', docNo: 'FBV-INV-2026-004', type: 'invoice', clientId: 'cli-001', tenderId: 'tnd-001', issueDate: '2026-06-20', dueDate: '2026-07-20', status: 'Overdue', amountPaid: 0, createdAt: '2026-06-20T09:30:00',
      lines: [line(undefined, 'Laboratory consumables — phase 1 delivery', 1, 'lot', 336207)] }),
    mkDoc({ id: 'doc-009', docNo: 'FBV-INV-2026-005', type: 'invoice', clientId: 'cli-006', tenderId: 'tnd-002', issueDate: '2026-07-15', dueDate: '2026-08-15', status: 'Issued', amountPaid: 0, createdAt: '2026-07-15T16:00:00',
      lines: [line(undefined, 'CCTV installation — milestone 1 (site survey & cabling)', 1, 'lot', 1000000)] }),
    mkDoc({ id: 'doc-010', docNo: 'FBV-RCT-2026-001', type: 'receipt', clientId: 'cli-001', issueDate: '2026-06-02', status: 'Paid', amountPaid: 0, createdAt: '2026-06-02T12:00:00',
      lines: [line(undefined, 'Payment received — FBV-INV-2026-001', 1, 'lot', 1250000)] }),
    mkDoc({ id: 'doc-011', docNo: 'FBV-PO-2026-001', type: 'purchase-order', clientId: 'sup-001', issueDate: '2026-07-18', dueDate: '2026-08-01', status: 'Issued', amountPaid: 0, createdAt: '2026-07-18T09:00:00',
      lines: [line('prd-006', 'Diesel Generator 20kVA (Silent, ATS)', 1, 'pcs', 685000)] }),
    mkDoc({ id: 'doc-012', docNo: 'FBV-CON-2026-001', type: 'contract', clientId: 'cli-001', tenderId: 'tnd-001', issueDate: '2026-03-25', status: 'Issued', amountPaid: 0, createdAt: '2026-03-25T10:00:00',
      lines: [line(undefined, 'Framework contract — medical consumables (12 months)', 1, 'lot', 4181035)] }),
    mkDoc({ id: 'doc-013', docNo: 'FBV-CON-2026-002', type: 'contract', clientId: 'cli-006', tenderId: 'tnd-002', issueDate: '2026-04-18', status: 'Issued', amountPaid: 0, createdAt: '2026-04-18T10:00:00',
      lines: [line(undefined, 'CCTV installation contract — City Hall Annex', 1, 'lot', 2396552)] }),
  ];

  const payments: Payment[] = [
    { id: 'pay-001', refNo: 'FBV-PAY-2026-001', invoiceId: 'doc-005', clientId: 'cli-001', date: '2026-06-02', amount: 1450000, method: 'RTGS', reference: 'RTGS-KCB-660214', notes: 'Full settlement of FBV-INV-2026-001' },
    { id: 'pay-002', refNo: 'FBV-PAY-2026-002', invoiceId: 'doc-007', clientId: 'cli-002', date: '2026-07-12', amount: 300000, method: 'M-Pesa', reference: 'QHK72TX9LM', notes: 'Part payment — balance follows' },
  ];

  const deadlines: Deadline[] = [
    { id: 'ddl-001', title: 'Follow up overdue invoice — Kisumu County', clientId: 'cli-004', clientName: 'Kisumu County Government', date: '2026-06-29', type: 'invoice', status: 'open', sourceRef: 'FBV-INV-2026-002' },
    { id: 'ddl-002', title: 'Follow up overdue invoice — Safaricom', clientId: 'cli-002', clientName: 'Safaricom PLC', date: '2026-07-09', type: 'invoice', status: 'open', sourceRef: 'FBV-INV-2026-003' },
    { id: 'ddl-003', title: 'Catering tender — clarification deadline', clientId: 'cli-005', clientName: 'Mombasa County Government', date: '2026-07-31', type: 'clarification', status: 'open', sourceRef: 'FBV-TND-2026-005' },
    { id: 'ddl-004', title: 'CCTV project — milestone 2 commissioning', clientId: 'cli-006', clientName: 'Nairobi City County', date: '2026-08-03', type: 'milestone', status: 'open', sourceRef: 'FBV-CON-2026-002' },
    { id: 'ddl-005', title: 'Mombasa catering bid — submission', clientId: 'cli-005', clientName: 'Mombasa County Government', date: '2026-08-10', type: 'submission', status: 'open', sourceRef: 'FBV-TND-2026-005' },
  ];

  const bonds: Bond[] = [
    { id: 'bnd-001', refNo: 'FBV-BND-2026-001', tenderId: 'tnd-001', tenderTitle: 'Supply & Delivery of Medical Consumables', kind: 'Performance Bond', issuer: 'KCB Bank Kenya', amount: 485000, issueDate: '2026-03-28', expiryDate: '2026-09-30', status: 'Active' },
    { id: 'bnd-002', refNo: 'FBV-BND-2026-002', tenderId: 'tnd-002', tenderTitle: 'CCTV Surveillance System — City Hall Annex', kind: 'Performance Bond', issuer: 'Equity Bank Kenya', amount: 139000, issueDate: '2026-04-20', expiryDate: '2026-08-05', status: 'Active' },
    { id: 'bnd-003', refNo: 'FBV-BND-2026-003', tenderId: 'tnd-003', tenderTitle: 'Supply of Forklift Spare Parts', kind: 'Bid Bond', issuer: 'Stanbic Bank Kenya', amount: 89000, issueDate: '2026-03-25', expiryDate: '2026-06-25', status: 'Expired' },
    { id: 'bnd-004', refNo: 'FBV-BND-2026-004', tenderId: 'tnd-004', tenderTitle: 'Smart Meter Installation Support', kind: 'Bid Bond', issuer: 'Co-operative Bank', amount: 74600, issueDate: '2026-04-08', expiryDate: '2026-07-08', status: 'Released' },
  ];

  const milestones: ContractMilestone[] = [
    { id: 'mil-001', contractId: 'doc-012', contractTitle: 'Medical consumables framework — MoH', clientId: 'cli-001', title: 'Phase 1 delivery (gloves & consumables)', dueDate: '2026-06-15', amount: 1450000, status: 'Complete', completedDate: '2026-06-02' },
    { id: 'mil-002', contractId: 'doc-012', contractTitle: 'Medical consumables framework — MoH', clientId: 'cli-001', title: 'Phase 2 delivery (laboratory consumables)', dueDate: '2026-08-20', amount: 1750000, status: 'In Progress' },
    { id: 'mil-003', contractId: 'doc-013', contractTitle: 'CCTV installation — Nairobi City County', clientId: 'cli-006', title: 'Site survey & cabling', dueDate: '2026-07-10', amount: 1160000, status: 'Complete', completedDate: '2026-07-08' },
    { id: 'mil-004', contractId: 'doc-013', contractTitle: 'CCTV installation — Nairobi City County', clientId: 'cli-006', title: 'Milestone 2 — commissioning & testing', dueDate: '2026-08-03', amount: 890000, status: 'In Progress' },
    { id: 'mil-005', contractId: 'doc-013', contractTitle: 'CCTV installation — Nairobi City County', clientId: 'cli-006', title: 'Handover & training', dueDate: '2026-09-01', amount: 730000, status: 'Pending' },
  ];

  const risks: Risk[] = [
    { id: 'rsk-001', refNo: 'FBV-RSK-001', title: 'Kisumu County payment default', description: 'Invoice FBV-INV-2026-002 now 31 days overdue; county cash-flow constraints reported.', category: 'Financial', likelihood: 4, impact: 4, owner: 'Daniel Mutiso', status: 'Mitigating', createdAt: '2026-07-05T09:00:00' },
    { id: 'rsk-002', refNo: 'FBV-RSK-002', title: 'Supplier lead-time slippage (medical consumables)', description: 'Imported reagents face 3-week port delays; may affect MoH phase 2 delivery.', category: 'Supply Chain', likelihood: 3, impact: 4, owner: 'Faith Achieng', status: 'Open', createdAt: '2026-07-11T10:00:00' },
    { id: 'rsk-003', refNo: 'FBV-RSK-003', title: 'Bid bond expiry before award decision', description: 'Nairobi CCTV performance bond expires 05 Aug; renewal needed if project overruns.', category: 'Compliance', likelihood: 2, impact: 3, owner: 'Mercy Njeri', status: 'Mitigating', createdAt: '2026-07-18T08:30:00' },
    { id: 'rsk-004', refNo: 'FBV-RSK-004', title: 'Tax Compliance Certificate lapse', description: 'TCC expires 05 Aug 2026; renewal filing must complete before catering tender submission.', category: 'Compliance', likelihood: 2, impact: 5, owner: 'Admin User', status: 'Open', createdAt: '2026-07-26T15:00:00' },
    { id: 'rsk-005', refNo: 'FBV-RSK-005', title: 'Forex exposure on ICT imports', description: 'KES/USD volatility may erode margins on EliteBook and copier pricing.', category: 'Financial', likelihood: 3, impact: 2, owner: 'Daniel Mutiso', status: 'Closed', createdAt: '2026-04-02T11:00:00' },
  ];

  const approvals: Approval[] = [
    { id: 'apr-001', refNo: 'FBV-APR-2026-001', type: 'Credit Note', title: 'Credit note — Safaricom part-payment reconciliation', amount: 12000, requestedBy: 'Daniel Mutiso', requestedAt: '2026-07-28T09:00:00', status: 'Pending' },
    { id: 'apr-002', refNo: 'FBV-APR-2026-002', type: 'Purchase Order', title: 'FBV-PO-2026-001 — Diesel generator 20kVA', amount: 794600, requestedBy: 'Faith Achieng', requestedAt: '2026-07-18T09:30:00', status: 'Pending' },
    { id: 'apr-003', refNo: 'FBV-APR-2026-003', type: 'Discount', title: '8% volume discount — Kenya Railways quotation', amount: 1316000, requestedBy: 'Kevin Omondi', requestedAt: '2026-07-27T18:00:00', status: 'Pending' },
    { id: 'apr-004', refNo: 'FBV-APR-2026-004', type: 'Write-off', title: 'Damaged stationery stock write-off', amount: 18400, requestedBy: 'Mercy Njeri', requestedAt: '2026-06-14T10:00:00', status: 'Approved', decidedBy: 'Admin User', decidedAt: '2026-06-15T08:00:00' },
  ];

  const crm: CRMEntry[] = [
    { id: 'crm-001', clientId: 'cli-002', date: '2026-07-26', channel: 'Call', subject: 'Overdue invoice follow-up', notes: 'Grace confirmed balance of FBV-INV-2026-003 will clear by 05 Aug.', user: 'Daniel Mutiso' },
    { id: 'crm-002', clientId: 'cli-005', date: '2026-07-25', channel: 'Meeting', subject: 'Catering framework pre-bid meeting', notes: 'Clarified SLA terms; addendum expected 31 Jul.', user: 'Caroline Wanjiru' },
    { id: 'crm-003', clientId: 'cli-008', date: '2026-07-27', channel: 'Email', subject: 'Railway sleepers quotation sent', notes: 'FBV-QUO-2026-003 issued with 8% discount pending approval.', user: 'Kevin Omondi' },
    { id: 'crm-004', clientId: 'cli-001', date: '2026-07-20', channel: 'Site Visit', subject: 'MoH warehouse inspection', notes: 'Phase 2 storage requirements confirmed for reagent delivery.', user: 'Faith Achieng' },
    { id: 'crm-005', clientId: 'cli-004', date: '2026-07-15', channel: 'Call', subject: 'Kisumu overdue payment escalation', notes: 'Mary committed to supplementary budget settlement in August.', user: 'Daniel Mutiso' },
    { id: 'crm-006', clientId: 'cli-009', date: '2026-07-22', channel: 'Email', subject: 'School furniture quotation', notes: 'FBV-QUO-2026-001 sent; World Vision board reviews 08 Aug.', user: 'Kevin Omondi' },
  ];

  const dms: DmsDocument[] = [
    { id: 'dms-001', docType: 'license', refNo: 'KRA-TCC-2025-88214', title: 'Tax Compliance Certificate', issuer: 'Kenya Revenue Authority', issueDate: '2025-08-05', expiryDate: '2026-08-05', fileName: 'tax-compliance-certificate-2025.pdf', fileData: '', version: 'v1.0', notes: 'Renewal filed 26 Jul 2026 — awaiting KRA issuance.', createdAt: '2025-08-06T09:00:00' },
    { id: 'dms-002', docType: 'certification', refNo: 'AGPO-2023-44710', title: 'AGPO Certificate (Youth & Women)', issuer: 'National Treasury — AGPO', issueDate: '2023-08-28', expiryDate: '2026-08-28', fileName: 'agpo-certificate.pdf', fileData: '', version: 'v2.0', notes: 'Renewal window opens 01 Aug 2026.', createdAt: '2023-08-29T10:00:00' },
    { id: 'dms-003', docType: 'permit', refNo: 'NCC-SBP-2026-33192', title: 'Single Business Permit', issuer: 'Nairobi City County', issueDate: '2026-01-15', expiryDate: '2026-12-31', fileName: 'single-business-permit-2026.pdf', fileData: '', version: 'v1.0', createdAt: '2026-01-16T08:00:00' },
    { id: 'dms-004', docType: 'registration', refNo: 'NCA-BLD-7712', title: 'NCA Registration — Building Works (NCA7)', issuer: 'National Construction Authority', issueDate: '2024-03-10', fileName: 'nca-registration.pdf', fileData: '', version: 'v1.0', createdAt: '2024-03-11T09:00:00' },
    { id: 'dms-005', docType: 'insurance', refNo: 'PI-CIC-2025-5501', title: 'Professional Indemnity Insurance', issuer: 'CIC Insurance Group', issueDate: '2025-09-30', expiryDate: '2026-09-30', fileName: 'professional-indemnity-2025.pdf', fileData: '', version: 'v1.0', createdAt: '2025-10-01T08:30:00' },
    { id: 'dms-006', docType: 'certification', refNo: 'ISO9001-KE-22841', title: 'ISO 9001:2015 QMS Certification', issuer: 'Kenya Bureau of Standards', issueDate: '2024-04-01', expiryDate: '2027-03-31', fileName: 'iso-9001-certificate.pdf', fileData: '', version: 'v1.0', createdAt: '2024-04-02T09:00:00' },
  ];

  const users: User[] = [
    { id: 'usr-001', name: 'Admin User', initials: 'AD', email: 'admin@fbv.co.ke', role: 'Admin', status: 'Active', avatarColor: '#C9A227' },
    { id: 'usr-002', name: 'Caroline Wanjiru', initials: 'CW', email: 'c.wanjiru@fbv.co.ke', role: 'Manager', status: 'Active', avatarColor: '#2563EB' },
    { id: 'usr-003', name: 'Daniel Mutiso', initials: 'DM', email: 'd.mutiso@fbv.co.ke', role: 'Finance', status: 'Active', avatarColor: '#16A34A' },
  ];

  const activity: ActivityEntry[] = [
    { id: 'act-006', timestamp: '2026-07-27T20:04:00', verb: 'Created', verbColor: 'grey', ref: 'FBV-QUO-2026-003', text: 'Quotation for Kenya Railways — concrete sleepers (KES 14.5M)', user: 'Admin User' },
    { id: 'act-005', timestamp: '2026-07-26T11:20:00', verb: 'Submitted', verbColor: 'blue', ref: 'FBV-TND-2026-008', text: 'Branded merchandise bid submitted to Safaricom', user: 'Caroline Wanjiru' },
    { id: 'act-004', timestamp: '2026-07-22T15:45:00', verb: 'Created', verbColor: 'grey', ref: 'FBV-QUO-2026-001', text: 'School furniture quotation for World Vision Kenya', user: 'Kevin Omondi' },
    { id: 'act-003', timestamp: '2026-07-15T16:00:00', verb: 'Issued', verbColor: 'navy', ref: 'FBV-INV-2026-005', text: 'Milestone 1 invoice to Nairobi City County', user: 'Daniel Mutiso' },
    { id: 'act-002', timestamp: '2026-07-12T10:35:00', verb: 'Received payment', verbColor: 'green', ref: 'FBV-PAY-2026-002', text: 'Part payment KES 300,000 from Safaricom (M-Pesa)', user: 'Daniel Mutiso' },
    { id: 'act-001', timestamp: '2026-07-06T09:10:00', verb: 'Marked Won', verbColor: 'gold', ref: 'FBV-TND-2026-002', text: 'CCTV surveillance tender — award letter received', user: 'Admin User' },
  ];

  const audit: AuditEntry[] = [
    { id: 'aud-004', timestamp: '2026-07-27T20:04:00', user: 'Admin User', action: 'Created', entity: 'Quotation', entityRef: 'FBV-QUO-2026-003', details: 'Quotation issued to Kenya Railways Corporation' },
    { id: 'aud-003', timestamp: '2026-07-26T11:20:00', user: 'Caroline Wanjiru', action: 'Submitted', entity: 'Tender', entityRef: 'FBV-TND-2026-008', details: 'Bid submitted — Safaricom branded merchandise' },
    { id: 'aud-002', timestamp: '2026-07-12T10:35:00', user: 'Daniel Mutiso', action: 'Created', entity: 'Payment', entityRef: 'FBV-PAY-2026-002', details: 'M-Pesa part payment applied to FBV-INV-2026-003' },
    { id: 'aud-001', timestamp: '2026-07-06T09:10:00', user: 'Admin User', action: 'Updated', entity: 'Tender', entityRef: 'FBV-TND-2026-002', details: 'Status changed to Won' },
  ];

  const profile: CompanyProfile = {
    name: 'Future Bright Ventures Ltd',
    tagline: 'Tender & Contract Management, Done Right.',
    kraPin: 'P051234567X',
    regNo: 'C.167890',
    vatNo: 'VAT-04711230',
    poBox: 'P.O. Box 45672-00100',
    address: 'Moi Avenue, Development House, 8th Floor',
    city: 'Nairobi',
    country: 'Kenya',
    phone: '+254 700 123 456',
    email: 'info@fbv.co.ke',
    website: 'www.fbv.co.ke',
    bankName: 'KCB Bank Kenya Ltd',
    bankBranch: 'Moi Avenue Branch',
    bankAccount: '1284567890',
    bankSwift: 'KCBLKENX',
  };

  const settings: Settings = {
    vatRate: 16,
    currency: 'KES',
    warningDays: 30,
    criticalDays: 7,
    uploadCapMB: 2,
    docYear: 2026,
    docPrefixes: {
      quotation: 'FBV-QUO',
      proforma: 'FBV-PRO',
      invoice: 'FBV-INV',
      receipt: 'FBV-RCT',
      'purchase-order': 'FBV-PO',
      contract: 'FBV-CON',
      tender: 'FBV-TND',
      payment: 'FBV-PAY',
    },
  };

  return {
    version: 1,
    seededAt: `${TODAY}T08:00:00`,
    clients, suppliers, products, employees, tenders, documents, payments,
    deadlines, bonds, milestones, risks, approvals, crm, audit, dms, users, activity,
    profile, settings,
  };
}

/* ------------------------------------------------------------------ */
/* Persistence + subscription engine                                   */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'fbv-tcms-v2-store';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === 1) return parsed;
    }
  } catch {
    /* corrupted storage — reseed */
  }
  const seeded = seedState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    /* storage full */
  }
  return seeded;
}

let state: AppState = load();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage quota exceeded — keep in-memory state; Settings shows a meter
    console.warn('FBV store: localStorage write failed (quota exceeded?)');
  }
}

/** React hook — re-renders the component whenever any part of the store changes. */
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Non-React read of the current state (charts, exports, helpers). */
export function getState(): AppState {
  return state;
}

/* ------------------------------------------------------------------ */
/* Mutation API — every mutation logs audit + recent activity          */
/* ------------------------------------------------------------------ */

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function nowISO(): string {
  // Demo clock anchored to the seeded mid-2026 scenario.
  const now = new Date();
  return `${TODAY}T${now.toTimeString().slice(0, 8)}`;
}

export interface MutationLog {
  user?: string;
  action?: string; // default Created/Updated/Deleted by helper
  entity?: string; // default derived from collection key
  entityRef?: string; // default item ref/code/docNo/name
  details?: string;
  verb?: string; // Recent Activity verb (defaults to action)
  verbColor?: ActivityEntry['verbColor'];
  text?: string; // Recent Activity text (defaults to details)
}

const ENTITY_LABEL: Record<string, string> = {
  clients: 'Client', suppliers: 'Supplier', products: 'Product', employees: 'Employee',
  tenders: 'Tender', documents: 'Document', payments: 'Payment', deadlines: 'Deadline',
  bonds: 'Bond', milestones: 'Contract Milestone', risks: 'Risk', approvals: 'Approval',
  crm: 'CRM Entry', dms: 'Business Document', users: 'User', audit: 'Audit', activity: 'Activity',
};

function refOf(item: unknown): string {
  const o = item as Record<string, unknown>;
  return String(o.docNo ?? o.refNo ?? o.code ?? o.title ?? o.name ?? o.id ?? '');
}

/** Low-level mutate: transform the state inside a transaction; logs audit + activity. */
export function mutateStore(fn: (draft: AppState) => void, log?: MutationLog): void {
  const draft: AppState = JSON.parse(JSON.stringify(state)) as AppState;
  fn(draft);
  const ts = nowISO();
  const user = log?.user ?? 'Admin User';
  if (log) {
    const action = log.action ?? 'Updated';
    const entity = log.entity ?? 'Record';
    const entityRef = log.entityRef ?? '';
    const details = log.details ?? `${action} ${entity} ${entityRef}`.trim();
    draft.audit.unshift({ id: uid('aud'), timestamp: ts, user, action, entity, entityRef, details });
    draft.activity.unshift({
      id: uid('act'), timestamp: ts,
      verb: log.verb ?? action, verbColor: log.verbColor ?? 'grey',
      ref: entityRef, text: log.text ?? details, user,
    });
    if (draft.audit.length > 500) draft.audit.length = 500;
    if (draft.activity.length > 200) draft.activity.length = 200;
  }
  state = draft;
  persist();
  listeners.forEach((l) => l());
}

/** Insert an item at the front of a collection (audit + activity logged). */
export function addItem<K extends CollectionKey>(
  key: K,
  item: AppState[K][number],
  log?: MutationLog,
): void {
  mutateStore((d) => {
    (d[key] as unknown[]).unshift(item);
  }, {
    action: 'Created', entity: ENTITY_LABEL[key], entityRef: refOf(item),
    details: `Created ${ENTITY_LABEL[key]} — ${refOf(item)}`, ...log,
  });
}

/** Patch an item by id (audit + activity logged). */
export function updateItem<K extends CollectionKey>(
  key: K,
  id: string,
  patch: Partial<AppState[K][number]>,
  log?: MutationLog,
): void {
  let ref = '';
  mutateStore((d) => {
    const list = d[key] as Array<{ id: string }>;
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      (list[idx] as Record<string, unknown>) && Object.assign(list[idx] as object, patch);
      ref = refOf(list[idx]);
    }
  }, {
    action: 'Updated', entity: ENTITY_LABEL[key], entityRef: ref || id,
    details: `Updated ${ENTITY_LABEL[key]} — ${ref || id}`, ...log,
  });
}

/** Remove an item by id (audit + activity logged). */
export function removeItem<K extends CollectionKey>(key: K, id: string, log?: MutationLog): void {
  let ref = '';
  mutateStore((d) => {
    const list = d[key] as Array<{ id: string }>;
    const item = list.find((x) => x.id === id);
    if (item) ref = refOf(item);
    (d[key] as unknown[]) = list.filter((x) => x.id !== id);
  }, {
    action: 'Deleted', entity: ENTITY_LABEL[key], entityRef: ref || id,
    details: `Deleted ${ENTITY_LABEL[key]} — ${ref || id}`, ...log,
  });
}

/** Update company profile / settings (audit + activity logged). */
export function updateProfile(patch: Partial<CompanyProfile>, user?: string): void {
  mutateStore((d) => {
    Object.assign(d.profile, patch);
  }, { user, action: 'Updated', entity: 'Company Profile', entityRef: 'FBV', details: 'Company profile updated', verb: 'Updated', verbColor: 'blue' });
}

export function updateSettings(patch: Partial<Settings>, user?: string): void {
  mutateStore((d) => {
    Object.assign(d.settings, patch);
  }, { user, action: 'Updated', entity: 'Settings', entityRef: 'FBV-SETTINGS', details: 'System settings updated', verb: 'Updated', verbColor: 'blue' });
}

/** Push a Recent Activity / audit row without mutating a collection. */
export function logActivity(log: MutationLog & { entity: string; entityRef: string }): void {
  mutateStore(() => undefined, log);
}

/** Wipe storage and reseed demo data. */
export function resetToSeed(): void {
  state = seedState();
  persist();
  listeners.forEach((l) => l());
}

/** Full JSON export (backup / Settings "Download data"). */
export function exportJSON(): string {
  return JSON.stringify(state, null, 2);
}

/** Restore from a JSON export. Throws on invalid payload. */
export function importJSON(text: string): void {
  const parsed = JSON.parse(text) as AppState;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as AppState).clients)) {
    throw new Error('That file is not a valid FBV backup. Please choose the JSON file exported from Settings.');
  }
  state = parsed;
  persist();
  listeners.forEach((l) => l());
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

/** Whole days from TODAY to an ISO date (negative = overdue/past). */
export function daysUntil(dateIso: string, fromIso: string = TODAY): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${dateIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Expiry alert level per settings thresholds (OK / WARNING≤30d / CRITICAL≤7d / EXPIRED). */
export function alertLevel(dateIso: string | undefined | null, settings?: Settings): AlertLevel {
  if (!dateIso) return 'OK';
  const s = settings ?? state.settings;
  const d = daysUntil(dateIso);
  if (d < 0) return 'EXPIRED';
  if (d <= s.criticalDays) return 'CRITICAL';
  if (d <= s.warningDays) return 'WARNING';
  return 'OK';
}

/** Next document number for a prefix, e.g. nextDocNumber('FBV-QUO', 2026) → 'FBV-QUO-2026-004'. */
export function nextDocNumber(prefix: string, year?: number, s?: AppState): string {
  const st = s ?? state;
  const yr = year ?? st.settings.docYear;
  const head = `${prefix}-${yr}-`;
  let max = 0;
  const scan = (no: string | undefined) => {
    if (no && no.startsWith(head)) {
      const n = parseInt(no.slice(head.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  };
  st.documents.forEach((d) => scan(d.docNo));
  st.tenders.forEach((t) => scan(t.refNo));
  st.payments.forEach((p) => scan(p.refNo));
  st.bonds.forEach((b) => scan(b.refNo));
  st.approvals.forEach((a) => scan(a.refNo));
  return `${head}${String(max + 1).padStart(3, '0')}`;
}

export interface DashboardKPIs {
  openTenders: number;
  submitted: number;
  underEvaluation: number;
  won: number;
  lost: number;
  successRate: number; // 0–100, won/(won+lost)
  pipelineValue: number; // open tenders value
  expectedRevenue: number; // probability-weighted pipeline + won
  collectedRevenue: number; // sum of payments
  outstandingBalance: number; // invoice balances (total - paid, not paid/cancelled)
  runningContracts: number; // active contract docs
  overdueInvoices: number;
}

export function computeKPIs(s: AppState = state): DashboardKPIs {
  const by = (st: TenderStatus) => s.tenders.filter((t) => t.status === st);
  const open = by('Open');
  const submitted = by('Submitted');
  const underEval = by('Under Evaluation');
  const won = by('Won');
  const lost = by('Lost');
  const sum = (xs: { value: number }[]) => xs.reduce((a, x) => a + x.value, 0);
  // Pipeline = currently open tenders (matches dashboard "In Progress" / pipeline KPI)
  const pipelineValue = sum(open);
  const expectedRevenue = sum(open) * 0.5 + sum(submitted) * 0.7 + sum(underEval) * 0.6;
  const collectedRevenue = s.payments.reduce((a, p) => a + p.amount, 0);
  const invoices = s.documents.filter((d) => d.type === 'invoice');
  const outstanding = invoices
    .filter((d) => d.status !== 'Paid' && d.status !== 'Cancelled')
    .reduce((a, d) => a + Math.max(0, d.total - d.amountPaid), 0);
  const overdue = invoices.filter((d) => d.status === 'Overdue' || (d.status !== 'Paid' && d.status !== 'Cancelled' && d.dueDate != null && daysUntil(d.dueDate) < 0));
  const decided = won.length + lost.length;
  return {
    openTenders: open.length,
    submitted: submitted.length,
    underEvaluation: underEval.length,
    won: won.length,
    lost: lost.length,
    successRate: decided ? Math.round((won.length / decided) * 100) : 0,
    pipelineValue,
    expectedRevenue,
    collectedRevenue,
    outstandingBalance: outstanding,
    runningContracts: s.documents.filter((d) => d.type === 'contract' && d.status !== 'Cancelled').length,
    overdueInvoices: overdue.length,
  };
}

export type AttentionKind = 'PAYMENT' | 'MILESTONE' | 'APPROVAL' | 'LICENSE' | 'CERTIFICATION' | 'PERMIT' | 'REGISTRATION' | 'INSURANCE' | 'BOND' | 'DEADLINE';
export type AttentionLevel = 'expired' | 'critical' | 'warning' | 'pending';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  label: string;
  level: AttentionLevel;
  route: string;
  date?: string;
}

/** Aggregates everything the topbar bell + dashboard "Needs Attention" care about. */
export function getNeedsAttention(s: AppState = state): AttentionItem[] {
  const items: AttentionItem[] = [];
  const lvlMap: Record<AlertLevel, AttentionLevel> = { OK: 'warning', WARNING: 'warning', CRITICAL: 'critical', EXPIRED: 'expired' };

  // Overdue invoices
  s.documents
    .filter((d) => d.type === 'invoice' && (d.status === 'Overdue' || (d.status !== 'Paid' && d.status !== 'Cancelled' && d.dueDate != null && daysUntil(d.dueDate) < 0)))
    .forEach((d) => {
      const client = s.clients.find((c) => c.id === d.clientId);
      items.push({
        id: `att-inv-${d.id}`, kind: 'PAYMENT',
        label: `Follow up overdue invoice — ${client?.name ?? 'client'} (${d.docNo})`,
        level: 'expired', route: '/payments?status=overdue', date: d.dueDate,
      });
    });

  // Pending approvals
  s.approvals.filter((a) => a.status === 'Pending').forEach((a) => {
    items.push({ id: `att-apr-${a.id}`, kind: 'APPROVAL', label: a.title, level: 'pending', route: '/approvals', date: a.requestedAt.slice(0, 10) });
  });

  // Upcoming / overdue contract milestones
  s.milestones.filter((m) => m.status === 'In Progress' || m.status === 'Overdue' || (m.status === 'Pending' && daysUntil(m.dueDate) <= s.settings.criticalDays)).forEach((m) => {
    items.push({
      id: `att-mil-${m.id}`, kind: 'MILESTONE', label: m.title,
      level: daysUntil(m.dueDate) < 0 ? 'expired' : 'critical', route: '/contracts', date: m.dueDate,
    });
  });

  // Open deadlines within warning window or overdue
  s.deadlines.filter((d) => d.status === 'open' && daysUntil(d.date) <= s.settings.warningDays).forEach((d) => {
    const lvl = alertLevel(d.date, s.settings);
    items.push({
      id: `att-ddl-${d.id}`, kind: 'DEADLINE', label: d.title,
      level: lvlMap[lvl], route: '/deadlines', date: d.date,
    });
  });

  // Expiring business documents (v2.0 DMS wiring)
  s.dms.forEach((doc) => {
    if (!doc.expiryDate) return;
    const lvl = alertLevel(doc.expiryDate, s.settings);
    if (lvl === 'OK') return;
    const kind = (doc.docType.toUpperCase() === 'LICENSE' ? 'LICENSE' : doc.docType.toUpperCase()) as AttentionKind;
    items.push({
      id: `att-dms-${doc.id}`, kind: kind === 'LICENSE' ? 'LICENSE' : (doc.docType === 'certification' ? 'CERTIFICATION' : kind),
      label: `${doc.title} ${lvl === 'EXPIRED' ? 'has expired' : `expires ${doc.expiryDate.slice(0, 10)}`}`,
      level: lvlMap[lvl], route: '/dms', date: doc.expiryDate,
    });
  });

  // Expiring bonds
  s.bonds.filter((b) => b.status === 'Active' && b.expiryDate).forEach((b) => {
    const lvl = alertLevel(b.expiryDate, s.settings);
    if (lvl === 'OK') return;
    items.push({ id: `att-bnd-${b.id}`, kind: 'BOND', label: `${b.kind} — ${b.tenderTitle} expires`, level: lvlMap[lvl], route: '/bonds', date: b.expiryDate });
  });

  const rank: Record<AttentionLevel, number> = { expired: 0, critical: 1, warning: 2, pending: 3 };
  return items.sort((a, b) => rank[a.level] - rank[b.level] || (a.date ?? '').localeCompare(b.date ?? ''));
}

/** Open deadlines sorted by date (dashboard "Upcoming Deadlines"). */
export function getUpcomingDeadlines(s: AppState = state): Deadline[] {
  return [...s.deadlines].filter((d) => d.status === 'open').sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* File helpers — 2 MB cap with a friendly error                       */
/* ------------------------------------------------------------------ */

/** Reads a File as base64 (no data: prefix), enforcing the 2 MB cap. */
export function readFileAsBase64(file: File): Promise<{ fileName: string; fileData: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — files must be 2 MB or smaller. Please compress it and try again.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}". Please try again.`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve({ fileName: file.name, fileData: result.includes(',') ? result.split(',')[1] : result });
    };
    reader.readAsDataURL(file);
  });
}

/** Bytes currently used by the store in localStorage (Settings storage meter). */
export function storageUsage(): { used: number; quota: number; ratio: number } {
  let used = 0;
  try {
    used = new Blob([localStorage.getItem(STORAGE_KEY) ?? '']).size;
  } catch { /* ignore */ }
  const quota = 5 * 1024 * 1024; // typical localStorage quota
  return { used, quota, ratio: used / quota };
}

export { seedState };
