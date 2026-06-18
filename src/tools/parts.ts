/**
 * Part Tools
 * MCP tools for managing sevdesk parts (products/services)
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { Part } from "../types.js";

// ============================================================================
// Schemas
// ============================================================================

/**
 * List parts schema
 */
export const listPartsSchema = {
  limit: z.number().optional().describe("Maximum number of parts to return (default: 100)"),
  offset: z.number().optional().describe("Number of parts to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  partNumber: z.string().optional().describe("Filter by part number"),
  name: z.string().optional().describe("Filter by name (partial match)"),
};

/**
 * Get part schema
 */
export const getPartSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk part ID"),
};

/**
 * Create part schema
 */
export const createPartSchema = {
  name: z.string().describe("Part name"),
  partNumber: z.string().optional().describe("Part number (auto-generated if not provided)"),
  text: z.string().optional().describe("Description text"),
  priceNet: z.number().optional().describe("Net price"),
  priceGross: z.number().optional().describe("Gross price"),
  taxRate: z.number().describe("Tax rate percentage"),
  unity: z.number().optional().describe("Unity ID (1=piece, 9=hour, etc.)"),
  stock: z.number().optional().describe("Initial stock quantity"),
  stockEnabled: z.boolean().optional().describe("Enable stock tracking"),
  categoryId: z.number().optional().describe("Category ID"),
  pricePurchase: z.number().optional().describe("Purchase price"),
  internalComment: z.string().optional().describe("Internal comment/notes"),
};

/**
 * Update part schema
 */
export const updatePartSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk part ID to update"),
  name: z.string().optional().describe("Part name"),
  partNumber: z.string().optional().describe("Part number"),
  text: z.string().optional().describe("Description text"),
  priceNet: z.number().optional().describe("Net price"),
  priceGross: z.number().optional().describe("Gross price"),
  taxRate: z.number().optional().describe("Tax rate percentage"),
  stock: z.number().optional().describe("Stock quantity"),
  stockEnabled: z.boolean().optional().describe("Enable stock tracking"),
  pricePurchase: z.number().optional().describe("Purchase price"),
  internalComment: z.string().optional().describe("Internal comment/notes"),
  status: z.string().optional().describe("Part status"),
};

/**
 * Delete part schema
 */
export const deletePartSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk part ID to delete"),
};

/**
 * Get part stock schema
 */
export const getPartStockSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk part ID"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * List all parts
 */
export async function listParts(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  partNumber?: string;
  name?: string;
}): Promise<Part[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  };

  if (params.partNumber) queryParams["partNumber"] = params.partNumber;
  if (params.name) queryParams["name"] = params.name;

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<Part>>(`/Part${queryString}`);
  return response.objects;
}

/**
 * Get a single part by ID
 */
export async function getPart(params: { id: string }): Promise<Part> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Part>>(`/Part/${params.id}`);
  return extractSingleObject(response);
}

/**
 * Create a new part
 */
export async function createPart(params: {
  name: string;
  partNumber?: string;
  text?: string;
  priceNet?: number;
  priceGross?: number;
  taxRate: number;
  unity?: number;
  stock?: number;
  stockEnabled?: boolean;
  categoryId?: number;
  pricePurchase?: number;
  internalComment?: string;
}): Promise<Part> {
  const body: Record<string, unknown> = {
    name: params.name,
    taxRate: params.taxRate,
    unity: { id: params.unity || 1, objectName: "Unity" },
    status: "100", // Active
  };

  if (params.partNumber !== undefined) body.partNumber = params.partNumber;
  if (params.text !== undefined) body.text = params.text;
  if (params.priceNet !== undefined) body.priceNet = params.priceNet;
  if (params.priceGross !== undefined) body.priceGross = params.priceGross;
  if (params.stock !== undefined) body.stock = params.stock;
  if (params.stockEnabled !== undefined) body.stockEnabled = params.stockEnabled;
  if (params.categoryId !== undefined) {
    body.category = { id: params.categoryId, objectName: "Category" };
  }
  if (params.pricePurchase !== undefined) body.pricePurchase = params.pricePurchase;
  if (params.internalComment !== undefined) body.internalComment = params.internalComment;

  const response = await sevdeskPost<SevdeskSingleResponse<Part>>("/Part", body);
  return extractSingleObject(response);
}

