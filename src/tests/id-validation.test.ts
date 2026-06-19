import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { idSegment } from '../validation.js'

/**
 * Security regression test for finding F1 (audit 2026-06-19).
 *
 * Every URL-path parameter in this server is an `id` interpolated raw into the
 * request path. A crafted id like "5/enshrine" could redirect a call to a
 * different — sometimes irreversible — sevDesk endpoint within the authenticated
 * account. IDs are constrained to digits at the Zod boundary (idSchema) and again
 * at the path-construction boundary (idSegment). This test pins BOTH.
 *
 * Tool modules are discovered via a recursive `import.meta.glob`, so any newly added
 * file anywhere under src/tools/ (including subdirectories) is covered automatically.
 */
const toolModules = import.meta.glob('../tools/**/*.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>

// Discover (label, idFieldSchema) for every exported *Schema raw shape with an `id`.
const idFields: Array<[string, z.ZodTypeAny]> = []
for (const [path, mod] of Object.entries(toolModules)) {
  const modName = path.replace(/^.*\//, '').replace(/\.ts$/, '')
  for (const [exportName, value] of Object.entries(mod)) {
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
    // Tightened from 50: the real count is 64, so a guard of 50 would silently
    // tolerate ~14 schemas dropping out before failing. 60 leaves only minor slack.
    expect(idFields.length).toBeGreaterThanOrEqual(60)
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
  it('does not reflect raw quotes/newlines from a bad id into the error message', () => {
    const evil = '"><script>\n' + 'x'.repeat(200)
    expect(() => idSegment(evil)).toThrow()
    try {
      idSegment(evil)
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).not.toContain('\n') // newline escaped by JSON.stringify
      expect(msg).not.toContain('x'.repeat(100)) // long payload truncated, not reflected whole
    }
  })
  it('throws a controlled error on non-string input (runtime guard for JS callers)', () => {
    for (const bad of [undefined, null, 123, Symbol('x'), {}]) {
      // @ts-expect-error — exercising the runtime guard against non-string callers
      expect(() => idSegment(bad)).toThrow()
    }
  })
})
