/**
 * Credit Note Tools
 * MCP tools for managing sevdesk credit notes
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, sevdeskFetchPdf, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { CreditNote, CreditNotePos } from "../types.js";

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

// ============================================================================
// Schemas
// ============================================================================

/**
 * List credit notes schema
 */
export const listCreditNotesSchema = {
  limit: z.number().optional().describe("Maximum number of credit notes to return (default: 100)"),
  offset: z.number().optional().describe("Number of credit notes to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  status: z.string().optional().describe("Filter by status"),
  creditNoteNumber: z.string().optional().describe("Filter by credit note number"),
  startDate: z.string().optional().describe("Filter credit notes from this date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("Filter credit notes until this date (YYYY-MM-DD)"),
  contactId: z.string().optional().describe("Filter by contact ID"),
};

/**
 * Get credit note schema
 */
export const getCreditNoteSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID"),
};

/**
 * Credit note position schema
 */
const creditNotePositionSchema = z.object({
  quantity: z.number().describe("Quantity"),
  price: z.number().describe("Unit price (net)"),
  name: z.string().describe("Position name/description"),
  taxRate: z.number().describe("Tax rate percentage"),
  unity: z.number().optional().describe("Unity ID (1=piece)"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
  partId: z.string().optional().describe("Part/product ID"),
});

/**
 * Create credit note schema
 */
export const createCreditNoteSchema = {
  contactId: z.string().describe("Contact ID for the credit note recipient"),
  creditNoteDate: z.string().optional().describe("Credit note date (YYYY-MM-DD), defaults to today"),
  positions: z.array(creditNotePositionSchema).describe("Credit note line items"),
  header: z.string().optional().describe("Credit note header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  taxType: z.string().optional().describe("Tax type: default, eu, noteu, custom, ss (v1.0 — use taxRule for v2.0 accounts)"),
  taxRule: z.number().optional().describe("Tax rule for v2.0 accounts: 1=taxable (default for Regelbesteuerer), 2=EU intra-community, 3=reverse charge §13b, 11=Kleinunternehmer §19, 17=not taxable inland"),
  showNet: z.boolean().optional().describe("Show net prices (default: true)"),
  bookingCategory: z.string().optional().describe("Booking category"),
};

/**
 * Update credit note schema
 */
export const updateCreditNoteSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID to update"),
  header: z.string().optional().describe("Credit note header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  customerInternalNote: z.string().optional().describe("Internal note"),
};

/**
 * Delete credit note schema
 */
export const deleteCreditNoteSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID to delete"),
};

/**
 * Get credit note PDF schema
 */
export const getCreditNotePdfSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID"),
  download: z.boolean().optional().describe("Set to true to get download-ready content"),
};

/**
 * Reset credit note to draft schema (v2.0)
 */
export const resetCreditNoteToDraftSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID to reset to draft status (100)"),
};

/**
 * Reset credit note to open schema (v2.0)
 */
export const resetCreditNoteToOpenSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID to reset to open status (200)"),
};

/**
 * Send credit note via email schema
 */
export const sendCreditNoteEmailSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk credit note ID"),
  email: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject"),
  text: z.string().describe("Email body text"),
  copy: z.boolean().optional().describe("Send a copy to yourself"),
};

/**
 * List credit note positions schema
 */
export const listCreditNotePositionsSchema = {
  creditNoteId: z.string().describe("The credit note ID to get positions for"),
  limit: z.number().optional().describe("Maximum number of positions to return"),
  offset: z.number().optional().describe("Number of positions to skip for pagination"),
};

/**
 * Get credit note position schema
 */
export const getCreditNotePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The credit note position ID"),
};

/**
 * Create credit note position schema
 */
export const createCreditNotePositionSchema = {
  creditNoteId: z.string().describe("The credit note ID to add position to"),
  quantity: z.number().describe("Quantity"),
  price: z.number().describe("Unit price (net)"),
  name: z.string().describe("Position name/description"),
  taxRate: z.number().describe("Tax rate percentage"),
  unity: z.number().optional().describe("Unity ID (1=piece)"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
  partId: z.string().optional().describe("Part/product ID"),
};

/**
 * Update credit note position schema
 */
export const updateCreditNotePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The credit note position ID to update"),
  quantity: z.number().optional().describe("Quantity"),
  price: z.number().optional().describe("Unit price (net)"),
  name: z.string().optional().describe("Position name/description"),
  taxRate: z.number().optional().describe("Tax rate percentage"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
};

/**
 * Delete credit note position schema
 */
export const deleteCreditNotePositionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The credit note position ID to delete"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Get credit note status label
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    "100": "Draft",
    "200": "Open",
    "1000": "Paid/Booked",
  };
  return statusMap[status] || `Unknown (${status})`;
}

/**
 * List all credit notes
 */
