/**
 * Invoice Tools
 * MCP tools for managing sevdesk invoices
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, sevdeskFetchPdf, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { Invoice, InvoicePos } from "../types.js";

// Cache for current user ID
let cachedUserId: string | null = null;

/**
 * Get the current SevUser ID (cached)
 */
async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const response = await sevdeskFetch<{ objects: Array<{ id: string }> }>("/SevUser?limit=1");
  cachedUserId = response.objects[0].id;
  return cachedUserId;
}

/**
 * List invoices schema
 */
export const listInvoicesSchema = {
  limit: z.number().optional().describe("Maximum number of invoices to return (default: 100)"),
  offset: z.number().optional().describe("Number of invoices to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  status: z.string().optional().describe("Filter by invoice status (100=draft, 200=open, 1000=paid)"),
  invoiceNumber: z.string().optional().describe("Filter by invoice number"),
  startDate: z.string().optional().describe("Filter invoices from this date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("Filter invoices until this date (YYYY-MM-DD)"),
  contactId: z.string().optional().describe("Filter by contact ID"),
};

/**
 * Get invoice schema
 */
export const getInvoiceSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID"),
};

/**
 * List all invoices
 */
export async function listInvoices(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  status?: string;
  invoiceNumber?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
}): Promise<Invoice[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  };

  if (params.status) {
    queryParams["status"] = params.status;
  }
  if (params.invoiceNumber) {
    queryParams["invoiceNumber"] = params.invoiceNumber;
  }
  if (params.startDate) {
    queryParams["startDate"] = params.startDate;
  }
  if (params.endDate) {
    queryParams["endDate"] = params.endDate;
  }
  if (params.contactId) {
    queryParams["contact[id]"] = params.contactId;
    queryParams["contact[objectName]"] = "Contact";
  }

  const queryString = buildQueryString(queryParams);

  const response = await sevdeskFetch<SevdeskApiResponse<Invoice>>(
    `/Invoice${queryString}`
  );

  return response.objects;
}

/**
 * Get a single invoice by ID
 */
export async function getInvoice(params: { id: string }): Promise<Invoice> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Invoice>>(
    `/Invoice/${params.id}`
  );

  return extractSingleObject(response);
}

/**
 * Get invoice status label
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    "50": "Draft (not yet finalized)",
    "100": "Draft",
    "200": "Open",
    "750": "Partially paid",
    "1000": "Paid",
  };
  return statusMap[status] || `Unknown (${status})`;
}

/**
 * Format invoice for display
 */
export function formatInvoice(invoice: Invoice): string {
  const lines: string[] = [
    `ID: ${invoice.id}`,
    `Invoice Number: ${invoice.invoiceNumber}`,
    `Status: ${getStatusLabel(invoice.status)}`,
    `Invoice Date: ${invoice.invoiceDate}`,
    `Currency: ${invoice.currency}`,
    `Sum Net: ${invoice.sumNet}`,
    `Sum Tax: ${invoice.sumTax}`,
    `Sum Gross: ${invoice.sumGross}`,
  ];

  if (invoice.contact) {
    lines.push(`Contact ID: ${invoice.contact.id}`);
  }
  if (invoice.deliveryDate) {
    lines.push(`Delivery Date: ${invoice.deliveryDate}`);
  }
  if (invoice.payDate) {
    lines.push(`Pay Date: ${invoice.payDate}`);
  }
  if (invoice.paidAmount !== null) {
    lines.push(`Paid Amount: ${invoice.paidAmount}`);
  }
  if (invoice.header) {
    lines.push(`Header: ${invoice.header}`);
  }
  if (invoice.addressName) {
    lines.push(`Address: ${invoice.addressName}`);
    if (invoice.addressStreet) lines.push(`  Street: ${invoice.addressStreet}`);
    if (invoice.addressZip || invoice.addressCity) {
      lines.push(`  City: ${[invoice.addressZip, invoice.addressCity].filter(Boolean).join(" ")}`);
    }
  }
  lines.push(`Created: ${invoice.create}`);
  lines.push(`Updated: ${invoice.update}`);

  return lines.join("\n");
}

