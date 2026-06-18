/**
 * Communication Way Tools
 * MCP tools for managing sevdesk communication ways (email, phone, etc.)
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { CommunicationWay } from "../types.js";

// ============================================================================
// Schemas
// ============================================================================

/**
 * List communication ways schema
 */
export const listCommunicationWaysSchema = {
  contactId: z.string().optional().describe("Filter by contact ID"),
  type: z.string().optional().describe("Filter by type: EMAIL, PHONE, WEB, MOBILE, FAX"),
  limit: z.number().optional().describe("Maximum number of communication ways to return (default: 100)"),
  offset: z.number().optional().describe("Number of communication ways to skip for pagination"),
};

/**
 * Get communication way schema
 */
export const getCommunicationWaySchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk communication way ID"),
};

/**
 * Create communication way schema
 */
export const createCommunicationWaySchema = {
  contactId: z.string().describe("Contact ID this communication way belongs to"),
  type: z.string().describe("Type: EMAIL, PHONE, WEB, MOBILE, FAX"),
  value: z.string().describe("The value (email address, phone number, URL, etc.)"),
  keyId: z.number().describe("Key ID: 1=work, 2=private (for phone/email)"),
  main: z.boolean().optional().describe("Set as main/primary communication way"),
};

/**
 * Update communication way schema
 */
export const updateCommunicationWaySchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk communication way ID to update"),
  value: z.string().optional().describe("The value (email address, phone number, URL, etc.)"),
  main: z.boolean().optional().describe("Set as main/primary communication way"),
};

/**
 * Delete communication way schema
 */
export const deleteCommunicationWaySchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk communication way ID to delete"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Get communication way type label
 */
function getTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    "EMAIL": "Email",
    "PHONE": "Phone",
    "WEB": "Website",
    "MOBILE": "Mobile",
    "FAX": "Fax",
  };
  return typeMap[type] || type;
}

/**
 * List communication ways
 */
export async function listCommunicationWays(params: {
  contactId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<CommunicationWay[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
  };

  if (params.contactId) {
    queryParams["contact[id]"] = params.contactId;
    queryParams["contact[objectName]"] = "Contact";
  }
  if (params.type) queryParams["type"] = params.type;

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<CommunicationWay>>(`/CommunicationWay${queryString}`);
  return response.objects;
}

/**
 * Get a single communication way by ID
 */
export async function getCommunicationWay(params: { id: string }): Promise<CommunicationWay> {
  const response = await sevdeskFetch<SevdeskSingleResponse<CommunicationWay>>(`/CommunicationWay/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a new communication way
 */
export async function createCommunicationWay(params: {
  contactId: string;
  type: string;
  value: string;
  keyId: number;
  main?: boolean;
}): Promise<CommunicationWay> {
  const body: Record<string, unknown> = {
    contact: { id: params.contactId, objectName: "Contact" },
    type: params.type,
    value: params.value,
    key: { id: params.keyId, objectName: "CommunicationWayKey" },
    main: params.main ? "1" : "0",
  };

  const response = await sevdeskPost<SevdeskSingleResponse<CommunicationWay>>("/CommunicationWay", body);
  return extractSingleObject(response);
}

/**
 * Update an existing communication way
 */
export async function updateCommunicationWay(params: {
  id: string;
  value?: string;
  main?: boolean;
}): Promise<CommunicationWay> {
  const body: Record<string, unknown> = {};

  if (params.value !== undefined) body.value = params.value;
  if (params.main !== undefined) body.main = params.main ? "1" : "0";

  const response = await sevdeskPut<SevdeskSingleResponse<CommunicationWay>>(`/CommunicationWay/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a communication way
 */
export async function deleteCommunicationWay(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/CommunicationWay/${params.id}`);
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format communication way for display
 */
export function formatCommunicationWay(cw: CommunicationWay): string {
  const lines: string[] = [
    `ID: ${cw.id}`,
    `Contact ID: ${cw.contact.id}`,
    `Type: ${getTypeLabel(cw.type)}`,
    `Value: ${cw.value}`,
    `Main: ${cw.main === "1" ? "Yes" : "No"}`,
  ];

  lines.push(`Created: ${cw.create}`);
  lines.push(`Updated: ${cw.update}`);

  return lines.join("\n");
}

/**
 * Format communication ways list for display
 */
export function formatCommunicationWaysList(communicationWays: CommunicationWay[]): string {
  if (communicationWays.length === 0) {
    return "No communication ways found.";
  }

  const lines: string[] = [`Found ${communicationWays.length} communication way(s):\n`];

  for (const cw of communicationWays) {
    const main = cw.main === "1" ? " [MAIN]" : "";
    lines.push(`- [${cw.id}] ${getTypeLabel(cw.type)}: ${cw.value}${main}`);
  }

  return lines.join("\n");
}

/**
 * Format communication way result
 */
export function formatCommunicationWayResult(cw: CommunicationWay, action: string): string {
  return `Communication way ${action} successfully:\n${formatCommunicationWay(cw)}`;
}

/**
 * Format communication way delete result
 */
export function formatCommunicationWayDeleteResult(id: string): string {
  return `Communication way ${id} deleted successfully.`;
}
