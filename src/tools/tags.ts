/**
 * Tag Tools
 * MCP tools for managing sevdesk tags and tag relations
 */

import { z } from "zod";
import { idSchema, idSegment } from "../validation.js";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { Tag, TagRelation } from "../types.js";

// ============================================================================
// Schemas
// ============================================================================

/**
 * List tags schema
 */
export const listTagsSchema = {
  limit: z.number().optional().describe("Maximum number of tags to return (default: 100)"),
  offset: z.number().optional().describe("Number of tags to skip for pagination"),
  name: z.string().optional().describe("Filter by tag name (partial match)"),
};

/**
 * Get tag schema
 */
export const getTagSchema = {
  id: idSchema.describe("The sevdesk tag ID"),
};

/**
 * Create tag schema
 */
export const createTagSchema = {
  name: z.string().describe("Tag name"),
};

/**
 * Update tag schema
 */
export const updateTagSchema = {
  id: idSchema.describe("The sevdesk tag ID to update"),
  name: z.string().describe("New tag name"),
};

/**
 * Delete tag schema
 */
export const deleteTagSchema = {
  id: idSchema.describe("The sevdesk tag ID to delete"),
};

/**
 * List tag relations schema
 */
export const listTagRelationsSchema = {
  tagId: z.string().optional().describe("Filter by tag ID"),
  objectName: z.string().optional().describe("Filter by object type (Contact, Invoice, Voucher, etc.)"),
  objectId: z.string().optional().describe("Filter by object ID"),
  limit: z.number().optional().describe("Maximum number of relations to return (default: 100)"),
  offset: z.number().optional().describe("Number of relations to skip for pagination"),
};

/**
 * Add tag to object schema
 */
export const addTagToObjectSchema = {
  tagId: z.string().describe("The tag ID to add"),
  objectName: z.string().describe("The object type (Contact, Invoice, Voucher, Order, CreditNote, Part)"),
  objectId: z.string().describe("The object ID to tag"),
};

/**
 * Remove tag from object schema
 */
export const removeTagFromObjectSchema = {
  id: idSchema.describe("The tag relation ID to delete"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * List all tags
 */
export async function listTags(params: {
  limit?: number;
  offset?: number;
  name?: string;
}): Promise<Tag[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
  };

  if (params.name) queryParams["name"] = params.name;

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<Tag>>(`/Tag${queryString}`);
  return response.objects;
}

/**
 * Get a single tag by ID
 */
export async function getTag(params: { id: string }): Promise<Tag> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Tag>>(`/Tag/${idSegment(params.id)}`);
  return extractSingleObject(response);
}

/**
 * Create a new tag
 */
export async function createTag(params: { name: string }): Promise<Tag> {
  const body: Record<string, unknown> = {
    name: params.name,
  };

  const response = await sevdeskPost<SevdeskSingleResponse<Tag>>("/Tag", body);
  return extractSingleObject(response);
}

/**
 * Update an existing tag
 */
export async function updateTag(params: { id: string; name: string }): Promise<Tag> {
  const body: Record<string, unknown> = {
    name: params.name,
  };

  const response = await sevdeskPut<SevdeskSingleResponse<Tag>>(`/Tag/${idSegment(params.id)}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a tag
 */
export async function deleteTag(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Tag/${idSegment(params.id)}`);
}

/**
 * List tag relations
 */
export async function listTagRelations(params: {
  tagId?: string;
  objectName?: string;
  objectId?: string;
  limit?: number;
  offset?: number;
}): Promise<TagRelation[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
  };

  if (params.tagId) {
    queryParams["tag[id]"] = params.tagId;
    queryParams["tag[objectName]"] = "Tag";
  }
  if (params.objectName && params.objectId) {
    queryParams["object[id]"] = params.objectId;
    queryParams["object[objectName]"] = params.objectName;
  }

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<TagRelation>>(`/TagRelation${queryString}`);
  return response.objects;
}

/**
 * Add a tag to an object
 */
export async function addTagToObject(params: {
  tagId: string;
  objectName: string;
  objectId: string;
}): Promise<TagRelation> {
  const body: Record<string, unknown> = {
    tag: { id: params.tagId, objectName: "Tag" },
    object: { id: params.objectId, objectName: params.objectName },
  };

  const response = await sevdeskPost<SevdeskSingleResponse<TagRelation>>("/TagRelation", body);
  return extractSingleObject(response);
}

/**
 * Remove a tag from an object (delete tag relation)
 */
export async function removeTagFromObject(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/TagRelation/${idSegment(params.id)}`);
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format tag for display
 */
export function formatTag(tag: Tag): string {
  const lines: string[] = [
    `ID: ${tag.id}`,
    `Name: ${tag.name}`,
    `Created: ${tag.create}`,
    `Updated: ${tag.update}`,
  ];

  return lines.join("\n");
}

/**
 * Format tags list for display
 */
export function formatTagsList(tags: Tag[]): string {
  if (tags.length === 0) {
    return "No tags found.";
  }

  const lines: string[] = [`Found ${tags.length} tag(s):\n`];

  for (const tag of tags) {
    lines.push(`- [${tag.id}] ${tag.name}`);
  }

  return lines.join("\n");
}

/**
 * Format tag result
 */
export function formatTagResult(tag: Tag, action: string): string {
  return `Tag ${action} successfully:\n${formatTag(tag)}`;
}

/**
 * Format tag delete result
 */
export function formatTagDeleteResult(id: string): string {
  return `Tag ${id} deleted successfully.`;
}

/**
 * Format tag relation for display
 */
export function formatTagRelation(relation: TagRelation): string {
  return `Tag Relation ID: ${relation.id}\nTag ID: ${relation.tag.id}\nObject: ${relation.object.objectName} (ID: ${relation.object.id})`;
}

/**
 * Format tag relations list for display
 */
export function formatTagRelationsList(relations: TagRelation[]): string {
  if (relations.length === 0) {
    return "No tag relations found.";
  }

  const lines: string[] = [`Found ${relations.length} tag relation(s):\n`];

  for (const relation of relations) {
    lines.push(`- [${relation.id}] Tag ${relation.tag.id} -> ${relation.object.objectName}:${relation.object.id}`);
  }

  return lines.join("\n");
}

/**
 * Format tag relation result
 */
export function formatTagRelationResult(relation: TagRelation, action: string): string {
  return `Tag relation ${action} successfully:\n${formatTagRelation(relation)}`;
}

/**
 * Format tag relation delete result
 */
export function formatTagRelationDeleteResult(id: string): string {
  return `Tag relation ${id} removed successfully.`;
}
