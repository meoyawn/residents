import type { AuditEvent, Bootstrap, Building, Comment, Dashboard, Detail, Option, Problem, Resident, User } from '../lib/models.ts'
import { buildingSchema, bulkImportSchema, collectionSchema, commentSchema, grantSchema, joinSchema, optionSchema, problemSchema, statusSchema, verifyResidentSchema, voteSchema } from '../lib/validation.ts'
import { fail } from './http.ts'
import { getPrincipal } from './auth.ts'
import { z } from 'zod'

const problemSelect = `SELECT p.*,u.name AS author_name,
  (SELECT COUNT(*) FROM votes v JOIN memberships m ON m.building_id IS v.building_id AND m.user_id IS v.user_id WHERE v.problem_id IS p.id AND v.version IS p.version AND m.status IS 'verified') AS votes_count,
  (SELECT COUNT(*) FROM comments c WHERE c.problem_id IS p.id) AS comments_count,
  (SELECT MIN(o.price_kopecks) FROM options o WHERE o.problem_id IS p.id) AS min_price,
  (SELECT MAX(o.price_kopecks) FROM options o WHERE o.problem_id IS p.id) AS max_price,
  (SELECT v.option_id FROM votes v WHERE v.problem_id IS p.id AND v.user_id IS ? AND v.version IS p.version) AS my_option_id
  FROM problems p JOIN users u ON u.id IS p.created_by`

export async function getBuildings(bindings: Env, user: User | null): Promise<Building[]> {
  const result = await bindings.DB.prepare(`SELECT b.*,c.name AS collection_name,c.city,m.role,m.status AS membership_status,m.apartment,m.entrance,
    EXISTS(SELECT 1 FROM collection_admins ca WHERE ca.collection_id IS b.collection_id AND ca.user_id IS ?) AS collection_admin
    FROM buildings b JOIN collections c ON c.id IS b.collection_id
    LEFT JOIN memberships m ON m.building_id IS b.id AND m.user_id IS ? ORDER BY c.created_at,b.created_at,b.address`).bind(user?.id || '', user?.id || '').all<Building & { collection_admin: number }>()
  return result.results.map((row) => ({ id: row.id, collection_id: row.collection_id, name: row.name, address: row.address, apartments_count: row.apartments_count, collection_name: row.collection_name, city: row.city, role: row.role, membership_status: row.membership_status, apartment: row.apartment, entrance: row.entrance, can_admin: !!user && (!!user.is_webmaster || !!row.collection_admin || (row.role === 'admin' && row.membership_status === 'verified')), can_participate: row.membership_status === 'verified' }))
}

export async function bootstrap(request: Request, bindings: Env, development: boolean): Promise<Bootstrap> {
  const principal = await getPrincipal(request, bindings)
  return { user: principal?.user || null, csrf: principal?.csrf || null, buildings: await getBuildings(bindings, principal?.user || null), development }
}

export async function access(bindings: Env, user: User | null, buildingId: string, mode: 'read' | 'participate' | 'admin', demo = false) {
  const row = await bindings.DB.prepare(`SELECT b.*,c.name AS collection_name,c.city,m.role,m.status AS membership_status,m.apartment,m.entrance,
    EXISTS(SELECT 1 FROM collection_admins ca WHERE ca.collection_id IS b.collection_id AND ca.user_id IS ?) AS collection_admin
    FROM buildings b JOIN collections c ON c.id IS b.collection_id
    LEFT JOIN memberships m ON m.building_id IS b.id AND m.user_id IS ? WHERE b.id IS ?`).bind(user?.id || '',user?.id || '',buildingId).first<Building & { collection_admin: number }>()
  if (!row) fail(404, 'Дом не найден')
  const building: Building = { ...row, can_admin: !!user && (!!user.is_webmaster || !!row.collection_admin || (row.role === 'admin' && row.membership_status === 'verified')), can_participate: row.membership_status === 'verified' }
  if (mode === 'read' && demo) return building
  if (!user) fail(401, 'Войдите через WhatsApp')
  if (mode === 'admin' && !building.can_admin) fail(403, 'Требуется администратор этого дома')
  if (mode === 'participate' && !building.can_participate) fail(403, 'Администратор должен подтвердить, что вы житель этого дома')
  if (mode === 'read' && !building.can_admin && !building.can_participate) fail(403, 'Доступ появится после подтверждения проживания')
  return building
}

