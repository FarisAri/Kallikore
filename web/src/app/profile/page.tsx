'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './profile.module.css';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>({
    name: '',
    age: '',
    ethnicity: '',
    occupation: '',
    locations: '',
    hobbies: '',
    interests: '',
    countries_of_interest: '',
    extra: '',
  });

  useEffect(() => {
    const stored = localStorage.getItem('user_profile');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setProfile({
          name: parsed.name || '',
          age: parsed.age || '',
          ethnicity: parsed.ethnicity || '',
          occupation: parsed.occupation || '',
          locations: Array.isArray(parsed.locations) ? parsed.locations.join(', ') : parsed.locations || '',
          hobbies: Array.isArray(parsed.hobbies) ? parsed.hobbies.join(', ') : parsed.hobbies || '',
          interests: Array.isArray(parsed.interests) ? parsed.interests.join(', ') : parsed.interests || '',
          countries_of_interest: Array.isArray(parsed.countries_of_interest) ? parsed.countries_of_interest.join(', ') : parsed.countries_of_interest || '',
          extra: parsed.extra || '',
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    // Convert comma separated strings back to arrays
    const formattedProfile = {
      ...profile,
      age: parseInt(profile.age) || undefined,
      locations: profile.locations.split(',').map((s: string) => s.trim()).filter(Boolean),
      hobbies: profile.hobbies.split(',').map((s: string) => s.trim()).filter(Boolean),
      interests: profile.interests.split(',').map((s: string) => s.trim()).filter(Boolean),
      countries_of_interest: profile.countries_of_interest.split(',').map((s: string) => s.trim()).filter(Boolean),
    };

    localStorage.setItem('user_profile', JSON.stringify(formattedProfile));
    
    // Quick visual feedback
    const btn = document.getElementById('saveBtn');
    if (btn) {
      btn.innerText = 'Saved!';
      setTimeout(() => { btn.innerText = 'Save Profile'; }, 2000);
    }
  };

  return (
    <div className={styles.profileContainer}>
      <div className={styles.header}>
        <h1>Your Profile</h1>
        <p>Edit your semantic profile to tune your news feed recommendations.</p>
      </div>

      <div className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Name</label>
          <input type="text" name="name" className={styles.input} value={profile.name} onChange={handleChange} />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.label}>Age</label>
            <input type="number" name="age" className={styles.input} value={profile.age} onChange={handleChange} />
          </div>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.label}>Ethnicity</label>
            <input type="text" name="ethnicity" className={styles.input} value={profile.ethnicity} onChange={handleChange} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Occupation</label>
          <input type="text" name="occupation" className={styles.input} value={profile.occupation} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Locations (comma separated)</label>
          <input type="text" name="locations" className={styles.input} value={profile.locations} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Hobbies (comma separated)</label>
          <input type="text" name="hobbies" className={styles.input} value={profile.hobbies} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Interests (comma separated)</label>
          <input type="text" name="interests" className={styles.input} value={profile.interests} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Countries of Interest (comma separated)</label>
          <input type="text" name="countries_of_interest" className={styles.input} value={profile.countries_of_interest} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Additional Info</label>
          <textarea name="extra" className={`${styles.input} ${styles.textarea}`} value={profile.extra} onChange={handleChange} />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ backgroundColor: 'rgba(255, 50, 50, 0.2)', color: '#ffaaaa', border: '1px solid rgba(255, 50, 50, 0.4)', boxShadow: 'none' }} onClick={() => {
            if(confirm('Are you sure you want to completely delete your profile?')) {
              localStorage.removeItem('user_profile');
              setProfile({ name: '', age: '', ethnicity: '', occupation: '', locations: '', hobbies: '', interests: '', countries_of_interest: '', extra: '' });
              alert('Profile deleted.');
            }
          }}>
            Delete Profile
          </button>
          <button className="btn-primary" style={{ backgroundColor: 'var(--surface-hover)', boxShadow: 'none' }} onClick={() => router.push('/onboarding')}>
            Modify via Chat
          </button>
          <button id="saveBtn" className={`btn-primary ${styles.saveBtn}`} style={{ margin: 0 }} onClick={handleSave}>
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