/**
 * Format invoices list for display
 */
export function formatInvoicesList(invoices: Invoice[]): string {
  if (invoices.length === 0) {
    return "No invoices found.";
  }

  const lines: string[] = [`Found ${invoices.length} invoice(s):\n`];

  for (const invoice of invoices) {
    const status = getStatusLabel(invoice.status);
    lines.push(
      `- [${invoice.id}] ${invoice.invoiceNumber} | ${invoice.invoiceDate} | ${invoice.sumGross} ${invoice.currency} | ${status}`
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Create/Update/Delete Operations
// ============================================================================

/**
 * Invoice position schema for creating invoices
 */
const invoicePositionSchema = z.object({
  quantity: z.number().describe("Quantity"),
  price: z.number().describe("Unit price (net)"),
  name: z.string().describe("Position name/description"),
  taxRate: z.number().describe("Tax rate percentage (e.g., 19 for 19%)"),
  unity: z.number().optional().describe("Unity ID (1=piece, default)"),
  text: z.string().optional().describe("Additional text/description"),
  discount: z.number().optional().describe("Discount percentage"),
  partId: z.string().optional().describe("Part/product ID if using existing product"),
});

/**
 * Create invoice schema (uses factory endpoint)
 */
export const createInvoiceSchema = {
  contactId: z.string().describe("Contact ID for the invoice recipient"),
  invoiceDate: z.string().optional().describe("Invoice date (YYYY-MM-DD), defaults to today"),
  positions: z.array(invoicePositionSchema).describe("Invoice line items"),
  header: z.string().optional().describe("Invoice header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  discount: z.number().optional().describe("Overall discount percentage"),
  deliveryDate: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
  deliveryDateUntil: z.string().optional().describe("Delivery date until (YYYY-MM-DD)"),
  timeToPay: z.number().optional().describe("Payment terms in days"),
  taxType: z.string().optional().describe("Tax type: default, eu, noteu, custom, ss (v1.0 — use taxRule for v2.0 accounts)"),
  taxRule: z.number().optional().describe("Tax rule for v2.0 accounts: 1=taxable (default for Regelbesteuerer), 2=EU intra-community, 3=reverse charge §13b, 11=Kleinunternehmer §19, 17=not taxable inland"),
  taxRate: z.number().optional().describe("Default tax rate for all positions"),
  invoiceType: z.string().optional().describe("Invoice type: RE (default), SR (partial), ER (final), AR (advance), WKR (recurring)"),
  showNet: z.boolean().optional().describe("Show net prices (default: true)"),
  sendType: z.string().optional().describe("Send type: VPR (print), VM (mail), VP (post), VPDF (pdf)"),
};

/**
 * Create recurring invoice schema (uses factory endpoint with recurring fields)
 */
export const createRecurringInvoiceSchema = {
  contactId: z.string().describe("Contact ID for the invoice recipient"),
  positions: z.array(invoicePositionSchema).describe("Invoice line items"),
  accountIntervall: z.number().describe("Recurring interval: 0=weekly, 1=monthly, 2=quarterly, 3=semi-annually, 4=annually, 5=bi-weekly, 6=every 2 years, 7=every 3 years, 8=every 4 years, 9=every 5 years"),
  accountNextInvoice: z.string().describe("Next invoice date (YYYY-MM-DD) — when the first/next recurring invoice should be generated"),
  header: z.string().optional().describe("Invoice header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  discount: z.number().optional().describe("Overall discount percentage"),
  timeToPay: z.number().optional().describe("Payment terms in days"),
  taxType: z.string().optional().describe("Tax type: default, eu, noteu, custom, ss (v1.0 — use taxRule for v2.0 accounts)"),
  taxRule: z.number().optional().describe("Tax rule for v2.0 accounts: 1=taxable, 2=EU, 3=reverse charge, 11=Kleinunternehmer, 17=not taxable inland"),
  taxRate: z.number().optional().describe("Default tax rate for all positions"),
  showNet: z.boolean().optional().describe("Show net prices (default: true)"),
  sendType: z.string().optional().describe("Send type: VPR (print), VM (mail), VP (post), VPDF (pdf)"),
};

/**
 * Update invoice schema
 */
export const updateInvoiceSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID to update"),
  header: z.string().optional().describe("Invoice header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  deliveryDate: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
  deliveryDateUntil: z.string().optional().describe("Delivery date until (YYYY-MM-DD)"),
  timeToPay: z.number().optional().describe("Payment terms in days"),
  customerInternalNote: z.string().optional().describe("Internal note"),
};

/**
 * Delete invoice schema
 */
export const deleteInvoiceSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID to delete"),
};

/**
 * Get invoice PDF schema
 */
export const getInvoicePdfSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID"),
  download: z.boolean().optional().describe("Set to true to get download-ready content"),
};

/**
 * Send invoice via email schema
 */
export const sendInvoiceEmailSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID"),
  email: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject"),
  text: z.string().describe("Email body text"),
  copy: z.boolean().optional().describe("Send a copy to yourself"),
  additionalAttachments: z.string().optional().describe("Additional attachment document IDs, comma-separated"),
};

/**
 * Reset invoice to draft schema (v2.0)
 */
export const resetInvoiceToDraftSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID to reset to draft status (100)"),
};

/**
 * Reset invoice to open schema (v2.0)
 */
export const resetInvoiceToOpenSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID to reset to open status (200)"),
};

