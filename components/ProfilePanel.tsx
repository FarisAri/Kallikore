import type { UserProfile } from '@/lib/profile'

interface ProfilePanelProps {
  profile: UserProfile | null
  isOpen: boolean
  onClose: () => void
}

export default function ProfilePanel({ profile, isOpen, onClose }: ProfilePanelProps) {
  return (
    <div id="profile-panel" className={isOpen ? 'open' : undefined} aria-hidden={!isOpen}>
      <div className="profile-panel-header">
        <h2>Current Profile</h2>
        <button type="button" onClick={onClose} aria-label="Close profile panel">
          Close
        </button>
      </div>
      <pre>{JSON.stringify(profile ?? {}, null, 2)}</pre>
    </div>
  )
}
