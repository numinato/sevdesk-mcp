/**
 * Account Tools
 * MCP tools for managing sevdesk bank accounts (CheckAccounts) and transactions
 */

import { z } from "zod";
import { sevdeskFetch, sevdeskPost, sevdeskPut, sevdeskDelete, buildQueryString, SevdeskApiResponse, SevdeskSingleResponse, extractSingleObject } from "../api.js";
import type { CheckAccount, CheckAccountTransaction } from "../types.js";

/**
 * List check accounts schema
 */
export const listCheckAccountsSchema = {
  limit: z.number().optional().describe("Maximum number of accounts to return (default: 100)"),
  offset: z.number().optional().describe("Number of accounts to skip for pagination"),
  depth: z.number().optional().describe("Depth of nested objects (0 = flat, 1 = includes related objects)"),
};

/**
 * Get check account balance schema
 */
export const getCheckAccountBalanceSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk check account ID"),
  date: z.string().optional().describe("Date to get balance at (YYYY-MM-DD format). Defaults to today."),
};

/**
 * List all check accounts (bank accounts)
 */
export async function listCheckAccounts(params: {
  limit?: number;
  offset?: number;
  depth?: number;
}): Promise<CheckAccount[]> {
  const queryString = buildQueryString({
    limit: params.limit ?? 100,
    offset: params.offset,
    depth: params.depth ?? 0,
  });

  const response = await sevdeskFetch<SevdeskApiResponse<CheckAccount>>(
    `/CheckAccount${queryString}`
  );

  return response.objects;
}

/**
 * Get check account balance at a specific date
 */
export async function getCheckAccountBalance(params: {
  id: string;
  date?: string;
}): Promise<string> {
  // Default to today's date if not provided
  const date = params.date || new Date().toISOString().split("T")[0];

  const queryString = buildQueryString({
    date: date,
  });

  const response = await sevdeskFetch<{ objects: string }>(
    `/CheckAccount/${params.id}/getBalanceAtDate${queryString}`
  );

  return response.objects;
}

/**
 * Get account type label
 */
function getTypeLabel(type: string): string {
  const typeMap: Record<string, string> = {
    "online": "Online Banking",
    "offline": "Offline/Manual",
  };
  return typeMap[type] || type;
}

/**
 * Format check account for display
 */
export function formatCheckAccount(account: CheckAccount): string {
  const lines: string[] = [
    `ID: ${account.id}`,
    `Name: ${account.name}`,
    `Type: ${getTypeLabel(account.type)}`,
    `Currency: ${account.currency}`,
    `Status: ${account.status}`,
    `Default Account: ${account.defaultAccount === "1" ? "Yes" : "No"}`,
  ];

  if (account.importType) {
    lines.push(`Import Type: ${account.importType}`);
  }
  if (account.bankServer) {
    lines.push(`Bank Server: ${account.bankServer}`);
  }
  lines.push(`Created: ${account.create}`);
  lines.push(`Updated: ${account.update}`);

  return lines.join("\n");
}

/**
 * Format check accounts list for display
 */
export function formatCheckAccountsList(accounts: CheckAccount[]): string {
  if (accounts.length === 0) {
    return "No bank accounts found.";
  }

  const lines: string[] = [`Found ${accounts.length} bank account(s):\n`];

  for (const account of accounts) {
    const defaultLabel = account.defaultAccount === "1" ? " [DEFAULT]" : "";
    lines.push(
      `- [${account.id}] ${account.name} | ${account.currency} | ${getTypeLabel(account.type)}${defaultLabel}`
    );
  }

  return lines.join("\n");
}

/**
 * Format balance for display
 */
export function formatBalance(balance: string, accountId: string, date?: string): string {
  const dateStr = date || new Date().toISOString().split("T")[0];
  return `Account ${accountId} balance at ${dateStr}: ${balance}`;
}

// ============================================================================
// Check Account CRUD Operations
// ============================================================================

/**
 * Get check account schema
 */
export const getCheckAccountSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk check account ID"),
};

/**
 * Create check account schema
 */
export const createCheckAccountSchema = {
  name: z.string().describe("Account name"),
  type: z.string().describe("Account type: online, offline"),
  currency: z.string().optional().describe("Currency code (default: EUR)"),
  importType: z.string().optional().describe("Import type for online accounts"),
  defaultAccount: z.boolean().optional().describe("Set as default account"),
};

/**
 * Update check account schema
 */
