'use client';

import { useEffect, useState } from 'react';
import styles from './feed.module.css';

type Movie = {
  title: string;
  text: string;
  image: string;
  url: string;
  date: string;
  score: number;
};

export default function Feed() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        let profile = null;
        const stored = localStorage.getItem('user_profile');
        if (stored) {
          profile = JSON.parse(stored);
        } else {
          // Fallback demo profile
          profile = {
            name: "Alex",
            age: 30,
            favorite_genres: ["Sci-Fi", "Thriller"],
            favorite_movies: ["Inception", "Interstellar"],
            favorite_directors: ["Christopher Nolan"],
            favorite_actors: ["Leonardo DiCaprio", "Matthew McConaughey"],
            disliked_genres: ["Romance", "Musical"],
            extra: "I love movies that make me think and have mind-bending plot twists."
          };
        }

        const res = await fetch('http://127.0.0.1:8000/api/movies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        });

        if (!res.ok) throw new Error('Failed to fetch movies');
        
        const data = await res.json();
        setMovies(data.movies);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovies();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p style={{ color: 'var(--text-muted)' }}>Curating your personalized feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
        <h2>Oops, something went wrong.</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className={styles.feedContainer}>
        <div className={styles.header}>
          <h1>Your Movie Recommendations</h1>
          <p style={{ color: 'var(--text-muted)' }}>Curated movies matching your semantic profile.</p>
        </div>

        <div className={styles.grid}>
          {movies.map((movie, idx) => (
            <div key={idx} className={styles.card}>
              <div className={styles.imageWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={movie.image} alt={movie.title} className={styles.image} onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/400x600?text=No+Image'; }} />
              </div>
              <div className={styles.content}>
                <h3 className={styles.title}>{movie.title}</h3>
                <p className={styles.summary}>{movie.text || "No overview available."}</p>
                
                <div className={styles.footer}>
                  <div className={styles.score}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    {(movie.score * 100).toFixed(1)}% Match
                  </div>
                  <a href={movie.url} target="_blank" rel="noopener noreferrer" className={styles.readMore}>
                    View Movie
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
