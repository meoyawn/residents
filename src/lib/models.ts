export interface User {
  id: string
  name: string
  phone: string
  is_webmaster: number
}
export interface Building {
  id: string
  collection_id: string
  name: string
  address: string
  apartments_count: number
  collection_name: string
  city: string
  role: 'resident' | 'admin' | null
  membership_status: 'pending' | 'verified' | 'rejected' | null
  apartment: string | null
  entrance: string | null
  can_admin: boolean
  can_participate: boolean
}
export interface Problem {
  id: string
  building_id: string
  title: string
  description: string
  category: 'yard' | 'access' | 'maintenance' | 'safety' | 'other'
  status: 'discussion' | 'open' | 'closed' | 'resolved'
  version: number
  deadline: string | null
  outcome: string | null
  created_at: string
  updated_at: string
  author_name: string
  votes_count: number
  comments_count: number
  min_price: number | null
  max_price: number | null
  my_option_id: string | null
}
export interface Option {
  id: string
  problem_id: string
  title: string
  description: string
  price_kopecks: number
  cost_note: string
  votes_count: number
}
export interface Comment {
  id: string
  body: string
  created_at: string
  name: string
  apartment: string | null
  entrance: string | null
}
export interface Resident {
  id: string
  name: string
  phone: string
  status: 'pending' | 'verified' | 'rejected'
  role: 'resident' | 'admin'
  apartment: string | null
  entrance: string | null
  verified_at: string | null
}
export interface AuditEvent {
  id: string
  action: string
  detail: string
  actor_name: string
  created_at: string
}
export interface Bootstrap {
  user: User | null
  csrf: string | null
  buildings: Building[]
  development: boolean
}
export interface Dashboard {
  problems: Problem[]
  residents_count: number
  pending_count: number
  events: AuditEvent[]
}
export interface Detail {
  problem: Problem
  options: Option[]
  comments: Comment[]
  eligible_count: number
}
