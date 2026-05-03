// Initialize MapLibre GL JS with Globe projection
const map = new maplibregl.Map({
    container: 'map',
    interactive: false, // Disables all mouse/touch interactions entirely
    maxTileCacheSize: 5000, // Aggressively cache thousands of tiles in RAM
    maxTileCacheZoomLevels: 15, // Keep tiles cached across almost all zoom levels
    prefetchZoomDelta: 2, // Pre-load adjacent zoom levels for smoother transitions
    style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        projection: {
            type: 'globe' // This is what creates the 3D earth
        },
        sources: {
            'satellite': {
                type: 'raster',
                // Free, extremely high resolution satellite imagery from Esri
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                maxzoom: 19
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: {
                    'background-color': 'rgba(0, 0, 0, 0)' // Transparent to show CSS star background
                }
            },
            {
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite',
                paint: {
                    'raster-opacity': 1
                }
            }
        ]
    },
    center: [0, 20], // Starting longitude and latitude
    zoom: 2.8, // Default state (globe takes up more of the screen)
    minZoom: 0.5, // Allow zooming out until the globe is very small
    maxZoom: 18, // Max scroll in (street level detail!)
    pitch: 0,
    bearing: 0,
    dragRotate: false, // Disabling this locks the axis (North Pole is always up)
    touchZoomRotate: false, // Lock rotation for touch devices as well
    renderWorldCopies: false, // Don't repeat the world on flat view
});

// Configure background color and ensure projection
map.on('style.load', () => {
    // Explicitly set projection just in case the style config was missed by the engine
    map.setProjection({ type: 'globe' });
});

// Implement continuous spinning globe effect
let spinning = true;
let orbitingCity = false; // Flag for local city rotation
let currentRotation = map.getCenter().lng;
const spinSpeed = 0.05; // degrees per frame
let spinTimeout;

function spinGlobe() {
    if (spinning) {
        currentRotation += spinSpeed;
        if (currentRotation > 180) currentRotation -= 360;
        
        // JumpTo is highly performant for continuous frame updates
        map.jumpTo({
            center: [currentRotation, map.getCenter().lat],
            zoom: map.getZoom() // Maintain current zoom
        });
    } else if (orbitingCity) {
        // Slowly rotate the camera around the target location
        const currentBearing = map.getBearing();
        map.jumpTo({
            bearing: currentBearing + 0.05, // Slowed down significantly for a cinematic glide
            zoom: map.getZoom()
        });
    }
    requestAnimationFrame(spinGlobe);
}

// Start spinning once the map is fully loaded
map.once('load', () => {
    spinGlobe();
});

// --- Global AI News Reader Logic ---

// Mock User Profile for context
const userProfile = {
    interests: [],
    preferredLocations: [],
    language: 'English',
    generalData: {} // Holder for arbitrary data
};

const dummyArticles = [
    {
        id: 1,
        title: "Advances in Quantum Computing in Tokyo",
        location: "Tokyo, Japan",
        date: "May 2, 2026",
        lngLat: [139.6917, 35.6895],
        imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80",
        summary: "AI Summary: Researchers in Tokyo have achieved a new milestone in quantum error correction, paving the way for stable quantum computers.",
        content: "Full translated article text... (dummy data). Researchers at the Tokyo Institute of Quantum Studies have successfully maintained a stable qubit state for an unprecedented 4 seconds, a massive leap for the industry. This breakthrough relies on a new topological shielding method that isolates the quantum system from thermal noise."
    },
    {
        id: 2,
        title: "New Climate Accord Signed in Paris",
        location: "Paris, France",
        date: "May 1, 2026",
        lngLat: [2.3522, 48.8566],
        imageUrl: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=400&q=80",
        summary: "AI Summary: Global leaders gathered in Paris to sign a new, more aggressive carbon reduction treaty.",
        content: "Full translated article text... (dummy data). In a historic move, representatives from 140 nations agreed to the 'Paris 2.0' protocol. The treaty mandates strict AI-driven energy routing grids to be installed by 2030, aiming to drop global emissions by a further 15%."
    },
    {
        id: 3,
        title: "Tech Startup Boom in Sydney",
        location: "Sydney, Australia",
        date: "April 29, 2026",
        lngLat: [151.2093, -33.8688],
        imageUrl: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=400&q=80",
        summary: "AI Summary: Sydney's tech sector is seeing unprecedented growth, rivaling Silicon Valley's early days.",
        content: "Full translated article text... (dummy data). Venture capital is flooding into New South Wales as a new generation of AI startups set up shop in Sydney. The government's new tech-visa program has brought in top talent from around the globe."
    }
];

// UI Elements
const stage1Chat = document.getElementById('stage1-chat');
const rightPanel = document.getElementById('right-panel');
const stage2List = document.getElementById('stage2-list');
const stage3Article = document.getElementById('stage3-article');
const chatInput = document.getElementById('ai-chat-input');
const chatHistory = document.getElementById('chat-history');
const generateBtn = document.getElementById('generate-news-btn');
const articleListContainer = document.getElementById('article-list-container');
const fullArticleContainer = document.getElementById('full-article-container');
const backBtn = document.getElementById('back-btn');
const navChatBtn = document.getElementById('nav-chat-btn');

let activeMarkers = [];

