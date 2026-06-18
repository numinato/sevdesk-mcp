/**
 * Address Tools
 * MCP tools for managing sevdesk contact addresses
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { ContactAddress } from "../types.js";

// ============================================================================
// Schemas
// ============================================================================

/**
 * List contact addresses schema
 */
export const listContactAddressesSchema = {
  contactId: z.string().optional().describe("Filter by contact ID"),
  limit: z.number().optional().describe("Maximum number of addresses to return (default: 100)"),
  offset: z.number().optional().describe("Number of addresses to skip for pagination"),
};

/**
 * Get contact address schema
 */
export const getContactAddressSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk contact address ID"),
};

/**
 * Create contact address schema
 */
export const createContactAddressSchema = {
  contactId: z.string().describe("Contact ID this address belongs to"),
  street: z.string().optional().describe("Street address"),
  zip: z.string().optional().describe("ZIP/postal code"),
  city: z.string().optional().describe("City"),
  countryId: z.number().optional().describe("Country ID (1=Germany, default)"),
  categoryId: z.number().optional().describe("Category ID for address type"),
  name: z.string().optional().describe("Address name/label"),
  name2: z.string().optional().describe("Additional name line 2"),
  name3: z.string().optional().describe("Additional name line 3"),
  name4: z.string().optional().describe("Additional name line 4"),
};

/**
 * Update contact address schema
 */
export const updateContactAddressSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk contact address ID to update"),
  street: z.string().optional().describe("Street address"),
  zip: z.string().optional().describe("ZIP/postal code"),
  city: z.string().optional().describe("City"),
  countryId: z.number().optional().describe("Country ID"),
  name: z.string().optional().describe("Address name/label"),
  name2: z.string().optional().describe("Additional name line 2"),
  name3: z.string().optional().describe("Additional name line 3"),
  name4: z.string().optional().describe("Additional name line 4"),
};

/**
 * Delete contact address schema
 */
export const deleteContactAddressSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk contact address ID to delete"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * List contact addresses
 */
export async function listContactAddresses(params: {
  contactId?: string;
  limit?: number;
  offset?: number;
}): Promise<ContactAddress[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
  };

  if (params.contactId) {
    queryParams["contact[id]"] = params.contactId;
    queryParams["contact[objectName]"] = "Contact";
  }

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<ContactAddress>>(`/ContactAddress${queryString}`);
  return response.objects;
}

/**
 * Get a single contact address by ID
 */
export async function getContactAddress(params: { id: string }): Promise<ContactAddress> {
  const response = await sevdeskFetch<SevdeskSingleResponse<ContactAddress>>(`/ContactAddress/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a new contact address
 */
export async function createContactAddress(params: {
  contactId: string;
  street?: string;
  zip?: string;
  city?: string;
  countryId?: number;
  categoryId?: number;
  name?: string;
  name2?: string;
  name3?: string;
  name4?: string;
}): Promise<ContactAddress> {
  const body: Record<string, unknown> = {
    contact: { id: params.contactId, objectName: "Contact" },
    country: { id: params.countryId || 1, objectName: "StaticCountry" },
  };

  if (params.street !== undefined) body.street = params.street;
  if (params.zip !== undefined) body.zip = params.zip;
  if (params.city !== undefined) body.city = params.city;
  if (params.categoryId !== undefined) {
    body.category = { id: params.categoryId, objectName: "Category" };
  }
  if (params.name !== undefined) body.name = params.name;
  if (params.name2 !== undefined) body.name2 = params.name2;
  if (params.name3 !== undefined) body.name3 = params.name3;
  if (params.name4 !== undefined) body.name4 = params.name4;

  const response = await sevdeskPost<SevdeskSingleResponse<ContactAddress>>("/ContactAddress", body);
  return extractSingleObject(response);
}

/**
 * Update an existing contact address
 */
export async function updateContactAddress(params: {
  id: string;
  street?: string;
  zip?: string;
  city?: string;
  countryId?: number;
  name?: string;
  name2?: string;
  name3?: string;
  name4?: string;
}): Promise<ContactAddress> {
  const body: Record<string, unknown> = {};

  if (params.street !== undefined) body.street = params.street;
  if (params.zip !== undefined) body.zip = params.zip;
  if (params.city !== undefined) body.city = params.city;
  if (params.countryId !== undefined) {
    body.country = { id: params.countryId, objectName: "StaticCountry" };
  }
  if (params.name !== undefined) body.name = params.name;
  if (params.name2 !== undefined) body.name2 = params.name2;
  if (params.name3 !== undefined) body.name3 = params.name3;
  if (params.name4 !== undefined) body.name4 = params.name4;

  const response = await sevdeskPut<SevdeskSingleResponse<ContactAddress>>(`/ContactAddress/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a contact address
 */
export async function deleteContactAddress(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/ContactAddress/${params.id}`);
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format contact address for display
 */
export function formatContactAddress(address: ContactAddress): string {
  const lines: string[] = [
    `ID: ${address.id}`,
    `Contact ID: ${address.contact.id}`,
  ];

  if (address.name) lines.push(`Name: ${address.name}`);
  if (address.street) lines.push(`Street: ${address.street}`);
  if (address.zip || address.city) {
    lines.push(`City: ${[address.zip, address.city].filter(Boolean).join(" ")}`);
  }
  if (address.country) lines.push(`Country ID: ${address.country.id}`);
  lines.push(`Created: ${address.create}`);
  lines.push(`Updated: ${address.update}`);

  return lines.join("\n");
}

/**
 * Format contact addresses list for display
 */
export function formatContactAddressesList(addresses: ContactAddress[]): string {
  if (addresses.length === 0) {
    return "No contact addresses found.";
  }

  const lines: string[] = [`Found ${addresses.length} address(es):\n`];

  for (const address of addresses) {
    const location = [address.street, address.zip, address.city].filter(Boolean).join(", ");
    lines.push(`- [${address.id}] ${location || "No address details"}`);
  }

  return lines.join("\n");
}

/**
 * Format contact address result
 */
export function formatContactAddressResult(address: ContactAddress, action: string): string {
  return `Contact address ${action} successfully:\n${formatContactAddress(address)}`;
}

/**
 * Format contact address delete result
 */
export function formatContactAddressDeleteResult(id: string): string {
  return `Contact address ${id} deleted successfully.`;
}
