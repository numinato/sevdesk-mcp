import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import * as accounts from '../tools/accounts.js'
import * as addresses from '../tools/addresses.js'
import * as communication from '../tools/communication.js'
import * as contacts from '../tools/contacts.js'
import * as creditnotes from '../tools/creditnotes.js'
import * as invoices from '../tools/invoices.js'
import * as orders from '../tools/orders.js'
import * as parts from '../tools/parts.js'
import * as tags from '../tools/tags.js'
import * as vouchers from '../tools/vouchers.js'
import { idSegment } from '../validation.js'

/**
 * Security regression test for finding F1 (audit 2026-06-19).
 *
 * Every URL-path parameter in this server is an `id` interpolated raw into the
 * request path. A crafted id like "5/enshrine" could redirect a call to a
 * different — sometimes irreversible — sevDesk endpoint within the authenticated
 * account. IDs are constrained to digits at the Zod boundary (idSchema) and again
 * at the path-construction boundary (idSegment). This test pins BOTH, and walks
 * EVERY exported schema that has an `id` field so new tools are covered for free.
 */
const modules = {
  accounts,
  addresses,
  communication,
  contacts,
  creditnotes,
  invoices,
  orders,
  parts,
  tags,
  vouchers,
}

// Discover (label, idFieldSchema) for every exported *Schema raw shape with an `id`.
const idFields: Array<[string, z.ZodTypeAny]> = []
for (const [modName, mod] of Object.entries(modules)) {
  for (const [exportName, value] of Object.entries(mod as Record<string, unknown>)) {
    if (
      exportName.endsWith('Schema') &&
      value &&
      typeof value === 'object' &&
      'id' in (value as object)
    ) {
      idFields.push([`${modName}.${exportName}`, (value as Record<string, z.ZodTypeAny>).id])
    }
  }
}

const maliciousIds = [
  '5/enshrine', // redirect a delete/update to the irreversible enshrine endpoint
  '1/getPdf',
  '../Invoice/9',
  '5%2Fenshrine', // pre-encoded slash
  'abc',
  '',
  '5 OR 1=1',
  '12 ', // trailing space — anchored regex must reject
  ' 12',
]

describe('F1: every exported id schema rejects URL path manipulation', () => {
  it('discovers id fields across all tool modules', () => {
    expect(idFields.length).toBeGreaterThanOrEqual(50)
  })

  for (const [label, schema] of idFields) {
    it(`${label}.id accepts a plain numeric id`, () => {
      expect(schema.safeParse('12345').success).toBe(true)
    })
    for (const bad of maliciousIds) {
      it(`${label}.id rejects ${JSON.stringify(bad)}`, () => {
        expect(schema.safeParse(bad).success).toBe(false)
      })
    }
  }
})

describe('F1: idSegment runtime guard (defense in depth for direct calls)', () => {
  it('returns a numeric id unchanged', () => {
    expect(idSegment('12345')).toBe('12345')
  })
  for (const bad of ['5/enshrine', '../Invoice/9', 'abc', '']) {
    it(`throws on ${JSON.stringify(bad)}`, () => {
      expect(() => idSegment(bad)).toThrow()
    })
  }
})