// --- Stage Management ---
function setStage(stage) {
    if (stage === 1) {
        stage1Chat.classList.remove('hidden');
        rightPanel.classList.remove('forced-open');
        // We no longer add .hidden here to allow hover in all states
        
        // Reset Layout
        map.easeTo({ padding: { right: 0 }, duration: 1000 });
        
        // Reset Globe to deep space for chat
        spinning = true;
        orbitingCity = false;
        map.flyTo({
            center: [map.getCenter().lng, 20],
            zoom: 2.8,
            pitch: 0,
            bearing: 0,
            speed: 1.2,
            essential: true
        });
    } else if (stage === 2) {
        stage1Chat.classList.add('hidden');
        rightPanel.classList.remove('hidden');
        rightPanel.classList.remove('forced-open'); 
        stage2List.classList.remove('hidden');
        stage3Article.classList.add('hidden');
        
        // Shift Globe to the left
        map.easeTo({ padding: { right: 450 }, duration: 1000 });
        
        // Reset Globe rotation state
        spinning = true;
        orbitingCity = false;
        map.flyTo({
            center: [map.getCenter().lng, 20],
            zoom: 2.8,
            pitch: 0,
            bearing: 0,
            speed: 1.2,
            essential: true
        });
    } else if (stage === 3) {
        stage2List.classList.add('hidden');
        stage3Article.classList.remove('hidden');
        // Layout padding is maintained from stage 2
    }
}

// --- Stage 1: Chat Logic ---
let chatCount = 0;
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Append User Message
        const userMsg = document.createElement('div');
        userMsg.className = 'msg user-msg';
        userMsg.textContent = text;
        chatHistory.appendChild(userMsg);
        
        // Simple profile building logic
        userProfile.interests.push(text);
        userProfile.generalData.lastInput = text;
        
        chatInput.value = '';
        chatCount++;
        
        // Mock AI Response
        setTimeout(() => {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'msg ai-msg';
            if (chatCount === 1) {
                aiMsg.textContent = `That's very interesting. I've noted your interest in "${text}". Tell me more about what regions or topics you care about.`;
            } else {
                aiMsg.textContent = "Got it. I've built your profile. I can now generate a personalized global news feed for you.";
                generateBtn.classList.remove('hidden'); 
            }
            chatHistory.appendChild(aiMsg);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }, 600);
    }
});

// --- Stage 2: List & Rays Logic ---
generateBtn.addEventListener('click', () => {
    // Morph the chat into a navbar dropdown
    stage1Chat.classList.add('dropdown-mode');
    
    setStage(2);
    renderArticleList();
    renderRays();
    
    // Automatically slide out the right panel when entering Stage 2
    setTimeout(() => {
        rightPanel.classList.add('forced-open');
    }, 300);
});

function renderArticleList() {
    articleListContainer.innerHTML = '';
    dummyArticles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.innerHTML = `
            <img src="${article.imageUrl}" alt="${article.title}" class="article-img">
            <div class="article-card-content">
                <h3>${article.title}</h3>
                <div class="article-meta">
                    <span>${article.location}</span>
                    <span>${article.date}</span>
                </div>
            </div>
        `;
        card.onclick = () => enterArticleView(article);
        articleListContainer.appendChild(card);
    });
}

function renderRays() {
    // Clear old markers
    activeMarkers.forEach(m => m.remove());
    activeMarkers = [];
    
    dummyArticles.forEach(article => {
        // Create custom DOM element for the ray
        const el = document.createElement('div');
        el.className = 'ray-marker';
        
        // Create Nearby Panel (Mini-Card)
        const tooltip = document.createElement('div');
        tooltip.className = 'ray-tooltip';
        tooltip.innerHTML = `
            <img src="${article.imageUrl}" class="tooltip-img">
            <div class="tooltip-content">
                <div class="tooltip-meta">${article.location}</div>
                <h4>${article.title}</h4>
                <p>${article.summary.replace('AI Summary: ', '')}</p>
            </div>
        `;
        el.appendChild(tooltip);
        
        // Add click listener
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            enterArticleView(article);
        });
        
        // Add to map
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(article.lngLat)
            .addTo(map);
            
        activeMarkers.push(marker);
    });
}

// --- Stage 3: Article View Logic ---
function enterArticleView(article) {
    // Keep the panel visible but switch to Stage 3 immediately
    setStage(3);
    
    // Hide tooltips that might be stuck on hover
    const tooltips = document.querySelectorAll('.ray-tooltip');
    tooltips.forEach(t => t.style.opacity = '0');
    
    // Populate Article Content in the background
    fullArticleContainer.innerHTML = `
        <img src="${article.imageUrl}" alt="${article.title}" class="full-article-img">
        <h2>${article.title}</h2>
        <div class="meta">${article.location} &bull; ${article.date}</div>
        <div class="summary">${article.summary}</div>
        <div class="content">${article.content}</div>
    `;
    
    // Cinematic Flight to the Article Location
    spinning = false;
    orbitingCity = false;
    
    setTimeout(() => {
        map.flyTo({
            center: article.lngLat,
            zoom: 14.5,
            speed: 0.8,
            curve: 1.5,
            pitch: 60,
            bearing: 0,
            essential: true
        });
    }, 150);
    
    map.once('moveend', () => {
        // Once we arrive, start the orbit and ensure panel is forced open
        rightPanel.classList.add('forced-open'); 
        orbitingCity = true;
        
        // Restore tooltip hover behavior
        tooltips.forEach(t => t.style.opacity = '');
    });
}

backBtn.addEventListener('click', () => {
    setStage(2);
});

navChatBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent standard link jump
    // Simply toggle the chat dropdown overlay on top of whatever stage we are in
    stage1Chat.classList.toggle('hidden');
});
