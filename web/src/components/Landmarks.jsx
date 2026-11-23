// Original line-art landmarks for BEE-OAK's popular cities (64×64, stroke-based).
const L = {
  Mumbai: [ // Gateway of India
    'M6 56h52', 'M12 56V28h40v28', 'M12 32h40', 'M26 56V42a6 6 0 0 1 12 0v14',
    'M14 28v-7h7v7M43 28v-7h7v7', 'M15.5 21a2 2 0 0 1 4 0M44.5 21a2 2 0 0 1 4 0', 'M24 28v-4h16v4',
    'M15 38h5v8h-5zM44 38h5v8h-5z',
  ],
  Delhi: [ // India Gate
    'M6 56h52', 'M18 56V22h28v34', 'M26 56V36a6 6 0 0 1 12 0v20', 'M16 22h32', 'M20 22v-5h24v5',
    'M24 17v-4h16v4', 'M28 13V9h8v4', 'M18 28h28', 'M21 32v20M43 32v20',
  ],
  Bengaluru: [ // Vidhana Soudha
    'M4 56h56', 'M8 56V38h48v18', 'M22 38v-8h20v8', 'M25 30v-3a7 7 0 0 1 14 0v3', 'M32 20v-6', 'M30.5 14h3',
    'M12 42v12M17 42v12M47 42v12M52 42v12', 'M26 42v14M32 42v14M38 42v14', 'M9 38v-4h7v4M48 38v-4h7v4',
  ],
  Hyderabad: [ // Charminar
    'M6 56h52', 'M17 56V30h30v26', 'M26 56V45a6 6 0 0 1 12 0v11', 'M12 56V20h5v36M47 56V20h5v36',
    'M12 20l2.5-7 2.5 7M47 20l2.5-7 2.5 7', 'M14.5 13v-3M49.5 13v-3', 'M10.5 30h8M45.5 30h8M10.5 41h8M45.5 41h8',
    'M21 30v-5h22v5', 'M22 36h20',
  ],
  Chennai: [ // Temple gopuram
    'M8 56h48', 'M15 56l4-12h26l4 12', 'M19 44l3-9h20l3 9', 'M22 35l3-8h14l3 8', 'M25 27l2-7h10l2 7',
    'M27 20h10', 'M29 20v-4h6v4', 'M32 16v-4', 'M29 56v-6a3 3 0 0 1 6 0v6',
  ],
  Kolkata: [ // Victoria Memorial
    'M4 56h56', 'M8 56V40h48v16', 'M20 40v-8h24v8', 'M23 32a9 9 0 0 1 18 0', 'M32 23v-6', 'M30 17l2-4 2 4',
    'M10 40a4 4 0 0 1 8 0M46 40a4 4 0 0 1 8 0', 'M26 44v12M32 44v12M38 44v12', 'M12 46v6M52 46v6',
  ],
  Pune: [ // Shaniwar Wada gate
    'M4 56h56', 'M8 56V30h13v26M43 56V30h13v26', 'M21 56V34h22v22', 'M28 56V44h8v12',
    'M8 30v-4h3v4h3v-4h3v4h4M43 30v-4h3v4h3v-4h3v4h4', 'M21 34v-6h22v6', 'M25 28v-3h14v3', 'M12 38h5M47 38h5',
  ],
  Ahmedabad: [ // Mosque with minarets
    'M6 56h52', 'M12 56V25h4v31M48 56V25h4v31', 'M12 25l2-6 2 6M48 25l2-6 2 6', 'M14 19v-3M50 19v-3',
    'M16 56V37h32v19', 'M21 56V47a4 4 0 0 1 8 0v9M35 56V47a4 4 0 0 1 8 0v9', 'M24 37a8 8 0 0 1 16 0', 'M32 29v-4', 'M11 33h6M47 33h6',
  ],
  Jaipur: [ // Hawa Mahal
    'M6 56h52', 'M10 56V38h44v18', 'M15 38V28h34v10', 'M21 28v-8h22v8', 'M27 20v-6h10v6', 'M32 14v-3',
    'M14 44h4M22 44h4M38 44h4M46 44h4', 'M19 32h3M27 32h3M34 32h3M42 32h3', 'M26 24h3M35 24h3', 'M29 56v-6h6v6',
  ],
  Goa: [ // Palms by the sea
    'M22 52c0-8 2-15 6-21', 'M28 31c-4-4-10-4-14 0M28 31c2-6 8-8 12-6M28 31c-6 0-10 4-11 9M28 31c6-1 11 2 13 7',
    'M42 52c0-6-1-11-4-15', 'M38 37c3-4 8-4 11-1M38 37c-3-3-7-3-10 0M38 37c4 0 7 3 8 6',
    'M4 56c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0',
  ],
  Kochi: [ // Chinese fishing nets
    'M4 56c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0', 'M8 50h18v3H8z',
    'M20 50L36 12', 'M36 12l20 18', 'M36 12L27 38', 'M27 38q14 4 29-8', 'M31 33l5-2M39 30l6-1', 'M12 50v-6M18 50v-6',
  ],
  Chandigarh: [ // Open Hand monument
    'M20 56h24', 'M32 56V42', 'M26 42h12', 'M22 40c-2-6-3-11-1-17l3 6V16l3 9V13l3 10V15l3 9 5-6c2 5-1 14-4 22z', 'M14 56V48h8v8',
  ],
  Visakhapatnam: [ // Hills, lighthouse and sea
    'M4 56c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0 5 2 8 0 5-2 8 0', 'M4 50l12-18 9 9 8-15 11 14',
    'M46 51V30h5v21', 'M45 30h7', 'M48.5 30v-4', 'M46 26l2.5-3 2.5 3', 'M47 36h3M47 42h3',
  ],
  Bhimavaram: [ // Somarama temple
    'M8 56h48', 'M17 56V40h30v16', 'M21 40l4-14h14l4 14', 'M25 26l2-8h10l2 8', 'M32 18v-7', 'M32 11l6 2-6 2',
    'M29 56v-8a3 3 0 0 1 6 0v8', 'M21 44v12M43 44v12', 'M24 33h16',
  ],
  Vijayawada: [ // Barrage below the hill temple
    'M4 48h56', 'M6 48v8M14 48v8M22 48v8M30 48v8M38 48v8M46 48v8M54 48v8',
    'M12 48c6-16 14-24 20-24s14 8 20 24', 'M28 24v-5h8v5', 'M29 19l3-6 3 6', 'M32 13v-3',
  ],
  Guntur: [ // Clock tower
    'M22 56h20', 'M25 56V24h14v32', 'M23 24h18', 'M26 24l6-11 6 11', 'M32 13V9',
    'M28 32a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'M32 30v2l1.5 1.5', 'M29 56v-8h6v8', 'M28 42h8',
  ],
  Lucknow: [ // Rumi Darwaza
    'M6 56h52', 'M12 56V26h40v30', 'M22 56V38a10 10 0 0 1 20 0v18', 'M12 26c4-7 9-11 20-13 11 2 16 6 20 13',
    'M32 13V8', 'M16 26v-6M48 26v-6', 'M15 32h4M45 32h4',
  ],
  Bhubaneswar: [ // Lingaraj temple shikhara
    'M10 56h44', 'M19 56V44h26v12', 'M22 44c0-14 4-24 10-30 6 6 10 16 10 30', 'M27 14h10', 'M32 14V8', 'M29.5 8h5',
    'M24 36h16M23 28h18', 'M29 56v-6h6v6',
  ],
  'All India': [ // Skyline
    'M4 56h56', 'M8 56V34h10v22', 'M18 56V24h12v32', 'M30 56V30l8-6 8 6v26', 'M46 56V38h10v18',
    'M22 30h4M22 36h4M22 42h4M11 40h4M11 46h4M35 36h6M35 42h6M49 44h4', 'M24 24v-6M38 24v-5',
  ],
};

// Cities drawn as artwork (transparent PNG used as a mask, so it takes the text colour in both themes).
const ART = { Anantapur: '/landmarks/anantapur.png' };

export const hasLandmark = (city) => !!(L[city] || ART[city]);

export default function Landmark({ city, size = 64 }) {
  if (ART[city]) {
    return <span className="landmark landmark-art" style={{ width: size * 1.85, height: size, '--lm-art': `url("${ART[city]}")` }} aria-hidden="true" />;
  }
  const paths = L[city] || L['All India'];
  return (
    <svg className="landmark" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} pathLength="1" />)}
    </svg>
  );
}
