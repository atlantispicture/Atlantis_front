import { useEffect, useState } from 'react'
import { useMemoryStore } from '@/store/useMemoryStore'
import { useSocialStore } from '@/store/useSocialStore'
import { useVisitStore } from '@/store/useVisitStore'

/**
 * 마이페이지 — 프로필 보기 + 수정.
 * 아바타는 아직 업로드 경로가 없어 URL 입력으로 받는다 (스토리지 붙으면 교체).
 */
export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const profile = useSocialStore((s) => s.profile)
  const saving = useSocialStore((s) => s.saving)
  const error = useSocialStore((s) => s.error)
  const loadProfile = useSocialStore((s) => s.loadProfile)
  const saveProfile = useSocialStore((s) => s.saveProfile)

  const visitedCount = useVisitStore((s) => s.visitedCount())
  const regionCount = useVisitStore((s) => Object.values(s.regionVisits).filter((r) => r.visited).length)
  const memoryCount = useMemoryStore((s) => s.items.length)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // 서버 값이 도착하면 입력칸을 채운다 (수정 중이면 건드리지 않는다)
  useEffect(() => {
    if (profile && !editing) {
      setName(profile.displayName)
      setAvatar(profile.avatarUrl ?? '')
    }
  }, [profile, editing])

  const submit = async () => {
    const ok = await saveProfile({
      displayName: name.trim() || undefined,
      avatarUrl: avatar.trim() ? avatar.trim() : null,
    })
    if (ok) setEditing(false)
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <button className="modal__x" onClick={onClose} aria-label="닫기">
          ✕
        </button>

        <div className="prof__avatar">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <span>{profile?.handle?.[0]?.toUpperCase() ?? '?'}</span>
          )}
        </div>

        <h2 className="prof__name">{profile?.displayName ?? '…'}</h2>
        <p className="prof__handle">@{profile?.handle ?? ''}</p>

        {/* 여행 요약 — 이 앱에서 프로필의 의미는 '얼마나 다녔나' */}
        <div className="prof__stats">
          <div>
            <b>{visitedCount}</b>
            <span>나라</span>
          </div>
          <div>
            <b>{regionCount}</b>
            <span>지역</span>
          </div>
          <div>
            <b>{memoryCount}</b>
            <span>사진·영상</span>
          </div>
        </div>

        {editing ? (
          <div className="prof__form">
            <label className="prof__field">
              <span>이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </label>
            <label className="prof__field">
              <span>프로필 사진 URL</span>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://…"
              />
            </label>
            {error && <p className="prof__err">{error}</p>}
            <div className="prof__actions">
              <button className="prof__cancel" onClick={() => setEditing(false)}>
                취소
              </button>
              <button className="prof__save" disabled={saving} onClick={submit}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <button className="prof__edit" onClick={() => setEditing(true)}>
            프로필 수정
          </button>
        )}
      </div>
    </div>
  )
}