export async function listCreditNotes(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  status?: string;
  creditNoteNumber?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
}): Promise<CreditNote[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  };

  if (params.status) queryParams["status"] = params.status;
  if (params.creditNoteNumber) queryParams["creditNoteNumber"] = params.creditNoteNumber;
  if (params.startDate) queryParams["startDate"] = params.startDate;
  if (params.endDate) queryParams["endDate"] = params.endDate;
  if (params.contactId) {
    queryParams["contact[id]"] = params.contactId;
    queryParams["contact[objectName]"] = "Contact";
  }

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<CreditNote>>(`/CreditNote${queryString}`);
  return response.objects;
}

/**
 * Get a single credit note by ID
 */
export async function getCreditNote(params: { id: string }): Promise<CreditNote> {
  const response = await sevdeskFetch<SevdeskSingleResponse<CreditNote>>(`/CreditNote/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a new credit note using the factory endpoint
 */
export async function createCreditNote(params: {
  contactId: string;
  creditNoteDate?: string;
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
  taxType?: string;
  taxRule?: number;
  showNet?: boolean;
  bookingCategory?: string;
}): Promise<CreditNote> {
  const creditNoteDate = params.creditNoteDate || new Date().toISOString().split("T")[0];
  const userId = await getCurrentUserId();

  const creditNote: Record<string, unknown> = {
    objectName: "CreditNote",
    contact: { id: params.contactId, objectName: "Contact" },
    contactPerson: { id: userId, objectName: "SevUser" },
    creditNoteDate: creditNoteDate,
    addressCountry: { id: 1, objectName: "StaticCountry" },
    status: 100,
    taxType: params.taxRule ? "default" : (params.taxType || "default"),
    taxRate: 0,
    taxText: "Umsatzsteuer",
    currency: params.currency || "EUR",
    mapAll: true,
    showNet: params.showNet !== false,
  };

  if (params.taxRule !== undefined) creditNote.taxRule = { id: params.taxRule, objectName: "TaxRule" };
  if (params.header !== undefined) creditNote.header = params.header;
  if (params.headText !== undefined) creditNote.headText = params.headText;
  if (params.footText !== undefined) creditNote.footText = params.footText;
  if (params.bookingCategory !== undefined) creditNote.bookingCategory = params.bookingCategory;

  const creditNotePosSave = params.positions.map((pos, index) => {
    const position: Record<string, unknown> = {
      objectName: "CreditNotePos",
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
    creditNote,
    creditNotePosSave,
    takeDefaultAddress: true,
  };

  const response = await sevdeskPost<{ objects: { creditNote: CreditNote } }>("/CreditNote/Factory/saveCreditNote", body);
  return response.objects.creditNote;
}

/**
 * Update an existing credit note
 */
export async function updateCreditNote(params: {
  id: string;
  header?: string;
  headText?: string;
  footText?: string;
  customerInternalNote?: string;
}): Promise<CreditNote> {
  const body: Record<string, unknown> = {};

  if (params.header !== undefined) body.header = params.header;
  if (params.headText !== undefined) body.headText = params.headText;
  if (params.footText !== undefined) body.footText = params.footText;
  if (params.customerInternalNote !== undefined) body.customerInternalNote = params.customerInternalNote;

  const response = await sevdeskPut<SevdeskSingleResponse<CreditNote>>(`/CreditNote/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a credit note
 */
export async function deleteCreditNote(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/CreditNote/${params.id}`);
}

/**
 * Get credit note PDF as base64
 */
export async function getCreditNotePdf(params: { id: string; download?: boolean }): Promise<string> {
  const queryString = params.download ? "?download=true" : "";
  return sevdeskFetchPdf(`/CreditNote/${params.id}/getPdf${queryString}`);
}

/**
 * Send credit note via email
 */
export async function sendCreditNoteEmail(params: {
  id: string;
  email: string;
  subject: string;
  text: string;
  copy?: boolean;
}): Promise<void> {
  const body: Record<string, unknown> = {
    toEmail: params.email,
    subject: params.subject,
    text: params.text,
    copy: params.copy || false,
  };

  await sevdeskPost(`/CreditNote/${params.id}/sendViaEmail`, body);
}

/**
 * Reset credit note to draft (v2.0 — PUT /CreditNote/{id}/resetToDraft)
 */
export async function resetCreditNoteToDraft(params: { id: string }): Promise<CreditNote> {
  const response = await sevdeskPut<SevdeskSingleResponse<CreditNote>>(`/CreditNote/${params.id}/resetToDraft`, {});
  return extractSingleObject(response);
}

/**
 * Reset credit note to open (v2.0 — PUT /CreditNote/{id}/resetToOpen)
 */
export async function resetCreditNoteToOpen(params: { id: string }): Promise<CreditNote> {
  const response = await sevdeskPut<SevdeskSingleResponse<CreditNote>>(`/CreditNote/${params.id}/resetToOpen`, {});
  return extractSingleObject(response);
}

/**
 * List credit note positions
 */
export async function listCreditNotePositions(params: {
  creditNoteId: string;
  limit?: number;
  offset?: number;
}): Promise<CreditNotePos[]> {
  const queryString = buildQueryString({
    "creditNote[id]": params.creditNoteId,
    "creditNote[objectName]": "CreditNote",
    limit: params.limit ?? 100,
    offset: params.offset,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<CreditNotePos>>(`/CreditNotePos${queryString}`);
  return response.objects;
}

/**
 * Get a single credit note position
 */
export async function getCreditNotePosition(params: { id: string }): Promise<CreditNotePos> {
  const response = await sevdeskFetch<SevdeskSingleResponse<CreditNotePos>>(`/CreditNotePos/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a credit note position
 */
export async function createCreditNotePosition(params: {
  creditNoteId: string;
  quantity: number;
  price: number;
  name: string;
  taxRate: number;
  unity?: number;
  text?: string;
  discount?: number;
  partId?: string;
}): Promise<CreditNotePos> {
  const body: Record<string, unknown> = {
    creditNote: { id: params.creditNoteId, objectName: "CreditNote" },
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

  const response = await sevdeskPost<SevdeskSingleResponse<CreditNotePos>>("/CreditNotePos", body);
  return extractSingleObject(response);
}

/**
 * Update a credit note position
 */
export async function updateCreditNotePosition(params: {
  id: string;
  quantity?: number;
  price?: number;
  name?: string;
  taxRate?: number;
  text?: string;
  discount?: number;
}): Promise<CreditNotePos> {
  const body: Record<string, unknown> = {};

  if (params.quantity !== undefined) body.quantity = params.quantity;
  if (params.price !== undefined) body.price = params.price;
  if (params.name !== undefined) body.name = params.name;
  if (params.taxRate !== undefined) body.taxRate = params.taxRate;
  if (params.text !== undefined) body.text = params.text;
  if (params.discount !== undefined) body.discount = params.discount;

  const response = await sevdeskPut<SevdeskSingleResponse<CreditNotePos>>(`/CreditNotePos/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a credit note position
 */
export async function deleteCreditNotePosition(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/CreditNotePos/${params.id}`);
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format credit note for display
 */
export function formatCreditNote(cn: CreditNote): string {
  const lines: string[] = [
    `ID: ${cn.id}`,
    `Credit Note Number: ${cn.creditNoteNumber}`,
    `Status: ${getStatusLabel(cn.status)}`,
    `Credit Note Date: ${cn.creditNoteDate}`,
    `Currency: ${cn.currency}`,
    `Sum Net: ${cn.sumNet}`,
    `Sum Tax: ${cn.sumTax}`,
    `Sum Gross: ${cn.sumGross}`,
  ];

  if (cn.contact) lines.push(`Contact ID: ${cn.contact.id}`);
  if (cn.header) lines.push(`Header: ${cn.header}`);
  lines.push(`Created: ${cn.create}`);
  lines.push(`Updated: ${cn.update}`);

  return lines.join("\n");
}

/**
 * Format credit notes list for display
 */
export function formatCreditNotesList(creditNotes: CreditNote[]): string {
  if (creditNotes.length === 0) {
    return "No credit notes found.";
  }

  const lines: string[] = [`Found ${creditNotes.length} credit note(s):\n`];

  for (const cn of creditNotes) {
    const status = getStatusLabel(cn.status);
    lines.push(
      `- [${cn.id}] ${cn.creditNoteNumber} | ${cn.creditNoteDate} | ${cn.sumGross} ${cn.currency} | ${status}`
    );
  }

  return lines.join("\n");
}

/**
 * Format credit note status change result
 */
export function formatCreditNoteStatusChangeResult(cn: CreditNote, action: string): string {
  return `Credit note ${cn.creditNoteNumber} ${action}: ${getStatusLabel(cn.status)}`;
}

/**
 * Format credit note result
 */
export function formatCreditNoteResult(cn: CreditNote, action: string): string {
  return `Credit note ${action} successfully:\n${formatCreditNote(cn)}`;
}

/**
 * Format credit note delete result
 */
export function formatCreditNoteDeleteResult(id: string): string {
  return `Credit note ${id} deleted successfully.`;
}

/**
 * Format credit note PDF result
 */
export function formatCreditNotePdfResult(content: string, id: string): string {
  return `Credit note ${id} PDF retrieved successfully.\nBase64 content length: ${content.length} characters`;
}

/**
 * Format credit note email sent result
 */
export function formatCreditNoteEmailSentResult(id: string, email: string): string {
  return `Credit note ${id} sent successfully to ${email}.`;
}

/**
 * Format credit note position
 */
export function formatCreditNotePosition(pos: CreditNotePos): string {
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
 * Format credit note positions list
 */
export function formatCreditNotePositionsList(positions: CreditNotePos[]): string {
  if (positions.length === 0) {
    return "No credit note positions found.";
  }

  const lines: string[] = [`Found ${positions.length} position(s):\n`];

  for (const pos of positions) {
    lines.push(`- [${pos.id}] ${pos.name} | Qty: ${pos.quantity} | ${pos.sumGross}`);
  }

  return lines.join("\n");
}

/**
 * Format credit note position result
 */
export function formatCreditNotePositionResult(pos: CreditNotePos, action: string): string {
  return `Credit note position ${action} successfully:\n${formatCreditNotePosition(pos)}`;
}

/**
 * Format credit note position delete result
 */
export function formatCreditNotePositionDeleteResult(id: string): string {
  return `Credit note position ${id} deleted successfully.`;
}
