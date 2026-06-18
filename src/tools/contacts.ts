/**
 * Contact Tools
 * MCP tools for managing sevdesk contacts (customers, suppliers, partners)
 */

import { z } from "zod";
import { idSchema, idSegment } from "../validation.js";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { Contact } from "../types.js";

/**
 * List contacts schema
 */
export const listContactsSchema = {
  limit: z.number().optional().describe("Maximum number of contacts to return (default: 100)"),
  offset: z.number().optional().describe("Number of contacts to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  customerNumber: z.string().optional().describe("Filter by customer number"),
  name: z.string().optional().describe("Filter by contact name (partial match)"),
};

/**
 * Get contact schema
 */
export const getContactSchema = {
  id: idSchema.describe("The sevdesk contact ID"),
};

/**
 * List all contacts
 */
export async function listContacts(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  customerNumber?: string;
  name?: string;
}): Promise<Contact[]> {
  const queryString = buildQueryString({
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
    "customerNumber": params.customerNumber,
    "name": params.name,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<Contact>>(
    `/Contact${queryString}`
  );

  return response.objects;
}

/**
 * Get a single contact by ID
 */
export async function getContact(params: { id: string }): Promise<Contact> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Contact>>(
    `/Contact/${idSegment(params.id)}`
  );

  return extractSingleObject(response);
}

/**
 * Format contact for display
 */
export function formatContact(contact: Contact): string {
  const lines: string[] = [
    `ID: ${contact.id}`,
    `Name: ${contact.name}`,
  ];

  if (contact.customerNumber) {
    lines.push(`Customer Number: ${contact.customerNumber}`);
  }
  if (contact.surename || contact.familyname) {
    lines.push(`Full Name: ${[contact.surename, contact.familyname].filter(Boolean).join(" ")}`);
  }
  if (contact.vatNumber) {
    lines.push(`VAT Number: ${contact.vatNumber}`);
  }
  if (contact.taxNumber) {
    lines.push(`Tax Number: ${contact.taxNumber}`);
  }
  if (contact.description) {
    lines.push(`Description: ${contact.description}`);
  }
  lines.push(`Status: ${contact.status}`);
  lines.push(`Created: ${contact.create}`);
  lines.push(`Updated: ${contact.update}`);

  return lines.join("\n");
}

/**
 * Format contacts list for display
 */
export function formatContactsList(contacts: Contact[]): string {
  if (contacts.length === 0) {
    return "No contacts found.";
  }

  const lines: string[] = [`Found ${contacts.length} contact(s):\n`];

  for (const contact of contacts) {
    const customerNum = contact.customerNumber ? ` (${contact.customerNumber})` : "";
    lines.push(`- [${contact.id}] ${contact.name}${customerNum}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Create/Update/Delete Operations
// ============================================================================

/**
 * Create contact schema
 */
export const createContactSchema = {
  name: z.string().optional().describe("Company name (for organizations)"),
  surename: z.string().optional().describe("First name (for individuals)"),
  familyname: z.string().optional().describe("Last name (for individuals)"),
  customerNumber: z.string().optional().describe("Customer number (auto-generated if not provided)"),
  category: z.number().optional().describe("Category ID (3=Customer, 4=Supplier, 28=Partner)"),
  description: z.string().optional().describe("Description/notes"),
  vatNumber: z.string().optional().describe("VAT number"),
  taxNumber: z.string().optional().describe("Tax number"),
  bankAccount: z.string().optional().describe("Bank account number (IBAN)"),
  bankNumber: z.string().optional().describe("Bank code (BIC)"),
  defaultTimeToPay: z.number().optional().describe("Default payment terms in days"),
  titel: z.string().optional().describe("Title (Mr., Mrs., etc.)"),
  academicTitle: z.string().optional().describe("Academic title (Dr., Prof., etc.)"),
  gender: z.string().optional().describe("Gender (m/f)"),
  birthday: z.string().optional().describe("Birthday (YYYY-MM-DD)"),
};

/**
 * Update contact schema
 */
export const updateContactSchema = {
  id: idSchema.describe("The sevdesk contact ID to update"),
  name: z.string().optional().describe("Company name (for organizations)"),
  surename: z.string().optional().describe("First name (for individuals)"),
  familyname: z.string().optional().describe("Last name (for individuals)"),
  customerNumber: z.string().optional().describe("Customer number"),
  description: z.string().optional().describe("Description/notes"),
  vatNumber: z.string().optional().describe("VAT number"),
  taxNumber: z.string().optional().describe("Tax number"),
  bankAccount: z.string().optional().describe("Bank account number (IBAN)"),
  bankNumber: z.string().optional().describe("Bank code (BIC)"),
  defaultTimeToPay: z.number().optional().describe("Default payment terms in days"),
  titel: z.string().optional().describe("Title (Mr., Mrs., etc.)"),
  academicTitle: z.string().optional().describe("Academic title (Dr., Prof., etc.)"),
  gender: z.string().optional().describe("Gender (m/f)"),
  birthday: z.string().optional().describe("Birthday (YYYY-MM-DD)"),
};

/**
 * Delete contact schema
 */
export const deleteContactSchema = {
  id: idSchema.describe("The sevdesk contact ID to delete"),
};

/**
 * Get next customer number schema (no params needed)
 */
export const getNextCustomerNumberSchema = {};

/**
 * Create a new contact
 */
export async function createContact(params: {
  name?: string;
  surename?: string;
  familyname?: string;
  customerNumber?: string;
  category?: number;
  description?: string;
  vatNumber?: string;
  taxNumber?: string;
  bankAccount?: string;
  bankNumber?: string;
  defaultTimeToPay?: number;
  titel?: string;
  academicTitle?: string;
  gender?: string;
  birthday?: string;
}): Promise<Contact> {
  const body: Record<string, unknown> = {};

  if (params.name !== undefined) body.name = params.name;
  if (params.surename !== undefined) body.surename = params.surename;
  if (params.familyname !== undefined) body.familyname = params.familyname;
  if (params.customerNumber !== undefined) body.customerNumber = params.customerNumber;
  if (params.category !== undefined) {
    body.category = { id: params.category, objectName: "Category" };
  }
  if (params.description !== undefined) body.description = params.description;
  if (params.vatNumber !== undefined) body.vatNumber = params.vatNumber;
  if (params.taxNumber !== undefined) body.taxNumber = params.taxNumber;
  if (params.bankAccount !== undefined) body.bankAccount = params.bankAccount;
  if (params.bankNumber !== undefined) body.bankNumber = params.bankNumber;
  if (params.defaultTimeToPay !== undefined) body.defaultTimeToPay = params.defaultTimeToPay;
  if (params.titel !== undefined) body.titel = params.titel;
  if (params.academicTitle !== undefined) body.academicTitle = params.academicTitle;
  if (params.gender !== undefined) body.gender = params.gender;
  if (params.birthday !== undefined) body.birthday = params.birthday;

  const response = await sevdeskPost<SevdeskSingleResponse<Contact>>("/Contact", body);
  return extractSingleObject(response);
}

/**
 * Update an existing contact
 */
export async function updateContact(params: {
  id: string;
  name?: string;
  surename?: string;
  familyname?: string;
  customerNumber?: string;
  description?: string;
  vatNumber?: string;
  taxNumber?: string;
  bankAccount?: string;
  bankNumber?: string;
  defaultTimeToPay?: number;
  titel?: string;
  academicTitle?: string;
  gender?: string;
  birthday?: string;
}): Promise<Contact> {
  const body: Record<string, unknown> = {};

  if (params.name !== undefined) body.name = params.name;
  if (params.surename !== undefined) body.surename = params.surename;
  if (params.familyname !== undefined) body.familyname = params.familyname;
  if (params.customerNumber !== undefined) body.customerNumber = params.customerNumber;
  if (params.description !== undefined) body.description = params.description;
  if (params.vatNumber !== undefined) body.vatNumber = params.vatNumber;
  if (params.taxNumber !== undefined) body.taxNumber = params.taxNumber;
  if (params.bankAccount !== undefined) body.bankAccount = params.bankAccount;
  if (params.bankNumber !== undefined) body.bankNumber = params.bankNumber;
  if (params.defaultTimeToPay !== undefined) body.defaultTimeToPay = params.defaultTimeToPay;
  if (params.titel !== undefined) body.titel = params.titel;
  if (params.academicTitle !== undefined) body.academicTitle = params.academicTitle;
  if (params.gender !== undefined) body.gender = params.gender;
  if (params.birthday !== undefined) body.birthday = params.birthday;

  const response = await sevdeskPut<SevdeskSingleResponse<Contact>>(`/Contact/${idSegment(params.id)}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a contact
 */
export async function deleteContact(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Contact/${idSegment(params.id)}`);
}

/**
 * Get the next available customer number
 */
export async function getNextCustomerNumber(): Promise<string> {
  const response = await sevdeskFetch<{ objects: string }>("/Contact/Factory/getNextCustomerNumber");
  return response.objects;
}

/**
 * Format created/updated contact result
 */
export function formatContactResult(contact: Contact, action: string): string {
  return `Contact ${action} successfully:\n${formatContact(contact)}`;
}

/**
 * Format delete result
 */
export function formatDeleteResult(id: string): string {
  return `Contact ${id} deleted successfully.`;
}

/**
 * Format next customer number result
 */
export function formatNextCustomerNumber(number: string): string {
  return `Next available customer number: ${number}`;
}