/**
 * Mark invoice as sent schema (v2.0 — transitions draft→open)
 */
export const markInvoiceSentSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID"),
  sendType: z.string().optional().describe("Send type: VPR (print), VM (mail), VP (post), VPDF (pdf). Default: VPDF"),
  sendDraft: z.boolean().optional().describe("Set to true to mark as sent without actually sending"),
};

/**
 * Enshrine (finalize) invoice schema
 */
export const enshrineInvoiceSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID to enshrine (finalize)"),
};

/**
 * Book invoice payment schema
 */
export const bookInvoicePaymentSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk invoice ID"),
  amount: z.number().describe("Payment amount"),
  date: z.string().optional().describe("Payment date (YYYY-MM-DD)"),
  checkAccountId: z.string().optional().describe("Bank account ID for the payment"),
  checkAccountTransactionId: z.string().optional().describe("Link to existing bank transaction"),
  type: z.string().optional().describe("Payment type: N (normal), CB (cashback), D (deduction), OF (surplus), C (correction)"),
};

/**
 * List invoice positions schema
 */
export const listInvoicePositionsSchema = {
  invoiceId: z.string().describe("The invoice ID to get positions for"),
  limit: z.number().optional().describe("Maximum number of positions to return"),
  offset: z.number().optional().describe("Number of positions to skip for pagination"),
};

/**
 * Get invoice position schema
 */
export const getInvoicePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The invoice position ID"),
};

/**
 * Create invoice position schema
 */
export const createInvoicePositionSchema = {
  invoiceId: z.string().describe("The invoice ID to add position to"),
  quantity: z.number().describe("Quantity"),
  price: z.number().describe("Unit price (net)"),
  name: z.string().describe("Position name/description"),
  taxRate: z.number().describe("Tax rate percentage"),
  unity: z.number().optional().describe("Unity ID (1=piece)"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
  partId: z.string().optional().describe("Part/product ID"),
  positionNumber: z.number().optional().describe("Position number/order"),
};

/**
 * Update invoice position schema
 */
export const updateInvoicePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The invoice position ID to update"),
  quantity: z.number().optional().describe("Quantity"),
  price: z.number().optional().describe("Unit price (net)"),
  name: z.string().optional().describe("Position name/description"),
  taxRate: z.number().optional().describe("Tax rate percentage"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
};

/**
 * Delete invoice position schema
 */
export const deleteInvoicePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The invoice position ID to delete"),
};

/**
 * Create a new invoice using the factory endpoint
 */
