'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './profile.module.css';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>({
    name: '',
    age: '',
    favorite_genres: '',
    favorite_movies: '',
    favorite_directors: '',
    favorite_actors: '',
    disliked_genres: '',
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
          favorite_genres: Array.isArray(parsed.favorite_genres) ? parsed.favorite_genres.join(', ') : parsed.favorite_genres || '',
          favorite_movies: Array.isArray(parsed.favorite_movies) ? parsed.favorite_movies.join(', ') : parsed.favorite_movies || '',
          favorite_directors: Array.isArray(parsed.favorite_directors) ? parsed.favorite_directors.join(', ') : parsed.favorite_directors || '',
          favorite_actors: Array.isArray(parsed.favorite_actors) ? parsed.favorite_actors.join(', ') : parsed.favorite_actors || '',
          disliked_genres: Array.isArray(parsed.disliked_genres) ? parsed.disliked_genres.join(', ') : parsed.disliked_genres || '',
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
      favorite_genres: profile.favorite_genres.split(',').map((s: string) => s.trim()).filter(Boolean),
      favorite_movies: profile.favorite_movies.split(',').map((s: string) => s.trim()).filter(Boolean),
      favorite_directors: profile.favorite_directors.split(',').map((s: string) => s.trim()).filter(Boolean),
      favorite_actors: profile.favorite_actors.split(',').map((s: string) => s.trim()).filter(Boolean),
      disliked_genres: profile.disliked_genres.split(',').map((s: string) => s.trim()).filter(Boolean),
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
        <p>Edit your semantic profile to tune your movie recommendations.</p>
      </div>

      <div className={styles.form}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className={styles.formGroup} style={{ flex: 2 }}>
            <label className={styles.label}>Name</label>
            <input type="text" name="name" className={styles.input} value={profile.name} onChange={handleChange} />
          </div>
          <div className={styles.formGroup} style={{ flex: 1 }}>
            <label className={styles.label}>Age</label>
            <input type="number" name="age" className={styles.input} value={profile.age} onChange={handleChange} />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Favorite Genres (comma separated)</label>
          <input type="text" name="favorite_genres" className={styles.input} value={profile.favorite_genres} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Favorite Movies or Shows (comma separated)</label>
          <input type="text" name="favorite_movies" className={styles.input} value={profile.favorite_movies} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Favorite Directors (comma separated)</label>
          <input type="text" name="favorite_directors" className={styles.input} value={profile.favorite_directors} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Favorite Actors (comma separated)</label>
          <input type="text" name="favorite_actors" className={styles.input} value={profile.favorite_actors} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Disliked Genres (comma separated)</label>
          <input type="text" name="disliked_genres" className={styles.input} value={profile.disliked_genres} onChange={handleChange} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Additional Info</label>
          <textarea name="extra" className={`${styles.input} ${styles.textarea}`} value={profile.extra} onChange={handleChange} />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ backgroundColor: 'rgba(255, 50, 50, 0.2)', color: '#ffaaaa', border: '1px solid rgba(255, 50, 50, 0.4)', boxShadow: 'none' }} onClick={() => {
            if(confirm('Are you sure you want to completely delete your profile?')) {
              localStorage.removeItem('user_profile');
              setProfile({ name: '', age: '', favorite_genres: '', favorite_movies: '', favorite_directors: '', favorite_actors: '', disliked_genres: '', extra: '' });
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