export const updateCheckAccountSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk check account ID to update"),
  name: z.string().optional().describe("Account name"),
  currency: z.string().optional().describe("Currency code"),
  defaultAccount: z.boolean().optional().describe("Set as default account"),
  status: z.string().optional().describe("Account status"),
};

/**
 * Delete check account schema
 */
export const deleteCheckAccountSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The sevdesk check account ID to delete"),
};

/**
 * Get a single check account by ID
 */
export async function getCheckAccount(params: { id: string }): Promise<CheckAccount> {
  const response = await sevdeskFetch<SevdeskSingleResponse<CheckAccount>>(
    `/CheckAccount/${params.id}`
  );
  return extractSingleObject(response);
}

/**
 * Create a new check account
 */
export async function createCheckAccount(params: {
  name: string;
  type: string;
  currency?: string;
  importType?: string;
  defaultAccount?: boolean;
}): Promise<CheckAccount> {
  const body: Record<string, unknown> = {
    name: params.name,
    type: params.type,
    currency: params.currency || "EUR",
    status: "100", // Active
  };

  if (params.importType !== undefined) body.importType = params.importType;
  if (params.defaultAccount !== undefined) body.defaultAccount = params.defaultAccount ? "1" : "0";

  const response = await sevdeskPost<SevdeskSingleResponse<CheckAccount>>("/CheckAccount", body);
  return extractSingleObject(response);
}

/**
 * Update a check account
 */
export async function updateCheckAccount(params: {
  id: string;
  name?: string;
  currency?: string;
  defaultAccount?: boolean;
  status?: string;
}): Promise<CheckAccount> {
  const body: Record<string, unknown> = {};

  if (params.name !== undefined) body.name = params.name;
  if (params.currency !== undefined) body.currency = params.currency;
  if (params.defaultAccount !== undefined) body.defaultAccount = params.defaultAccount ? "1" : "0";
  if (params.status !== undefined) body.status = params.status;

  const response = await sevdeskPut<SevdeskSingleResponse<CheckAccount>>(`/CheckAccount/${params.id}`, body);
  return extractSingleObject(response);
}

/**
 * Delete a check account
 */