export async function createInvoice(params: {
  contactId: string;
  invoiceDate?: string;
  positions: Array<{
    quantity: number;
    price: number;
    name: string;
    taxRate: number;
    unity?: number;
    text?: string;
    discount?: number;
    partId?: string;
  }>;
  header?: string;
  headText?: string;
  footText?: string;
  currency?: string;
  discount?: number;
  deliveryDate?: string;
  deliveryDateUntil?: string;
  timeToPay?: number;
  taxType?: string;
  taxRule?: number;
  taxRate?: number;
  invoiceType?: string;
  showNet?: boolean;
  sendType?: string;
}): Promise<Invoice> {
  const invoiceDate = params.invoiceDate || new Date().toISOString().split("T")[0];
  const userId = await getCurrentUserId();

  // Build invoice object for factory endpoint
  const invoice: Record<string, unknown> = {
    objectName: "Invoice",
    contact: { id: params.contactId, objectName: "Contact" },
    contactPerson: { id: userId, objectName: "SevUser" },
    invoiceDate: invoiceDate,
    discount: params.discount || 0,
    discountTime: 0,
    addressCountry: { id: 1, objectName: "StaticCountry" }, // Germany default
    status: 100, // Draft
    taxType: params.taxRule ? "default" : (params.taxType || "default"),
    currency: params.currency || "EUR",
    invoiceType: params.invoiceType || "RE",
    taxRate: params.taxRate || 0,
    taxText: "Umsatzsteuer",
    mapAll: true,
    showNet: params.showNet !== false,
  };

  if (params.taxRule !== undefined) invoice.taxRule = { id: params.taxRule, objectName: "TaxRule" };
  if (params.header !== undefined) invoice.header = params.header;
  if (params.headText !== undefined) invoice.headText = params.headText;
  if (params.footText !== undefined) invoice.footText = params.footText;
  if (params.deliveryDate !== undefined) invoice.deliveryDate = params.deliveryDate;
  if (params.deliveryDateUntil !== undefined) invoice.deliveryDateUntil = params.deliveryDateUntil;
  if (params.timeToPay !== undefined) invoice.timeToPay = params.timeToPay;
  if (params.sendType !== undefined) invoice.sendType = params.sendType;

  // Build positions array
  const invoicePosSave = params.positions.map((pos, index) => {
    const position: Record<string, unknown> = {
      objectName: "InvoicePos",
      quantity: pos.quantity,
      price: pos.price,
      name: pos.name,
      taxRate: pos.taxRate,
      unity: { id: pos.unity || 1, objectName: "Unity" },
      positionNumber: index,
      mapAll: true,
    };

    if (pos.text !== undefined) position.text = pos.text;
    if (pos.discount !== undefined) position.discount = pos.discount;
    if (pos.partId !== undefined) {
      position.part = { id: pos.partId, objectName: "Part" };
    }

    return position;
  });

  const body = {
    invoice,
    invoicePosSave,
    takeDefaultAddress: true,
  };

  const response = await sevdeskPost<{ objects: { invoice: Invoice } }>("/Invoice/Factory/saveInvoice", body);
  return response.objects.invoice;
}

/**
 * Create a recurring invoice using the factory endpoint
 */
