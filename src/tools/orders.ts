/**
 * Order Tools
 * MCP tools for managing sevdesk orders
 */

import { z } from "zod";
import { idSchema, idSegment } from "../validation.js";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, sevdeskFetchPdf, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { Order, OrderPos } from "../types.js";

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
 * List orders schema
 */
export const listOrdersSchema = {
  limit: z.number().optional().describe("Maximum number of orders to return (default: 100)"),
  offset: z.number().optional().describe("Number of orders to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
  status: z.string().optional().describe("Filter by order status"),
  orderNumber: z.string().optional().describe("Filter by order number"),
  startDate: z.string().optional().describe("Filter orders from this date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("Filter orders until this date (YYYY-MM-DD)"),
  contactId: z.string().optional().describe("Filter by contact ID"),
};

/**
 * Get order schema
 */
export const getOrderSchema = {
  id: idSchema.describe("The sevdesk order ID"),
};

/**
 * Order position schema for creating orders
 */
const orderPositionSchema = z.object({
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
 * Create order schema
 */
export const createOrderSchema = {
  contactId: z.string().describe("Contact ID for the order recipient"),
  orderDate: z.string().optional().describe("Order date (YYYY-MM-DD), defaults to today"),
  positions: z.array(orderPositionSchema).describe("Order line items"),
  header: z.string().optional().describe("Order header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  deliveryDate: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
  orderType: z.string().optional().describe("Order type: AN (offer), AB (order confirmation), LI (delivery note)"),
  taxType: z.string().optional().describe("Tax type: default, eu, noteu, custom, ss (v1.0 — use taxRule for v2.0 accounts)"),
  taxRule: z.number().optional().describe("Tax rule for v2.0 accounts: 1=taxable (default for Regelbesteuerer), 2=EU intra-community, 3=reverse charge §13b, 11=Kleinunternehmer §19, 17=not taxable inland"),
  showNet: z.boolean().optional().describe("Show net prices (default: true)"),
};

/**
 * Update order schema
 */
export const updateOrderSchema = {
  id: idSchema.describe("The sevdesk order ID to update"),
  header: z.string().optional().describe("Order header/title"),
  headText: z.string().optional().describe("Text before positions"),
  footText: z.string().optional().describe("Text after positions"),
  deliveryDate: z.string().optional().describe("Delivery date (YYYY-MM-DD)"),
  customerInternalNote: z.string().optional().describe("Internal note"),
};

/**
 * Delete order schema
 */
export const deleteOrderSchema = {
  id: idSchema.describe("The sevdesk order ID to delete"),
};

/**
 * Get order PDF schema
 */
export const getOrderPdfSchema = {
  id: idSchema.describe("The sevdesk order ID"),
  download: z.boolean().optional().describe("Set to true to get download-ready content"),
};

/**
 * Send order via email schema
 */
export const sendOrderEmailSchema = {
  id: idSchema.describe("The sevdesk order ID"),
  email: z.string().describe("Recipient email address"),
  subject: z.string().describe("Email subject"),
  text: z.string().describe("Email body text"),
  copy: z.boolean().optional().describe("Send a copy to yourself"),
};

/**
 * Change order status schema
 */
export const changeOrderStatusSchema = {
  id: idSchema.describe("The sevdesk order ID"),
  status: z.number().describe("New status: 100 (created), 200 (sent), 300 (accepted), 500 (rejected)"),
};

/**
 * List order positions schema
 */
export const listOrderPositionsSchema = {
  orderId: z.string().describe("The order ID to get positions for"),
  limit: z.number().optional().describe("Maximum number of positions to return"),
  offset: z.number().optional().describe("Number of positions to skip for pagination"),
};

/**
 * Get order position schema
 */
export const getOrderPositionSchema = {
  id: idSchema.describe("The order position ID"),
};

/**
 * Create order position schema
 */
export const createOrderPositionSchema = {
  orderId: z.string().describe("The order ID to add position to"),
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
 * Update order position schema
 */
export const updateOrderPositionSchema = {
  id: idSchema.describe("The order position ID to update"),
  quantity: z.number().optional().describe("Quantity"),
  price: z.number().optional().describe("Unit price (net)"),
  name: z.string().optional().describe("Position name/description"),
  taxRate: z.number().optional().describe("Tax rate percentage"),
  text: z.string().optional().describe("Additional text"),
  discount: z.number().optional().describe("Discount percentage"),
};

/**
 * Delete order position schema
 */
export const deleteOrderPositionSchema = {
  id: idSchema.describe("The order position ID to delete"),
};

// ============================================================================
// Functions
// ============================================================================

/**
 * Get order status label
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    "100": "Created",
    "200": "Sent",
    "300": "Accepted",
    "500": "Rejected",
    "750": "Partially calculated",
    "1000": "Calculated",
  };
  return statusMap[status] || `Unknown (${status})`;
}

/**
 * List all orders
 */
export async function listOrders(params: {
  limit?: number;
  offset?: number;
  depth?: number;
  status?: string;
  orderNumber?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
}): Promise<Order[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  };

  if (params.status) queryParams["status"] = params.status;
  if (params.orderNumber) queryParams["orderNumber"] = params.orderNumber;
  if (params.startDate) queryParams["startDate"] = params.startDate;
  if (params.endDate) queryParams["endDate"] = params.endDate;
  if (params.contactId) {
    queryParams["contact[id]"] = params.contactId;
    queryParams["contact[objectName]"] = "Contact";
  }

  const queryString = buildQueryString(queryParams);
  const response = await sevdeskFetch<SevdeskApiResponse<Order>>(`/Order${queryString}`);
  return response.objects;
}

/**
 * Get a single order by ID
 */
export async function getOrder(params: { id: string }): Promise<Order> {
  const response = await sevdeskFetch<SevdeskSingleResponse<Order>>(`/Order/${idSegment(params.id)}`);
  return extractSingleObject(response);
}

/**
 * Create a new order using the factory endpoint
 */
export async function createOrder(params: {
  contactId: string;
  orderDate?: string;
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
  deliveryDate?: string;
  orderType?: string;
  taxType?: string;
  taxRule?: number;
  showNet?: boolean;
}): Promise<Order> {
  const orderDate = params.orderDate || new Date().toISOString().split("T")[0];
  const userId = await getCurrentUserId();

  const order: Record<string, unknown> = {
    objectName: "Order",
    contact: { id: params.contactId, objectName: "Contact" },
    contactPerson: { id: userId, objectName: "SevUser" },
    orderDate: orderDate,
    addressCountry: { id: 1, objectName: "StaticCountry" },
    status: 100,
    taxType: params.taxRule ? "default" : (params.taxType || "default"),
    taxRate: 0,
    taxText: "Umsatzsteuer",
    currency: params.currency || "EUR",
    orderType: params.orderType || "AN",
    mapAll: true,
    showNet: params.showNet !== false,
  };

  if (params.taxRule !== undefined) order.taxRule = { id: params.taxRule, objectName: "TaxRule" };
  if (params.header !== undefined) order.header = params.header;
  if (params.headText !== undefined) order.headText = params.headText;
  if (params.footText !== undefined) order.footText = params.footText;
  if (params.deliveryDate !== undefined) order.deliveryDate = params.deliveryDate;

  const orderPosSave = params.positions.map((pos, index) => {
    const position: Record<string, unknown> = {
      objectName: "OrderPos",
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
    order,
    orderPosSave,
    takeDefaultAddress: true,
  };

  const response = await sevdeskPost<{ objects: { order: Order } }>("/Order/Factory/saveOrder", body);
  return response.objects.order;
}

/**
 * Update an existing order
 */
export async function updateOrder(params: {
  id: string;
  header?: string;
  headText?: string;
  footText?: string;
  deliveryDate?: string;
  customerInternalNote?: string;
}): Promise<Order> {
  const body: Record<string, unknown> = {};

  if (params.header !== undefined) body.header = params.header;
  if (params.headText !== undefined) body.headText = params.headText;
  if (params.footText !== undefined) body.footText = params.footText;
  if (params.deliveryDate !== undefined) body.deliveryDate = params.deliveryDate;
  if (params.customerInternalNote !== undefined) body.customerInternalNote = params.customerInternalNote;

  const response = await sevdeskPut<SevdeskSingleResponse<Order>>(`/Order/${idSegment(params.id)}`, body);
  return extractSingleObject(response);
}

/**
 * Delete an order
 */
export async function deleteOrder(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/Order/${idSegment(params.id)}`);
}

/**
 * Get order PDF as base64
 */
export async function getOrderPdf(params: { id: string; download?: boolean }): Promise<string> {
  const queryString = params.download ? "?download=true" : "";
  return sevdeskFetchPdf(`/Order/${idSegment(params.id)}/getPdf${queryString}`);
}

/**
 * Send order via email
 */
export async function sendOrderEmail(params: {
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

  await sevdeskPost(`/Order/${idSegment(params.id)}/sendViaEmail`, body);
}

/**
 * Change order status
 */
export async function changeOrderStatus(params: { id: string; status: number }): Promise<Order> {
  const response = await sevdeskPut<SevdeskSingleResponse<Order>>(`/Order/${idSegment(params.id)}/changeStatus`, {
    value: params.status,
  });
  return extractSingleObject(response);
}

/**
 * List order positions
 */
export async function listOrderPositions(params: {
  orderId: string;
  limit?: number;
  offset?: number;
}): Promise<OrderPos[]> {
  const queryString = buildQueryString({
    "order[id]": params.orderId,
    "order[objectName]": "Order",
    limit: params.limit ?? 100,
    offset: params.offset,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<OrderPos>>(`/OrderPos${queryString}`);
  return response.objects;
}

/**
 * Get a single order position
 */
export async function getOrderPosition(params: { id: string }): Promise<OrderPos> {
  const response = await sevdeskFetch<SevdeskSingleResponse<OrderPos>>(`/OrderPos/${idSegment(params.id)}`);
  return extractSingleObject(response);
}

/**
 * Create an order position
 */
export async function createOrderPosition(params: {
  orderId: string;
  quantity: number;
  price: number;
  name: string;
  taxRate: number;
  unity?: number;
  text?: string;
  discount?: number;
  partId?: string;
}): Promise<OrderPos> {
  const body: Record<string, unknown> = {
    order: { id: params.orderId, objectName: "Order" },
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

  const response = await sevdeskPost<SevdeskSingleResponse<OrderPos>>("/OrderPos", body);
  return extractSingleObject(response);
}

/**
 * Update an order position
 */
export async function updateOrderPosition(params: {
  id: string;
  quantity?: number;
  price?: number;
  name?: string;
  taxRate?: number;
  text?: string;
  discount?: number;
}): Promise<OrderPos> {
  const body: Record<string, unknown> = {};

  if (params.quantity !== undefined) body.quantity = params.quantity;
  if (params.price !== undefined) body.price = params.price;
  if (params.name !== undefined) body.name = params.name;
  if (params.taxRate !== undefined) body.taxRate = params.taxRate;
  if (params.text !== undefined) body.text = params.text;
  if (params.discount !== undefined) body.discount = params.discount;

  const response = await sevdeskPut<SevdeskSingleResponse<OrderPos>>(`/OrderPos/${idSegment(params.id)}`, body);
  return extractSingleObject(response);
}

/**
 * Delete an order position
 */
export async function deleteOrderPosition(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/OrderPos/${idSegment(params.id)}`);
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format order for display
 */
export function formatOrder(order: Order): string {
  const lines: string[] = [
    `ID: ${order.id}`,
    `Order Number: ${order.orderNumber}`,
    `Status: ${getStatusLabel(order.status)}`,
    `Order Date: ${order.orderDate}`,
    `Order Type: ${order.orderType}`,
    `Currency: ${order.currency}`,
    `Sum Net: ${order.sumNet}`,
    `Sum Tax: ${order.sumTax}`,
    `Sum Gross: ${order.sumGross}`,
  ];

  if (order.contact) lines.push(`Contact ID: ${order.contact.id}`);
  if (order.header) lines.push(`Header: ${order.header}`);
  if (order.deliveryDate) lines.push(`Delivery Date: ${order.deliveryDate}`);
  lines.push(`Created: ${order.create}`);
  lines.push(`Updated: ${order.update}`);

  return lines.join("\n");
}

/**
 * Format orders list for display
 */
export function formatOrdersList(orders: Order[]): string {
  if (orders.length === 0) {
    return "No orders found.";
  }

  const lines: string[] = [`Found ${orders.length} order(s):\n`];

  for (const order of orders) {
    const status = getStatusLabel(order.status);
    lines.push(
      `- [${order.id}] ${order.orderNumber} | ${order.orderDate} | ${order.sumGross} ${order.currency} | ${status}`
    );
  }

  return lines.join("\n");
}

/**
 * Format order result
 */
export function formatOrderResult(order: Order, action: string): string {
  return `Order ${action} successfully:\n${formatOrder(order)}`;
}

/**
 * Format order delete result
 */
export function formatOrderDeleteResult(id: string): string {
  return `Order ${id} deleted successfully.`;
}

/**
 * Format order PDF result
 */
export function formatOrderPdfResult(content: string, id: string): string {
  return `Order ${id} PDF retrieved successfully.\nBase64 content length: ${content.length} characters`;
}

/**
 * Format order email sent result
 */
export function formatOrderEmailSentResult(id: string, email: string): string {
  return `Order ${id} sent successfully to ${email}.`;
}

/**
 * Format order status change result
 */
export function formatOrderStatusChangeResult(order: Order): string {
  return `Order ${order.orderNumber} status changed to: ${getStatusLabel(order.status)}`;
}

/**
 * Format order position
 */
export function formatOrderPosition(pos: OrderPos): string {
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
 * Format order positions list
 */
export function formatOrderPositionsList(positions: OrderPos[]): string {
  if (positions.length === 0) {
    return "No order positions found.";
  }

  const lines: string[] = [`Found ${positions.length} position(s):\n`];

  for (const pos of positions) {
    lines.push(`- [${pos.id}] ${pos.name} | Qty: ${pos.quantity} | ${pos.sumGross}`);
  }

  return lines.join("\n");
}

/**
 * Format order position result
 */
export function formatOrderPositionResult(pos: OrderPos, action: string): string {
  return `Order position ${action} successfully:\n${formatOrderPosition(pos)}`;
}

/**
 * Format order position delete result
 */
export function formatOrderPositionDeleteResult(id: string): string {
  return `Order position ${id} deleted successfully.`;
}
