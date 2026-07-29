/**
 * Schema extensions for master-data records. The central store schema
 * (src/lib/store.ts — not modifiable by this scope) lacks a handful of fields
 * that master-data.md / bulk-upload.md require. These are persisted as extra
 * JSON keys on the store items (they survive the store's JSON round-trip) and
 * accessed through these widened types.
 */
import type { Client, Employee, Product, Supplier } from '@/lib/store';

export interface ClientExtras {
  company?: string;
  county?: string;
  country?: string;
  paymentTerms?: number; // days: 30 / 45 / 60
  creditLimit?: number; // KES
}
export type ClientX = Client & ClientExtras;

export interface SupplierExtras {
  paymentTerms?: string; // e.g. '30 days'
}
export type SupplierX = Supplier & SupplierExtras;

export interface ProductExtras {
  supplierId?: string;
  supplierName?: string;
  brand?: string;
  leadTimeDays?: number;
  warranty?: string;
  discount?: number; // %
}
export type ProductX = Product & ProductExtras;

export type SystemRole = 'Admin' | 'Manager' | 'Officer' | 'Viewer';
export interface EmployeeExtras {
  systemRole?: SystemRole;
}
export type EmployeeX = Employee & EmployeeExtras;

/* Stock status derivation (design: In Stock / Low ≤10 / Out = 0). */
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';
export function stockStatus(p: Product): StockStatus {
  const q = p.stockQty ?? 0;
  if (q <= 0) return 'Out of Stock';
  if (q <= 10) return 'Low Stock';
  return 'In Stock';
}
export const LOW_STOCK_THRESHOLD = 10;