export async function dashboard(bindings: Env, user: User | null, buildingId: string, demo = false): Promise<Dashboard> {
  const building = await access(bindings, user, buildingId, 'read', demo)
  const results = await bindings.DB.batch<Problem | AuditEvent | { total: number }>([
    bindings.DB.prepare(`${problemSelect} WHERE p.building_id IS ? ORDER BY p.created_at DESC LIMIT 150`).bind(user?.id || '', buildingId),
    bindings.DB.prepare("SELECT COUNT(*) AS total FROM memberships WHERE building_id IS ? AND status IS 'verified'").bind(buildingId),
    bindings.DB.prepare("SELECT COUNT(*) AS total FROM memberships WHERE building_id IS ? AND status IS 'pending'").bind(buildingId),
    bindings.DB.prepare("SELECT a.id,a.action,a.detail,a.created_at,u.name AS actor_name FROM audit_events a JOIN users u ON u.id IS a.actor_id WHERE a.building_id IS ? AND a.action IN ('problem_created','options_revised','status_changed','residents_imported','resident_verified') ORDER BY a.created_at DESC LIMIT 12").bind(buildingId),
  ])
  return { problems: results[0].results as Problem[], residents_count: Number((results[1].results[0] as { total: number })?.total || 0), pending_count: building.can_admin ? Number((results[2].results[0] as { total: number })?.total || 0) : 0, events: results[3].results as AuditEvent[] }
}

export async function detail(bindings: Env, user: User | null, buildingId: string, problemId: string, demo = false): Promise<Detail> {
  await access(bindings, user, buildingId, 'read', demo)
  const problem = await bindings.DB.prepare(`${problemSelect} WHERE p.building_id IS ? AND p.id IS ?`).bind(user?.id || '', buildingId, problemId).first<Problem>()
  if (!problem) fail(404, 'Вопрос не найден')
  const options = await bindings.DB.prepare(`SELECT o.id,o.problem_id,o.title,o.description,o.price_kopecks,o.cost_note,
    (SELECT COUNT(*) FROM votes v JOIN memberships m ON m.building_id IS v.building_id AND m.user_id IS v.user_id WHERE v.option_id IS o.id AND v.version IS ? AND m.status IS 'verified') AS votes_count
    FROM options o WHERE o.problem_id IS ? AND o.building_id IS ? ORDER BY o.price_kopecks`).bind(problem.version, problemId, buildingId).all<Option>()
  const comments = await bindings.DB.prepare(`SELECT c.id,c.body,c.created_at,u.name,m.apartment,m.entrance FROM comments c JOIN users u ON u.id IS c.user_id LEFT JOIN memberships m ON m.user_id IS c.user_id AND m.building_id IS c.building_id WHERE c.problem_id IS ? AND c.building_id IS ? ORDER BY c.created_at DESC LIMIT 100`).bind(problemId, buildingId).all<Comment>()
  const eligible = await bindings.DB.prepare("SELECT COUNT(*) AS total FROM memberships WHERE building_id IS ? AND status IS 'verified'").bind(buildingId).first<{ total: number }>()
  return { problem, options: options.results, comments: comments.results, eligible_count: eligible?.total || 0 }
}

export async function residents(bindings: Env, user: User, buildingId: string) {
  await access(bindings, user, buildingId, 'admin')
  const result = await bindings.DB.prepare(`SELECT u.id,u.name,u.phone,m.status,m.role,m.apartment,m.entrance,m.verified_at FROM memberships m JOIN users u ON u.id IS m.user_id WHERE m.building_id IS ? ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END,u.name LIMIT 1000`).bind(buildingId).all<Resident>()
  return result.results
}

