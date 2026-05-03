import { useEffect, useMemo, useState } from 'react'
import type { UserProfile } from '@/lib/profile'

interface ProfilePanelProps {
  profile: UserProfile | null
  isOpen: boolean
  isSaving?: boolean
  error?: string | null
  onClose: () => void
  onSave: (profile: UserProfile) => Promise<void> | void
}

const LIST_FIELDS = [
  ['hobbies', 'Hobbies'],
  ['international_news_focus', 'International News Focus'],
  ['news_topics', 'News Topics'],
  ['avoid_topics', 'Avoid Topics'],
] as const

function emptyEditableProfile(): UserProfile {
  return {
    user_location: null,
    hobbies: [],
    international_news_focus: [],
    ethnicity: null,
    age: null,
    native_language: null,
    occupation: null,
    news_topics: [],
    avoid_topics: [],
    etc: {},
  }
}

function textToNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function splitListInput(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function ProfilePanel({
  profile,
  isOpen,
  isSaving = false,
  error,
  onClose,
  onSave,
}: ProfilePanelProps) {
  const initial = useMemo(() => profile ?? emptyEditableProfile(), [profile])
  const [draft, setDraft] = useState<UserProfile>(initial)
  const [newItems, setNewItems] = useState<Record<string, string>>({})
  const [etcText, setEtcText] = useState('{}')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    const next = profile ?? emptyEditableProfile()
    setDraft(next)
    setEtcText(JSON.stringify(next.etc ?? {}, null, 2))
    setLocalError(null)
    setNewItems({})
  }, [profile, isOpen])

  function setScalar<K extends 'user_location' | 'ethnicity' | 'native_language' | 'occupation'>(
    key: K,
    value: string,
  ) {
    setDraft((prev) => ({ ...prev, [key]: textToNullable(value) }))
  }

  function addListItem(key: (typeof LIST_FIELDS)[number][0]) {
    const items = splitListInput(newItems[key] ?? '')
    if (items.length === 0) return
    setDraft((prev) => ({
      ...prev,
      [key]: Array.from(new Set([...prev[key], ...items])),
    }))
    setNewItems((prev) => ({ ...prev, [key]: '' }))
  }

  function removeListItem(key: (typeof LIST_FIELDS)[number][0], value: string) {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].filter((item) => item !== value),
    }))
  }

  async function handleSubmit() {
    let etc: Record<string, unknown>
    try {
      const parsed = JSON.parse(etcText || '{}') as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Etc must be a JSON object.')
      }
      etc = parsed as Record<string, unknown>
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Etc must be valid JSON.')
      return
    }

    setLocalError(null)
    await onSave({ ...draft, etc })
  }

  return (
    <div id="profile-panel" className={isOpen ? 'open' : undefined} aria-hidden={!isOpen}>
      <div className="profile-panel-header">
        <h2>Current Profile</h2>
        <div className="profile-panel-actions">
          <button type="button" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close profile panel">
            Close
          </button>
        </div>
      </div>
      <div className="profile-editor">
        {(localError || error) && <div className="profile-error">{localError ?? error}</div>}

        <label className="profile-field">
          <span>User Location</span>
          <input
            value={draft.user_location ?? ''}
            onChange={(e) => setScalar('user_location', e.target.value)}
            placeholder="Portland, Oregon"
          />
        </label>

        <label className="profile-field">
          <span>Native Language</span>
          <input
            value={draft.native_language ?? ''}
            onChange={(e) => setScalar('native_language', e.target.value)}
            placeholder="English"
          />
        </label>

        <label className="profile-field">
          <span>Occupation</span>
          <input
            value={draft.occupation ?? ''}
            onChange={(e) => setScalar('occupation', e.target.value)}
            placeholder="Software engineer"
          />
        </label>

        <label className="profile-field">
          <span>Age</span>
          <input
            type="number"
            min="0"
            value={draft.age ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setDraft((prev) => ({
                ...prev,
                age: value === '' ? null : Number(value),
              }))
            }}
            placeholder="22"
          />
        </label>

        <label className="profile-field">
          <span>Ethnicity / Community Context</span>
          <input
            value={draft.ethnicity ?? ''}
            onChange={(e) => setScalar('ethnicity', e.target.value)}
            placeholder="Optional"
          />
        </label>

        {LIST_FIELDS.map(([key, label]) => (
          <section className="profile-list-field" key={key}>
            <span>{label}</span>
            <div className="profile-chip-list">
              {draft[key].length === 0 && <em>None yet</em>}
              {draft[key].map((item) => (
                <button
                  type="button"
                  className="profile-chip"
                  key={item}
                  onClick={() => removeListItem(key, item)}
                  title="Remove"
                >
                  {item}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
            <div className="profile-add-row">
              <input
                value={newItems[key] ?? ''}
                onChange={(e) => setNewItems((prev) => ({ ...prev, [key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addListItem(key)
                  }
                }}
                placeholder="Add item, comma separated"
              />
              <button type="button" onClick={() => addListItem(key)}>
                Add
              </button>
            </div>
          </section>
        ))}

        <label className="profile-field profile-field-wide">
          <span>Etc JSON</span>
          <textarea
            value={etcText}
            onChange={(e) => setEtcText(e.target.value)}
            rows={5}
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  )
}
