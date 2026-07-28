import { create } from 'zustand'
import * as api from '@/lib/api'
import { useVisitStore } from './useVisitStore'

type ServerState = 'unknown' | 'offline' | 'online'

interface AuthState {
  /** 서버 연결 여부 — 꺼져 있어도 앱은 로컬 모드로 계속 쓸 수 있어야 한다 */
  server: ServerState
  handle: string | null
  loggingIn: boolean
  error: string | null

  checkServer: () => Promise<void>
  login: (handle: string) => Promise<boolean>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  server: 'unknown',
  handle: api.getHandle(),
  loggingIn: false,
  error: null,

  checkServer: async () => {
    const ok = await api.ping()
    set({ server: ok ? 'online' : 'offline' })

    // 토큰이 남아 있으면 아직 유효한지 확인한다 (만료 시 api 가 알아서 비운다)
    if (ok && api.isLoggedIn()) {
      try {
        const m = await api.me()
        set({ handle: m.handle })
        await useVisitStore.getState().pullFromServer()
      } catch {
        set({ handle: null })
      }
    }
  },

  login: async (handle) => {
    set({ loggingIn: true, error: null })
    try {
      const res = await api.devLogin(handle)
      set({ handle: res.handle, server: 'online', loggingIn: false })
      // 로그인 직후 서버 기록을 끌어와 화면을 맞춘다
      await useVisitStore.getState().pullFromServer()
      return true
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : '로그인 실패'
      set({ error: msg, loggingIn: false })
      return false
    }
  },

  logout: () => {
    api.setSession(null)
    set({ handle: null })
  },
}))