export function audit(bindings: Env, user: User, buildingId: string | null, action: string, entityId: string | null, text: string) {
  return bindings.DB.prepare('INSERT INTO audit_events(id,building_id,actor_id,action,entity_id,detail) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), buildingId, user.id, action, entityId, text)
}

async function ownedProblem(bindings: Env, buildingId: string, problemId: string) {
  const row = await bindings.DB.prepare('SELECT * FROM problems WHERE id IS ? AND building_id IS ?').bind(problemId, buildingId).first<Problem>()
  if (!row) fail(404, 'Вопрос не найден')
  return row
}

export async function joinBuilding(bindings: Env, user: User, input: z.infer<typeof joinSchema>) {
  const building = await bindings.DB.prepare('SELECT id FROM buildings WHERE id IS ?').bind(input.buildingId).first()
  if (!building) fail(404, 'Дом не найден')
  await bindings.DB.batch([
    bindings.DB.prepare('UPDATE users SET name = ? WHERE id IS ?').bind(input.name, user.id),
    bindings.DB.prepare(`INSERT INTO memberships(building_id,user_id,apartment,entrance) VALUES(?,?,?,?) ON CONFLICT(building_id,user_id) DO UPDATE SET apartment = CASE WHEN status IS 'verified' THEN apartment ELSE excluded.apartment END, entrance = CASE WHEN status IS 'verified' THEN entrance ELSE excluded.entrance END, status = CASE WHEN status IS 'verified' THEN status ELSE 'pending' END`).bind(input.buildingId, user.id, input.apartment || null, input.entrance || null),
  ])
  return { ok: true }
}

export async function addProblem(bindings: Env, user: User, input: z.infer<typeof problemSchema>) {
  const building = await access(bindings, user, input.buildingId, 'read')
  if (!building.can_participate && !building.can_admin) fail(403, 'Подтвердите проживание')
  const id = crypto.randomUUID()
  await bindings.DB.batch([
    bindings.DB.prepare('INSERT INTO problems(id,building_id,title,description,category,created_by) VALUES(?,?,?,?,?,?)').bind(id, input.buildingId, input.title, input.description, input.category, user.id),
    audit(bindings, user, input.buildingId, 'problem_created', id, `Новый вопрос: ${input.title}`),
  ])
  return { id }
}

export async function reviseOption(bindings: Env, user: User, input: z.infer<typeof optionSchema>) {
  await access(bindings, user, input.buildingId, 'admin')
  const problem = await ownedProblem(bindings, input.buildingId, input.problemId)
  if (problem.status === 'closed' || problem.status === 'resolved') fail(409, 'Сначала верните вопрос на обсуждение')
  if (problem.version !== input.version) fail(409, 'Вопрос изменился. Обновите страницу')
  const id = input.optionId || crypto.randomUUID()
  if (input.optionId && !await bindings.DB.prepare('SELECT id FROM options WHERE id IS ? AND problem_id IS ? AND building_id IS ?').bind(id, input.problemId, input.buildingId).first()) fail(404, 'Вариант не найден')
  const option = input.optionId
    ? bindings.DB.prepare('UPDATE options SET title = ?,description = ?,price_kopecks = ?,cost_note = ? WHERE id IS ? AND problem_id IS ? AND building_id IS ?').bind(input.title, input.description, input.priceKopecks, input.costNote, id, input.problemId, input.buildingId)
    : bindings.DB.prepare('INSERT INTO options(id,problem_id,building_id,title,description,price_kopecks,cost_note,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id, input.problemId, input.buildingId, input.title, input.description, input.priceKopecks, input.costNote, user.id)
  await bindings.DB.batch([
    bindings.DB.prepare("UPDATE problems SET version = ?,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IS ? AND building_id IS ?").bind(input.version + 1, input.problemId, input.buildingId),
    option,
    bindings.DB.prepare('DELETE FROM votes WHERE problem_id IS ? AND building_id IS ?').bind(input.problemId, input.buildingId),
    audit(bindings, user, input.buildingId, 'options_revised', input.problemId, `Обновлены варианты или смета: «${problem.title}». Редакция ${input.version + 1}. Требуется повторное голосование.`),
  ])
  return { id, version: input.version + 1 }
}

export async function castVote(bindings: Env, user: User, input: z.infer<typeof voteSchema>) {
  await access(bindings, user, input.buildingId, 'participate')
  const problem = await ownedProblem(bindings, input.buildingId, input.problemId)
  if (problem.status !== 'open' || !problem.deadline || Date.parse(problem.deadline) <= Date.now()) fail(409, 'Голосование завершено')
  if (problem.version !== input.version) fail(409, 'Смета изменилась. Обновите варианты перед голосованием')
  if (!await bindings.DB.prepare('SELECT id FROM options WHERE id IS ? AND problem_id IS ? AND building_id IS ?').bind(input.optionId, input.problemId, input.buildingId).first()) fail(400, 'Вариант не относится к этому вопросу')
  await bindings.DB.prepare(`INSERT INTO votes(problem_id,building_id,user_id,option_id,version) VALUES(?,?,?,?,?) ON CONFLICT(problem_id,user_id) DO UPDATE SET option_id = excluded.option_id,version = excluded.version,created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(input.problemId, input.buildingId, user.id, input.optionId, input.version).run()
  return { ok: true }
}

export async function addComment(bindings: Env, user: User, input: z.infer<typeof commentSchema>) {
  await access(bindings, user, input.buildingId, 'read')
  const problem = await ownedProblem(bindings, input.buildingId, input.problemId)
  if (problem.status === 'resolved') fail(409, 'Обсуждение закрыто: вопрос решён')
  const id = crypto.randomUUID()
  await bindings.DB.prepare('INSERT INTO comments(id,problem_id,building_id,user_id,body) VALUES(?,?,?,?,?)').bind(id, input.problemId, input.buildingId, user.id, input.body).run()
  return { id }
}

export async function changeStatus(bindings: Env, user: User, input: z.infer<typeof statusSchema>) {
  await access(bindings, user, input.buildingId, 'admin')
  const problem = await ownedProblem(bindings, input.buildingId, input.problemId)
  if (problem.version !== input.version) fail(409, 'Вопрос изменился. Обновите страницу')
  let deadline = problem.deadline
  if (input.status === 'open') {
    const count = await bindings.DB.prepare('SELECT COUNT(*) AS total FROM options WHERE problem_id IS ? AND building_id IS ?').bind(input.problemId, input.buildingId).first<{ total: number }>()
    if (!count || count.total < 2) fail(400, 'Для голосования нужны как минимум два варианта')
    if (!input.deadline || Date.parse(input.deadline) <= Date.now()) fail(400, 'Укажите будущую дату окончания')
    deadline = input.deadline
  }
  if ((input.status === 'closed' || input.status === 'resolved') && !input.outcome?.trim()) fail(400, 'Опишите результат, чтобы жители видели итог')
  const labels = { discussion: 'На обсуждении', open: 'На голосовании', closed: 'Подведены итоги', resolved: 'Решено' }
  await bindings.DB.batch([
    bindings.DB.prepare("UPDATE problems SET status = ?,version = ?,deadline = ?,outcome = ?,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IS ? AND building_id IS ?").bind(input.status, input.version + 1, deadline, input.outcome || null, input.problemId, input.buildingId),
    input.status === 'closed' || input.status === 'resolved'
      ? bindings.DB.prepare('UPDATE votes SET version = ? WHERE problem_id IS ? AND building_id IS ?').bind(input.version + 1, input.problemId, input.buildingId)
      : bindings.DB.prepare('DELETE FROM votes WHERE problem_id IS ? AND building_id IS ?').bind(input.problemId, input.buildingId),
    audit(bindings, user, input.buildingId, 'status_changed', input.problemId, `${labels[input.status]}: ${problem.title}. ${input.outcome || 'Начинаем новый раунд голосования.'}`),
  ])
  return { ok: true }
}

export async function verifyResident(bindings: Env, user: User, input: z.infer<typeof verifyResidentSchema>) {
  await access(bindings, user, input.buildingId, 'admin')
  const member = await bindings.DB.prepare('SELECT role FROM memberships WHERE building_id IS ? AND user_id IS ?').bind(input.buildingId, input.userId).first<{ role: string }>()
  if (!member) fail(404, 'Житель не найден')
  if (member.role === 'admin' && input.status === 'rejected') fail(400, 'Сначала webmaster должен снять назначение администратора')
  const statements = [bindings.DB.prepare('UPDATE memberships SET status = ?,apartment = ?,entrance = ?,verified_by = ?,verified_at = ? WHERE building_id IS ? AND user_id IS ?').bind(input.status, input.apartment || null, input.entrance || null, user.id, new Date().toISOString(), input.buildingId, input.userId)]
  if (input.status === 'rejected') statements.push(bindings.DB.prepare('DELETE FROM votes WHERE building_id IS ? AND user_id IS ?').bind(input.buildingId, input.userId))
  statements.push(audit(bindings, user, input.buildingId, 'resident_verified', input.userId, input.status === 'verified' ? 'Подтверждено проживание нового участника' : 'Доступ участника отозван'))
  await bindings.DB.batch(statements)
  return { ok: true }
}

export async function importResidents(bindings: Env, user: User, input: z.infer<typeof bulkImportSchema>) {
  await access(bindings, user, input.buildingId, 'admin')
  const unique = [...new Map(input.residents.map((row) => [row.phone, row])).values()]
  const statements: D1PreparedStatement[] = []
  for (const row of unique) {
    statements.push(bindings.DB.prepare('INSERT INTO users(id,phone,name) VALUES(?,?,?) ON CONFLICT(phone) DO NOTHING').bind(crypto.randomUUID(), row.phone, row.name || 'Житель'))
    statements.push(bindings.DB.prepare(`INSERT INTO memberships(building_id,user_id,status,apartment,entrance,verified_by,verified_at) SELECT ?,id,'verified',?,?,?,? FROM users WHERE phone IS ? ON CONFLICT(building_id,user_id) DO UPDATE SET status = 'verified',apartment = COALESCE(excluded.apartment,apartment),entrance = COALESCE(excluded.entrance,entrance),verified_by = excluded.verified_by,verified_at = excluded.verified_at`).bind(input.buildingId, row.apartment || null, row.entrance || null, user.id, new Date().toISOString(), row.phone))
  }
  statements.push(audit(bindings, user, input.buildingId, 'residents_imported', null, `Импортированы и подтверждены номера: ${unique.length}. Номера квартир можно назначить позже.`))
  await bindings.DB.batch(statements)
  return { approved: unique.length, duplicates: input.residents.length - unique.length }
}

export function requireWebmaster(user: User) {
  if (!user.is_webmaster) fail(403, 'Требуется роль webmaster')
}

export async function addCollection(bindings: Env, user: User, input: z.infer<typeof collectionSchema>) {
  requireWebmaster(user)
  const id = crypto.randomUUID()
  await bindings.DB.batch([bindings.DB.prepare('INSERT INTO collections(id,name,city) VALUES(?,?,?)').bind(id, input.name, input.city), audit(bindings, user, null, 'collection_created', id, input.name)])
  return { id }
}

export async function addBuilding(bindings: Env, user: User, input: z.infer<typeof buildingSchema>) {
  requireWebmaster(user)
  if (!await bindings.DB.prepare('SELECT id FROM collections WHERE id IS ?').bind(input.collectionId).first()) fail(404, 'Группа домов не найдена')
  const id = crypto.randomUUID()
  await bindings.DB.batch([bindings.DB.prepare('INSERT INTO buildings(id,collection_id,name,address,apartments_count) VALUES(?,?,?,?,?)').bind(id, input.collectionId, input.name, input.address, input.apartmentsCount), audit(bindings, user, id, 'building_created', id, input.address)])
  return { id }
}

export async function grantRole(bindings: Env, user: User, input: z.infer<typeof grantSchema>) {
  requireWebmaster(user)
  const target = await bindings.DB.prepare('SELECT id,name,phone,is_webmaster FROM users WHERE phone IS ?').bind(input.phone).first<User>()
  if (!target) fail(404, 'Сначала импортируйте номер или попросите пользователя войти')
  if (input.scope === 'webmaster') {
    if (target.id === user.id && input.revoke) fail(400, 'Нельзя снять собственную роль webmaster')
    await bindings.DB.batch([bindings.DB.prepare('UPDATE users SET is_webmaster = ? WHERE id IS ?').bind(input.revoke ? 0 : 1, target.id), audit(bindings, user, null, 'role_changed', target.id, `${input.revoke ? 'Снята' : 'Назначена'} роль webmaster`)])
  } else if (input.scope === 'collection') {
    if (!input.scopeId || !await bindings.DB.prepare('SELECT id FROM collections WHERE id IS ?').bind(input.scopeId).first()) fail(404, 'Группа домов не найдена')
    await bindings.DB.batch([
      input.revoke ? bindings.DB.prepare('DELETE FROM collection_admins WHERE collection_id IS ? AND user_id IS ?').bind(input.scopeId, target.id) : bindings.DB.prepare('INSERT INTO collection_admins(collection_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(input.scopeId, target.id),
      audit(bindings, user, null, 'role_changed', target.id, `${input.revoke ? 'Снята' : 'Назначена'} роль администратора группы ${input.scopeId}`),
    ])
  } else {
    if (!input.scopeId || !await bindings.DB.prepare('SELECT id FROM buildings WHERE id IS ?').bind(input.scopeId).first()) fail(404, 'Дом не найден')
    await bindings.DB.batch([
      input.revoke ? bindings.DB.prepare("UPDATE memberships SET role = 'resident' WHERE building_id IS ? AND user_id IS ?").bind(input.scopeId, target.id) : bindings.DB.prepare("INSERT INTO memberships(building_id,user_id,role,status,verified_by,verified_at) VALUES(?,?,'admin','verified',?,?) ON CONFLICT(building_id,user_id) DO UPDATE SET role = 'admin',status = 'verified',verified_by = excluded.verified_by,verified_at = excluded.verified_at").bind(input.scopeId, target.id, user.id, new Date().toISOString()),
      audit(bindings, user, input.scopeId, 'role_changed', target.id, `${input.revoke ? 'Снята' : 'Назначена'} роль администратора дома`),
    ])
  }
  return { ok: true }
}

export const actionSchemas = { join: joinSchema, 'problem.add': problemSchema, 'option.save': optionSchema, vote: voteSchema, comment: commentSchema, 'problem.status': statusSchema, 'resident.verify': verifyResidentSchema, 'resident.import': bulkImportSchema, 'collection.add': collectionSchema, 'building.add': buildingSchema, 'role.grant': grantSchema }

export async function executeAction(bindings: Env, user: User, action: string, input: unknown): Promise<unknown> {
  switch (action) {
    case 'join': return joinBuilding(bindings, user, joinSchema.parse(input))
    case 'problem.add': return addProblem(bindings, user, problemSchema.parse(input))
    case 'option.save': return reviseOption(bindings, user, optionSchema.parse(input))
    case 'vote': return castVote(bindings, user, voteSchema.parse(input))
    case 'comment': return addComment(bindings, user, commentSchema.parse(input))
    case 'problem.status': return changeStatus(bindings, user, statusSchema.parse(input))
    case 'resident.verify': return verifyResident(bindings, user, verifyResidentSchema.parse(input))
    case 'resident.import': return importResidents(bindings, user, bulkImportSchema.parse(input))
    case 'collection.add': return addCollection(bindings, user, collectionSchema.parse(input))
    case 'building.add': return addBuilding(bindings, user, buildingSchema.parse(input))
    case 'role.grant': return grantRole(bindings, user, grantSchema.parse(input))
    default: fail(404, 'Действие не найдено')
  }
}
