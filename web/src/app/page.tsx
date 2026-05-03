import Link from 'next/link';

export default function Home() {
  return (
    <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4rem 1.5rem' }}>
      <div className="animate-fade-in" style={{ maxWidth: '800px' }}>
        <h1 style={{ fontSize: '3.5rem', marginBottom: '1.5rem', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #FFF, #A1A1AA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          News that actually <span style={{ color: 'var(--primary)', WebkitTextFillColor: 'var(--primary)' }}>matters</span> to you.
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem' }}>
          Stop doomscrolling through clickbait. Let our AI understand your unique interests and curate a premium, personalized feed just for you.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link href="/onboarding" className="btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem', borderRadius: '12px' }}>
            Get Started
          </Link>
          <Link href="/feed" className="btn-secondary">
            View Demo Feed
          </Link>
        </div>
      </div>

      <div className="glass animate-fade-in" style={{ marginTop: '5rem', padding: '2rem', width: '100%', maxWidth: '900px', display: 'flex', justifyContent: 'space-around', gap: '2rem', animationDelay: '0.2s', opacity: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧠</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>AI Profiling</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Conversational onboarding builds your semantic profile.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Deep Search</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>We scan global news sources to find exact matches.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨</div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Signal over Noise</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Read what matters. Ranked by relevance, not clicks.</p>
        </div>
      </div>
    </div>
  );
}
