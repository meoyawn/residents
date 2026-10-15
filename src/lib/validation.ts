import { z } from 'zod'

export function normalizePhone(value: string) {
  let digits = value.replace(/[\s()\-]/g, '')
  if (/^8\d{10}$/.test(digits)) digits = `+7${digits.slice(1)}`
  if (/^7\d{10}$/.test(digits)) digits = `+${digits}`
  return digits
}

export const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Введите номер в международном формате, например +1 202 555-0100'))
export const idSchema = z.string().min(1).max(100)
export const loginSchema = z.object({ phone: phoneSchema })
export const verifyOtpSchema = z.object({ challengeId: idSchema, code: z.string().regex(/^\d{6}$/) })
export const joinSchema = z.object({ buildingId: idSchema, apartment: z.string().trim().max(20).nullable().optional(), entrance: z.string().trim().max(20).nullable().optional(), name: z.string().trim().min(2).max(80) })
export const problemSchema = z.object({ buildingId: idSchema, title: z.string().trim().min(5).max(180), description: z.string().trim().min(10).max(5000), category: z.enum(['yard','access','maintenance','safety','other']) })
export const optionSchema = z.object({ buildingId: idSchema, problemId: idSchema, version: z.number().int().positive(), optionId: idSchema.optional(), title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000), priceKopecks: z.number().int().min(0).max(1_000_000_000), costNote: z.string().trim().min(1).max(300) })
export const voteSchema = z.object({ buildingId: idSchema, problemId: idSchema, optionId: idSchema, version: z.number().int().positive() })
export const commentSchema = z.object({ buildingId: idSchema, problemId: idSchema, body: z.string().trim().min(1).max(3000) })
export const statusSchema = z.object({ buildingId: idSchema, problemId: idSchema, version: z.number().int().positive(), status: z.enum(['discussion','open','closed','resolved']), deadline: z.string().datetime().optional(), outcome: z.string().trim().max(2000).optional() })
export const verifyResidentSchema = z.object({ buildingId: idSchema, userId: idSchema, status: z.enum(['verified','rejected']), apartment: z.string().trim().max(20).nullable(), entrance: z.string().trim().max(20).nullable() })
export const importResidentSchema = z.object({ phone: phoneSchema, name: z.string().trim().max(80).optional(), apartment: z.string().trim().max(20).nullable().optional(), entrance: z.string().trim().max(20).nullable().optional() })
export const bulkImportSchema = z.object({ buildingId: idSchema, residents: z.array(importResidentSchema).min(1).max(300) })
export const collectionSchema = z.object({ name: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80) })
export const buildingSchema = z.object({ collectionId: idSchema, name: z.string().trim().min(2).max(120), address: z.string().trim().min(3).max(200), apartmentsCount: z.number().int().min(1).max(10000) })
export const grantSchema = z.object({ phone: phoneSchema, scope: z.enum(['building','collection','webmaster']), scopeId: idSchema.optional(), revoke: z.boolean().default(false) })

export interface ImportRow {
  phone: string
  name?: string
  apartment?: string | null
  entrance?: string | null
}

/** Accepts an exported spreadsheet or a simple list of WhatsApp numbers. */
export function parseResidentImport(text: string): { rows: ImportRow[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/).filter((line) => line.trim())
  const rows: ImportRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const parts = splitImportLine(line)
    if (!parts) { errors.push(`Строка ${index + 1}: незакрытые кавычки`); continue }
    if (index === 0 && /^(phone|телефон|номер|телефон номеры)$/i.test(parts[0])) continue
    if (parts.length > 4) { errors.push(`Строка ${index + 1}: ожидаются четыре столбца: телефон, квартира, подъезд, имя`); continue }
    const result = importResidentSchema.safeParse({ phone: parts[0], apartment: parts[1] || null, entrance: parts[2] || null, name: parts[3] || undefined })
    if (!result.success) errors.push(`Строка ${index + 1}: некорректный номер или слишком длинное поле`)
    else if (!seen.has(result.data.phone)) {
      seen.add(result.data.phone)
      rows.push(result.data)
    }
  }
  if (rows.length > 300) errors.push('За один раз можно импортировать до 300 жителей')
  return { rows, errors }
}

function splitImportLine(line: string) {
  const parts: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (!quoted && [';', ',', '\t'].includes(char)) { parts.push(field.trim()); field = '' }
    else field += char
  }
  if (quoted) return null
  parts.push(field.trim())
  return parts
}
