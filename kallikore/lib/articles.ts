export interface Article {
  id: number
  title: string
  location: string
  date: string
  lngLat: [number, number]
  imageUrl: string
  summary: string
  content: string
}

export const DUMMY_ARTICLES: Article[] = [
  {
    id: 1,
    title: 'Advances in Quantum Computing in Tokyo',
    location: 'Tokyo, Japan',
    date: 'May 2, 2026',
    lngLat: [139.6917, 35.6895],
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
    summary: 'AI Summary: Researchers in Tokyo have achieved a new milestone in quantum error correction, paving the way for stable quantum computers.',
    content: 'Full translated article text... (dummy data). Researchers at the Tokyo Institute of Quantum Studies have successfully maintained a stable qubit state for an unprecedented 4 seconds, a massive leap for the industry. This breakthrough relies on a new topological shielding method that isolates the quantum system from thermal noise.',
  },
  {
    id: 2,
    title: 'New Climate Accord Signed in Paris',
    location: 'Paris, France',
    date: 'May 1, 2026',
    lngLat: [2.3522, 48.8566],
    imageUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=400&q=80',
    summary: 'AI Summary: Global leaders gathered in Paris to sign a new, more aggressive carbon reduction treaty.',
    content: "Full translated article text... (dummy data). In a historic move, representatives from 140 nations agreed to the 'Paris 2.0' protocol. The treaty mandates strict AI-driven energy routing grids to be installed by 2030, aiming to drop global emissions by a further 15%.",
  },
  {
    id: 3,
    title: 'Tech Startup Boom in Sydney',
    location: 'Sydney, Australia',
    date: 'April 29, 2026',
    lngLat: [151.2093, -33.8688],
    imageUrl: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=400&q=80',
    summary: "AI Summary: Sydney's tech sector is seeing unprecedented growth, rivaling Silicon Valley's early days.",
    content: "Full translated article text... (dummy data). Venture capital is flooding into New South Wales as a new generation of AI startups set up shop in Sydney. The government's new tech-visa program has brought in top talent from around the globe.",
  },
]