/**
 * Update an existing part
 */
export async function updatePart(params: {
  id: string;
  name?: string;
  partNumber?: string;
  text?: string;
  priceNet?: number;
  priceGross?: number;
  taxRate?: number;
  stock?: number;
  stockEnabled?: boolean;
  pricePurchase?: number;
  internalComment?: string;
  status?: string;
}): Promise<Part> {
  const body: Record<string, unknown> = {};

  if (params.name !== undefined) body.name = params.name;
  if (params.partNumber !== undefined) body.partNumber = params.partNumber;
  if (params.text !== undefined) body.text = params.text;
  if (params.priceNet !== undefined) body.priceNet = params.priceNet;
  if (params.priceGross !== undefined) body.priceGross = params.priceGross;
  if (params.taxRate !== undefined) body.taxRate = params.taxRate;
  if (params.stock !== undefined) body.stock = params.stock;
  if (params.stockEnabled !== undefined) body.stockEnabled = params.stockEnabled;
  if (params.pricePurchase !== undefined) body.pricePurchase = params.pricePurchase;
  if (params.internalComment !== undefined) body.internalComment = params.internalComment;
  if (params.status !== undefined) body.status = params.status;

  const response = await sevdeskPut<SevdeskSingleResponse<Part>>(`/Part/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a part
 */
export async function deletePart(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Part/${params.id}`);
}

/**
 * Get part stock information
 */
export async function getPartStock(params: { id: string }): Promise<number> {
  const response = await sevdeskFetch<{ objects: number }>(`/Part/${params.id}/getStock`);
  return response.objects;
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format part for display
 */
export function formatPart(part: Part): string {
  const lines: string[] = [
    `ID: ${part.id}`,
    `Name: ${part.name}`,
    `Part Number: ${part.partNumber}`,
    `Tax Rate: ${part.taxRate}%`,
    `Status: ${part.status}`,
  ];

  if (part.priceNet !== null) lines.push(`Price (net): ${part.priceNet}`);
  if (part.priceGross !== null) lines.push(`Price (gross): ${part.priceGross}`);
  if (part.pricePurchase !== null) lines.push(`Purchase Price: ${part.pricePurchase}`);
  if (part.text) lines.push(`Description: ${part.text}`);
  if (part.stockEnabled) {
    lines.push(`Stock: ${part.stock}`);
    lines.push(`Stock Enabled: Yes`);
  }
  if (part.internalComment) lines.push(`Internal Comment: ${part.internalComment}`);
  lines.push(`Created: ${part.create}`);
  lines.push(`Updated: ${part.update}`);

  return lines.join("\n");
}

/**
 * Format parts list for display
 */
export function formatPartsList(parts: Part[]): string {
  if (parts.length === 0) {
    return "No parts found.";
  }

  const lines: string[] = [`Found ${parts.length} part(s):\n`];

  for (const part of parts) {
    const price = part.priceNet !== null ? `${part.priceNet}` : "N/A";
    lines.push(`- [${part.id}] ${part.partNumber} | ${part.name} | ${price}`);
  }

  return lines.join("\n");
}

/**
 * Format part result
 */
export function formatPartResult(part: Part, action: string): string {
  return `Part ${action} successfully:\n${formatPart(part)}`;
}

/**
 * Format part delete result
 */
export function formatPartDeleteResult(id: string): string {
  return `Part ${id} deleted successfully.`;
}

/**
 * Format stock result
 */
export function formatStockResult(stock: number, id: string): string {
  return `Part ${id} current stock: ${stock}`;
}