export async function createRecurringInvoice(params: {
  contactId: string;
  positions: Array<{
    quantity: number;
    price: number;
    name: string;
    taxRate: number;
    unity?: number;
    text?: string;
    discount?: number;
    partId?: string;
  }>;
  accountIntervall: number;
  accountNextInvoice: string;
  header?: string;
  headText?: string;
  footText?: string;
  currency?: string;
  discount?: number;
  timeToPay?: number;
  taxType?: string;
  taxRule?: number;
  taxRate?: number;
  showNet?: boolean;
  sendType?: string;
}): Promise<Invoice> {
  const userId = await getCurrentUserId();

  const invoice: Record<string, unknown> = {
    objectName: "Invoice",
    contact: { id: params.contactId, objectName: "Contact" },
    contactPerson: { id: userId, objectName: "SevUser" },
    invoiceDate: new Date().toISOString().split("T")[0],
    discount: params.discount || 0,
    discountTime: 0,
    addressCountry: { id: 1, objectName: "StaticCountry" },
    status: 100,
    taxType: params.taxRule ? "default" : (params.taxType || "default"),
    currency: params.currency || "EUR",
    invoiceType: "WKR",
    taxRate: params.taxRate || 0,
    taxText: "Umsatzsteuer",
    mapAll: true,
    showNet: params.showNet !== false,
    accountIntervall: params.accountIntervall,
    accountNextInvoice: params.accountNextInvoice,
  };

  if (params.taxRule !== undefined) invoice.taxRule = { id: params.taxRule, objectName: "TaxRule" };
  if (params.header !== undefined) invoice.header = params.header;
  if (params.headText !== undefined) invoice.headText = params.headText;
  if (params.footText !== undefined) invoice.footText = params.footText;
  if (params.timeToPay !== undefined) invoice.timeToPay = params.timeToPay;
  if (params.sendType !== undefined) invoice.sendType = params.sendType;

  const invoicePosSave = params.positions.map((pos, index) => {
    const position: Record<string, unknown> = {
      objectName: "InvoicePos",
      quantity: pos.quantity,
      price: pos.price,
      name: pos.name,
      taxRate: pos.taxRate,
      unity: { id: pos.unity || 1, objectName: "Unity" },
      positionNumber: index,
      mapAll: true,
    };

    if (pos.text !== undefined) position.text = pos.text;
    if (pos.discount !== undefined) position.discount = pos.discount;
    if (pos.partId !== undefined) {
      position.part = { id: pos.partId, objectName: "Part" };
    }

    return position;
  });

  const body = {
    invoice,
    invoicePosSave,
    takeDefaultAddress: true,
  };

  const response = await sevdeskPost<{ objects: { invoice: Invoice } }>("/Invoice/Factory/saveInvoice", body);
  return response.objects.invoice;
}

/**
 * Update an existing invoice
 */
export async function updateInvoice(params: {
  id: string;
  header?: string;
  headText?: string;
  footText?: string;
  deliveryDate?: string;
  deliveryDateUntil?: string;
  timeToPay?: number;
  customerInternalNote?: string;
}): Promise<Invoice> {
  const body: Record<string, unknown> = {};

  if (params.header !== undefined) body.header = params.header;
  if (params.headText !== undefined) body.headText = params.headText;
  if (params.footText !== undefined) body.footText = params.footText;
  if (params.deliveryDate !== undefined) body.deliveryDate = params.deliveryDate;
  if (params.deliveryDateUntil !== undefined) body.deliveryDateUntil = params.deliveryDateUntil;
  if (params.timeToPay !== undefined) body.timeToPay = params.timeToPay;
  if (params.customerInternalNote !== undefined) body.customerInternalNote = params.customerInternalNote;

  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete an invoice
 */
export async function deleteInvoice(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Invoice/${params.id}`);
}

/**
 * Get invoice PDF as base64
 */
export async function getInvoicePdf(params: { id: string; download?: boolean }): Promise<string> {
  const queryString = params.download ? "?download=true" : "";
  return sevdeskFetchPdf(`/Invoice/${params.id}/getPdf${queryString}`);
}

/**
 * Send invoice via email
 */
export async function sendInvoiceEmail(params: {
  id: string;
  email: string;
  subject: string;
  text: string;
  copy?: boolean;
  additionalAttachments?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    toEmail: params.email,
    subject: params.subject,
    text: params.text,
    copy: params.copy || false,
  };

  if (params.additionalAttachments) {
    body.additionalAttachments = params.additionalAttachments;
  }

  await sevdeskPost(`/Invoice/${params.id}/sendViaEmail`, body);
}

/**
 * Reset invoice to draft (v2.0 — PUT /Invoice/{id}/resetToDraft)
 */
export async function resetInvoiceToDraft(params: { id: string }): Promise<Invoice> {
  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}/resetToDraft`, {});
  return extractSingleObject(response);
}

/**
 * Reset invoice to open (v2.0 — PUT /Invoice/{id}/resetToOpen)
 */