export async function deleteCheckAccount(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/CheckAccount/${params.id}`);
}

/**
 * Format check account result
 */
export function formatCheckAccountResult(account: CheckAccount, action: string): string {
  return `Check account ${action} successfully:\n${formatCheckAccount(account)}`;
}

/**
 * Format check account delete result
 */
export function formatCheckAccountDeleteResult(id: string): string {
  return `Check account ${id} deleted successfully.`;
}

// ============================================================================
// Transaction Tools
// ============================================================================

/**
 * List transactions schema
 */
export const listTransactionsSchema = {
  checkAccountId: z.string().optional().describe("Filter by check account ID"),
  limit: z.number().optional().describe("Maximum number of transactions to return (default: 100)"),
  offset: z.number().optional().describe("Number of transactions to skip for pagination"),
  startDate: z.string().optional().describe("Filter transactions from this date (YYYY-MM-DD)"),
  endDate: z.string().optional().describe("Filter transactions until this date (YYYY-MM-DD)"),
  status: z.string().optional().describe("Filter by status"),
};

/**
 * Get transaction schema
 */
export const getTransactionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The transaction ID"),
};

/**
 * Create transaction schema
 */
export const createTransactionSchema = {
  checkAccountId: z.string().describe("Check account ID"),
  amount: z.number().describe("Transaction amount (positive for income, negative for expense)"),
  valueDate: z.string().describe("Value date (YYYY-MM-DD)"),
  payeePayerName: z.string().optional().describe("Name of payee/payer"),
  paymtPurpose: z.string().optional().describe("Payment purpose/description"),
  entryDate: z.string().optional().describe("Entry date (YYYY-MM-DD)"),
};

/**
 * Update transaction schema
 */
export const updateTransactionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The transaction ID to update"),
  payeePayerName: z.string().optional().describe("Name of payee/payer"),
  paymtPurpose: z.string().optional().describe("Payment purpose/description"),
  status: z.string().optional().describe("Transaction status"),
};

/**
 * Delete transaction schema
 */
export const deleteTransactionSchema = {
  id: z.string().regex(/^\d+$/, "Must be a numeric sevDesk ID").describe("The transaction ID to delete"),
};

/**
 * List transactions
 */
export async function listTransactions(params: {
  checkAccountId?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<CheckAccountTransaction[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: params.limit ?? 100,
    offset: params.offset,
  };

  if (params.checkAccountId) {
    queryParams["checkAccount[id]"] = params.checkAccountId;
    queryParams["checkAccount[objectName]"] = "CheckAccount";
  }
  if (params.startDate) queryParams["startDate"] = params.startDate;
  if (params.endDate) queryParams["endDate"] = params.endDate;
  if (params.status) queryParams["status"] = params.status;

  const queryString = buildQueryString(queryParams);

  const response = await sevdeskFetch<SevdeskApiResponse<CheckAccountTransaction>>(
    `/CheckAccountTransaction${queryString}`
  );
  return response.objects;
}

/**
 * Get a single transaction
 */
export async function getTransaction(params: { id: string }): Promise<CheckAccountTransaction> {
  const response = await sevdeskFetch<SevdeskSingleResponse<CheckAccountTransaction>>(
    `/CheckAccountTransaction/${params.id}`
  );
  return extractSingleObject(response);
}

/**
 * Create a transaction
 */
export async function createTransaction(params: {
  checkAccountId: string;
  amount: number;
  valueDate: string;
  payeePayerName?: string;
  paymtPurpose?: string;
  entryDate?: string;
}): Promise<CheckAccountTransaction> {
  const body: Record<string, unknown> = {
    checkAccount: { id: params.checkAccountId, objectName: "CheckAccount" },
    amount: params.amount,
    valueDate: params.valueDate,
    status: "100", // Booked
  };

  if (params.payeePayerName !== undefined) body.payeePayerName = params.payeePayerName;
  if (params.paymtPurpose !== undefined) body.paymtPurpose = params.paymtPurpose;
  if (params.entryDate !== undefined) body.entryDate = params.entryDate;

  const response = await sevdeskPost<SevdeskSingleResponse<CheckAccountTransaction>>("/CheckAccountTransaction", body);
  return extractSingleObject(response);
}

/**
 * Update a transaction
 */
export async function updateTransaction(params: {
  id: string;
  payeePayerName?: string;
  paymtPurpose?: string;
  status?: string;
}): Promise<CheckAccountTransaction> {
  const body: Record<string, unknown> = {};

  if (params.payeePayerName !== undefined) body.payeePayerName = params.payeePayerName;
  if (params.paymtPurpose !== undefined) body.paymtPurpose = params.paymtPurpose;
  if (params.status !== undefined) body.status = params.status;

  const response = await sevdeskPut<SevdeskSingleResponse<CheckAccountTransaction>>(
    `/CheckAccountTransaction/${params.id}`,
    body
  );
  return extractSingleObject(response);
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(params: { id: string }): Promise<void> {
  await sevdeskDelete(`/CheckAccountTransaction/${params.id}`);
}

/**
 * Format transaction for display
 */
export function formatTransaction(tx: CheckAccountTransaction): string {
  const lines: string[] = [
    `ID: ${tx.id}`,
    `Amount: ${tx.amount}`,
    `Value Date: ${tx.valueDate}`,
    `Status: ${tx.status}`,
  ];

  if (tx.payeePayerName) lines.push(`Payee/Payer: ${tx.payeePayerName}`);
  if (tx.paymtPurpose) lines.push(`Purpose: ${tx.paymtPurpose}`);
  if (tx.entryDate) lines.push(`Entry Date: ${tx.entryDate}`);
  lines.push(`Created: ${tx.create}`);
  lines.push(`Updated: ${tx.update}`);

  return lines.join("\n");
}

/**
 * Format transactions list for display
 */
export function formatTransactionsList(transactions: CheckAccountTransaction[]): string {
  if (transactions.length === 0) {
    return "No transactions found.";
  }

  const lines: string[] = [`Found ${transactions.length} transaction(s):\n`];

  for (const tx of transactions) {
    const name = tx.payeePayerName || "Unknown";
    lines.push(`- [${tx.id}] ${tx.valueDate} | ${tx.amount} | ${name}`);
  }

  return lines.join("\n");
}

/**
 * Format transaction result
 */
export function formatTransactionResult(tx: CheckAccountTransaction, action: string): string {
  return `Transaction ${action} successfully:\n${formatTransaction(tx)}`;
}

/**
 * Format transaction delete result
 */
export function formatTransactionDeleteResult(id: string): string {
  return `Transaction ${id} deleted successfully.`;
}
