import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  getVoucherSchema,
  deleteVoucherSchema,
  enshrineVoucherSchema,
} from '../tools/vouchers.js'
import { deleteInvoiceSchema, enshrineInvoiceSchema } from '../tools/invoices.js'

/**
 * Security regression test for finding F1 (audit 2026-06-19):
 * Every URL-path parameter in this server is `params.id`, interpolated raw into
 * the request path (e.g. `/Voucher/${id}`). Without validation, a crafted id such
 * as "5/enshrine" could redirect a delete/update call to a different — and
 * irreversible — sevDesk endpoint within the authenticated account.
 * The schemas now constrain `id` to digits only; this test pins that behaviour.
 */
const idSchemas = {
  getVoucherSchema,
  deleteVoucherSchema,
  enshrineVoucherSchema,
  deleteInvoiceSchema,
  enshrineInvoiceSchema,
}

describe('F1: numeric id validation prevents URL path manipulation', () => {
  const maliciousIds = [
    '5/enshrine', // redirect a delete to the irreversible enshrine endpoint
    '1/getPdf',
    '../Invoice/9',
    '5%2Fenshrine', // pre-encoded slash
    'abc',
    '',
    '5 OR 1=1',
  ]

  for (const [name, shape] of Object.entries(idSchemas)) {
    const obj = z.object(shape as z.ZodRawShape)

    it(`${name} accepts a plain numeric id`, () => {
      expect(obj.safeParse({ id: '12345' }).success).toBe(true)
    })

    for (const bad of maliciousIds) {
      it(`${name} rejects path-manipulating id ${JSON.stringify(bad)}`, () => {
        expect(obj.safeParse({ id: bad }).success).toBe(false)
      })
    }
  }
})