export async function resetInvoiceToOpen(params: { id: string }): Promise<Invoice> {
  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}/resetToOpen`, {});
  return extractSingleObject(response);
}

/**
 * Mark invoice as sent (v2.0 — PUT /Invoice/{id}/sendBy, transitions draft→open)
 */
export async function markInvoiceSent(params: { id: string; sendType?: string; sendDraft?: boolean }): Promise<Invoice> {
  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}/sendBy`, {
    sendType: params.sendType || "VPDF",
    sendDraft: params.sendDraft ?? false,
  });
  return extractSingleObject(response);
}

/**
 * Enshrine (finalize) an invoice (v2.0 — PUT /Invoice/{id}/enshrine)
 */
export async function enshrineInvoice(params: { id: string }): Promise<Invoice> {
  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}/enshrine`, {});
  return extractSingleObject(response);
}

/**
 * Book a payment on an invoice
 */
export async function bookInvoicePayment(params: {
  id: string;
  amount: number;
  date?: string;
  checkAccountId?: string;
  checkAccountTransactionId?: string;
  type?: string;
}): Promise<Invoice> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    date: params.date || new Date().toISOString().split("T")[0],
    type: params.type || "N",
  };

  if (params.checkAccountId) {
    body.checkAccount = { id: params.checkAccountId, objectName: "CheckAccount" };
  }
  if (params.checkAccountTransactionId) {
    body.checkAccountTransaction = { id: params.checkAccountTransactionId, objectName: "CheckAccountTransaction" };
  }

  const response = await sevdeskPut<SevdeskSingleResponse<Invoice>>(`/Invoice/${params.id}/bookAmount`, body);
  return extractSingleObject(response);
}

/**
 * List invoice positions
 */
export async function listInvoicePositions(params: {
  invoiceId: string;
  limit?: number;
  offset?: number;
}): Promise<InvoicePos[]> {
  const queryString = buildQueryString({
    "invoice[id]": params.invoiceId,
    "invoice[objectName]": "Invoice",
    limit: params.limit ?? 100,
    offset: params.offset,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<InvoicePos>>(`/InvoicePos${queryString}`);
  return response.objects;
}

/**
 * Get a single invoice position
 */
export async function getInvoicePosition(params: { id: string }): Promise<InvoicePos> {
  const response = await sevdeskFetch<SevdeskSingleResponse<InvoicePos>>(`/InvoicePos/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create an invoice position
 */
export async function createInvoicePosition(params: {
  invoiceId: string;
  quantity: number;
  price: number;
  name: string;
  taxRate: number;
  unity?: number;
  text?: string;
  discount?: number;
  partId?: string;
  positionNumber?: number;
}): Promise<InvoicePos> {
  const body: Record<string, unknown> = {
    invoice: { id: params.invoiceId, objectName: "Invoice" },
    quantity: params.quantity,
    price: params.price,
    name: params.name,
    taxRate: params.taxRate,
    unity: { id: params.unity || 1, objectName: "Unity" },
    mapAll: true,
  };

  if (params.text !== undefined) body.text = params.text;
  if (params.discount !== undefined) body.discount = params.discount;
  if (params.partId !== undefined) {
    body.part = { id: params.partId, objectName: "Part" };
  }
  if (params.positionNumber !== undefined) body.positionNumber = params.positionNumber;

  const response = await sevdeskPost<SevdeskSingleResponse<InvoicePos>>("/InvoicePos", body);
  return extractSingleObject(response);
}

/**
 * Update an invoice position
 */
export async function updateInvoicePosition(params: {
  id: string;
  quantity?: number;
  price?: number;
  name?: string;
  taxRate?: number;
  text?: string;
  discount?: number;
}): Promise<InvoicePos> {
  const body: Record<string, unknown> = {};

  if (params.quantity !== undefined) body.quantity = params.quantity;
  if (params.price !== undefined) body.price = params.price;
  if (params.name !== undefined) body.name = params.name;
  if (params.taxRate !== undefined) body.taxRate = params.taxRate;
  if (params.text !== undefined) body.text = params.text;
  if (params.discount !== undefined) body.discount = params.discount;

  const response = await sevdeskPut<SevdeskSingleResponse<InvoicePos>>(`/InvoicePos/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete an invoice position
 */
export async function deleteInvoicePosition(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/InvoicePos/${params.id}`);
}

