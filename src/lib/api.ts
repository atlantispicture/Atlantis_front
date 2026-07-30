/**
 * 백엔드 API 클라이언트.
 *
 * 토큰은 localStorage 에 둔다 (Phase 0). 서버가 없거나 로그인 전이면
 * 호출부가 조용히 로컬 모드로 남을 수 있도록, 실패를 예외 대신 결과로 돌려준다.
 */

// 8080·8081 은 이 PC 의 다른 서비스가 점유 중이라 백엔드는 8082 에 뜬다.
const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8082'
const TOKEN_KEY = 'atlantis.token'
const HANDLE_KEY = 'atlantis.handle'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const getHandle = () => localStorage.getItem(HANDLE_KEY)
export const isLoggedIn = () => !!getToken()

export function setSession(token: string | null, handle?: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    if (handle) localStorage.setItem(HANDLE_KEY, handle)
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(HANDLE_KEY)
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // FormData 일 때 Content-Type 을 직접 넣으면 boundary 가 빠져 서버가 못 읽는다
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다')
  }

  if (res.status === 401) {
    setSession(null) // 만료된 토큰은 버린다
    throw new ApiError(401, '로그인이 필요합니다')
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new ApiError(res.status, msg || `요청 실패 (${res.status})`)
  }

  if (res.status === 204) return undefined as T
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.text()) as T
}

// ── 인증 ─────────────────────────────────────────────
export interface TokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  userId: string
  handle: string
}

export async function devLogin(handle: string, displayName?: string) {
  const res = await request<TokenResponse>('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ handle, displayName }),
  })
  setSession(res.accessToken, res.handle)
  return res
}

export const me = () =>
  request<{ userId: string; handle: string; displayName: string; avatarUrl: string | null }>(
    '/api/auth/me',
  )

// ── 프로필 · 친구 ────────────────────────────────────
export interface UserSummary {
  userId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  following: boolean
  mutual: boolean
}

export const getProfile = () => request<UserSummary>('/api/me')

export const updateProfile = (body: { displayName?: string; avatarUrl?: string | null }) =>
  request<UserSummary>('/api/me', { method: 'PATCH', body: JSON.stringify(body) })

export const searchUsers = (q: string) =>
  request<UserSummary[]>(`/api/users/search?q=${encodeURIComponent(q)}`)

/** 서로 팔로우한 사람 — 함께 간 사람으로 태그할 후보 */
export const listFriends = () => request<UserSummary[]>('/api/me/friends')

export const listFollowing = () => request<UserSummary[]>('/api/me/following')

export const followUser = (handle: string) =>
  request<UserSummary>('/api/follows', { method: 'POST', body: JSON.stringify({ handle }) })

export const unfollowUser = (handle: string) =>
  request<void>(`/api/follows/${encodeURIComponent(handle)}`, { method: 'DELETE' })

// ── 나라 방문 ────────────────────────────────────────
export interface VisitDto {
  id: string
  countryCode: string
  visited: boolean
  visitedYm: string | null
  companions: string | null
  note: string | null
  color: string | null
  scope: string
}

export const listVisits = () => request<VisitDto[]>('/api/visits')

export const toggleVisit = (countryCode: string) =>
  request<VisitDto>(`/api/visits/${countryCode}/toggle`, { method: 'POST' })

// ── 지역 방문 ────────────────────────────────────────
export interface RegionVisitDto {
  id: string
  regionCode: string
  regionName: string
  countryCode: string
  kind: 'REGION' | 'CITY'
  visited: boolean
  visitedYm: string | null
  note: string | null
  scope: string
}

export const listRegionVisits = () => request<RegionVisitDto[]>('/api/region-visits')

export const toggleRegionVisit = (
  regionCode: string,
  body: { countryCode: string; regionName: string; kind: 'REGION' | 'CITY' },
) =>
  request<RegionVisitDto>(`/api/region-visits/${encodeURIComponent(regionCode)}/toggle`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ── 자주 가는 나라 (온보딩) ──────────────────────────
export const listFrequentCountries = () => request<string[]>('/api/me/frequent-countries')

export const saveFrequentCountries = (codes: string[]) =>
  request<string[]>('/api/me/frequent-countries', {
    method: 'PUT',
    body: JSON.stringify({ codes }),
  })

// ── 추억 ─────────────────────────────────────────────
export interface MemoryDto {
  id: string
  countryCode: string
  regionCode: string | null
  regionKind: 'REGION' | 'CITY' | null
  takenAt: string | null
  capturedSource: 'EXIF' | 'FILE'
  season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | null
  caption: string | null
  city: string | null
  scope: string
  media: {
    id: string
    mediaType: 'PHOTO' | 'VIDEO'
    mime: string | null
    url: string
    thumbUrl: string | null
  }[]
}

export const listMemories = (params: { country?: string; region?: string }) => {
  const q = new URLSearchParams()
  if (params.region) q.set('region', params.region)
  else if (params.country) q.set('country', params.country)
  return request<MemoryDto[]>(`/api/memories?${q}`)
}

export function createMemory(
  meta: {
    countryCode: string
    regionCode?: string | null
    regionKind?: 'REGION' | 'CITY' | null
    takenAt?: string
    capturedSource?: 'EXIF' | 'FILE'
  },
  files: File[],
  thumbs: (Blob | null)[] = [],
) {
  const form = new FormData()
  // meta 는 JSON 파트 — Blob 으로 감싸야 Content-Type 이 붙어 @RequestPart 가 받는다
  form.append('meta', new Blob([JSON.stringify(meta)], { type: 'application/json' }))
  files.forEach((f) => form.append('files', f))
  thumbs.forEach((t, i) => t && form.append('thumbs', t, `thumb-${i}.jpg`))
  return request<MemoryDto>('/api/memories', { method: 'POST', body: form })
}

export const deleteMemory = (id: string) =>
  request<void>(`/api/memories/${id}`, { method: 'DELETE' })

/**
 * 서버가 살아있는지 (연동 배지 표시용).
 * actuator 를 넣지 않았으므로 상태 코드는 보지 않는다 — 401/403 이어도
 * '응답이 왔다'는 건 서버가 떠 있다는 뜻이다. 못 붙으면 fetch 가 던진다.
 */
export async function ping(): Promise<boolean> {
  try {
    await fetch(`${BASE}/api/auth/me`, { method: 'GET' })
    return true
  } catch {
    return false
  }
}