/**
 * Format recurring invoice result
 */
export function formatRecurringInvoiceResult(invoice: Invoice): string {
  const intervalLabels: Record<number, string> = {
    0: "weekly", 1: "monthly", 2: "quarterly", 3: "semi-annually",
    4: "annually", 5: "bi-weekly", 6: "every 2 years", 7: "every 3 years",
    8: "every 4 years", 9: "every 5 years",
  };
  const interval = invoice.accountIntervall !== null ? (intervalLabels[invoice.accountIntervall] || `interval ${invoice.accountIntervall}`) : "unknown";
  return `Recurring invoice created successfully (${interval}, next: ${invoice.accountNextInvoice || "n/a"}):\n${formatInvoice(invoice)}`;
}

/**
 * Format invoice result
 */
export function formatInvoiceResult(invoice: Invoice, action: string): string {
  return `Invoice ${action} successfully:\n${formatInvoice(invoice)}`;
}

/**
 * Format delete result
 */
export function formatInvoiceDeleteResult(id: string): string {
  return `Invoice ${id} deleted successfully.`;
}

/**
 * Format PDF result
 */
export function formatPdfResult(content: string, id: string): string {
  return `Invoice ${id} PDF retrieved successfully.\nBase64 content length: ${content.length} characters\nContent preview: ${content.substring(0, 100)}...`;
}

/**
 * Format email sent result
 */
export function formatEmailSentResult(id: string, email: string): string {
  return `Invoice ${id} sent successfully to ${email}.`;
}

/**
 * Format status change result
 */
export function formatStatusChangeResult(invoice: Invoice, action: string): string {
  return `Invoice ${invoice.invoiceNumber} ${action}: ${getStatusLabel(invoice.status)}`;
}

/**
 * Format enshrine result
 */
export function formatInvoiceEnshrineResult(invoice: Invoice): string {
  return `Invoice ${invoice.invoiceNumber} enshrined (finalized) successfully.`;
}

/**
 * Format payment booked result
 */
export function formatPaymentBookedResult(invoice: Invoice, amount: number): string {
  return `Payment of ${amount} booked on invoice ${invoice.invoiceNumber}.\nNew paid amount: ${invoice.paidAmount}`;
}

/**
 * Format invoice position
 */
export function formatInvoicePosition(pos: InvoicePos): string {
  const lines: string[] = [
    `ID: ${pos.id}`,
    `Name: ${pos.name}`,
    `Quantity: ${pos.quantity}`,
    `Price (net): ${pos.priceNet}`,
    `Tax Rate: ${pos.taxRate}%`,
    `Sum Net: ${pos.sumNet}`,
    `Sum Gross: ${pos.sumGross}`,
  ];

  if (pos.text) lines.push(`Text: ${pos.text}`);
  if (pos.discount) lines.push(`Discount: ${pos.discount}%`);

  return lines.join("\n");
}

/**
 * Format invoice positions list
 */
export function formatInvoicePositionsList(positions: InvoicePos[]): string {
  if (positions.length === 0) {
    return "No invoice positions found.";
  }

  const lines: string[] = [`Found ${positions.length} position(s):\n`];

  for (const pos of positions) {
    lines.push(`- [${pos.id}] ${pos.name} | Qty: ${pos.quantity} | ${pos.sumGross}`);
  }

  return lines.join("\n");
}

/**
 * Format position result
 */
export function formatPositionResult(pos: InvoicePos, action: string): string {
  return `Invoice position ${action} successfully:\n${formatInvoicePosition(pos)}`;
}

/**
 * Format position delete result
 */
export function formatPositionDeleteResult(id: string): string {
  return `Invoice position ${id} deleted successfully.`;
}
