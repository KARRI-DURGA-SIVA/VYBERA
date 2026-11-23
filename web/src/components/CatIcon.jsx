// Two-tone illustrated category icons (ink outline + gold accent), drawn for BEE-OAK.
const INK = 'currentColor';
const ACC = 'var(--cat-accent, #c99a2e)';
const sw = { fill: 'none', stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const sa = { ...sw, stroke: ACC };

const ICONS = {
  All: (<>
    <path {...sw} d="M14 5.5 18.5 8v5L14 15.5 9.5 13V8L14 5.5Z" />
    <path {...sw} d="M8.5 15 13 17.5v5L8.5 25 4 22.5v-5L8.5 15Z" />
    <path {...sa} d="M19.5 15 24 17.5v5L19.5 25 15 22.5v-5l4.5-2.5Z" fill={ACC} fillOpacity=".18" />
  </>),
  Opportunity: (<>
    <rect {...sw} x="4" y="9" width="20" height="14" rx="2.5" />
    <path {...sw} d="M10.5 9V7a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M4 15h20" />
    <rect x="12" y="13.5" width="4" height="3.4" rx="1" fill={ACC} />
    <path {...sa} d="M23 3.5v3M21.5 5h3" />
  </>),
  Music: (<>
    <path {...sw} d="M7 21.5 15.5 13" />
    <circle cx="18" cy="10.5" r="4.2" fill={ACC} />
    <path stroke="#fff" strokeWidth="1" d="M15.7 9.2l3.6 3.6M17 8.2l3.6 3.6" />
    <path {...sw} d="M5.2 23.3c-.9-.9-.6-1.9.3-2.8l1.8 1.8c-.9.9-1.9 1.2-2.1 1Z" />
    <path {...sw} d="M21 19v5.2M21 19l3-1v4.6" />
    <circle cx="20" cy="24.3" r="1.2" fill={INK} /><circle cx="23" cy="22.7" r="1.2" fill={INK} />
  </>),
  Food: (<>
    <path {...sw} d="M4 15h20a10 10 0 0 1-20 0Z" />
    <path {...sw} d="M3 15h22" />
    <path {...sa} d="M9.5 11.5c0-1.5 1.2-1.5 1.2-3s-1.2-1.5-1.2-3M14 11.5c0-1.5 1.2-1.5 1.2-3S14 7 14 5.5M18.5 11.5c0-1.5 1.2-1.5 1.2-3s-1.2-1.5-1.2-3" />
  </>),
  Free: (<>
    <rect {...sw} x="5" y="12" width="18" height="11" rx="1.5" />
    <rect {...sw} x="4" y="8.5" width="20" height="4" rx="1" />
    <path fill="none" stroke={ACC} strokeWidth="2.2" d="M14 8.5V23" />
    <path {...sa} d="M14 8.5c-1.8-3.6-6-4-6-1.4 0 1.4 2.2 1.4 6 1.4Zm0 0c1.8-3.6 6-4 6-1.4 0 1.4-2.2 1.4-6 1.4Z" />
  </>),
  CollegeArt: (<>
    <path {...sw} d="M14 4.5c-5.5 0-10 4-10 9 0 5 4.5 9.5 9.5 9.5 1.4 0 2-.9 2-1.9 0-1.1-.9-1.5-.9-2.6 0-1.1.9-2 2.2-2h2.4c2.6 0 4.8-2 4.8-4.6 0-4.4-4.5-7.4-10-7.4Z" />
    <circle cx="8.6" cy="13" r="1.5" fill={ACC} /><circle cx="11.3" cy="8.6" r="1.5" fill={INK} /><circle cx="16.5" cy="8.4" r="1.5" fill={ACC} /><circle cx="20.2" cy="11.6" r="1.5" fill={INK} />
  </>),
  Comedy: (<>
    <rect {...sw} x="11" y="5" width="6" height="11" rx="3" />
    <path {...sa} d="M11 8.5h6M11 11h6M11 13.5h6" />
    <path {...sw} d="M8.5 13a5.5 5.5 0 0 0 11 0M14 18.5V24M10.5 24h7" />
    <path {...sa} d="M3.5 6.5l1.5 1M4 4.5h2M22 5.5l1.5-1M23 7.5h2" />
    <text x="20.5" y="4.6" fontSize="4" fontWeight="800" fill={ACC} fontFamily="sans-serif">HA</text>
  </>),
  Sports: (<>
    <circle {...sw} cx="14" cy="14" r="9.5" />
    <path fill={ACC} d="M14 9.2l3.6 2.6-1.4 4.2h-4.4l-1.4-4.2L14 9.2Z" />
    <path {...sw} d="M14 9.2V4.5M17.6 11.8l4.4-1.6M16.2 16l2.7 3.8M11.8 16l-2.7 3.8M10.4 11.8 6 10.2" />
  </>),
  Tech: (<>
    <rect {...sw} x="4.5" y="6" width="19" height="13" rx="1.8" />
    <path {...sw} d="M2.5 22.5h23M11 19v3.5M17 19v3.5" />
    <path {...sa} d="M11.5 10.5 9 12.5l2.5 2M16.5 10.5l2.5 2-2.5 2M14.8 9.7l-1.6 5.6" />
  </>),
  Startup: (<>
    <path {...sw} d="M14 3.5c3.6 2.6 5.4 6.6 4.6 11.5l-2.1 3h-5L9.4 15C8.6 10.1 10.4 6.1 14 3.5Z" />
    <circle cx="14" cy="10.5" r="2" fill={ACC} />
    <path {...sw} d="M9.6 14.6 6.5 17.5l1.2 3.2 3.6-2.6M18.4 14.6l3.1 2.9-1.2 3.2-3.6-2.6" />
    <path {...sa} d="M12.5 20.5c-.3 1.8.3 3.2 1.5 4 1.2-.8 1.8-2.2 1.5-4" fill={ACC} fillOpacity=".25" />
  </>),
  Other: (<>
    <path {...sw} d="M14 4.5 20 24H8L14 4.5Z" />
    <path {...sw} d="M11.5 4.5h5" />
    <ellipse cx="14" cy="22.6" rx="7" ry="2" fill={ACC} fillOpacity=".3" stroke={ACC} strokeWidth="1.4" />
    <path fill={ACC} d="M14 13.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2Z" />
    <path {...sa} d="M5 9.5h2.4M6.2 8.3v2.4M21.6 7.5h2.4M22.8 6.3v2.4" />
  </>),
};

export default function CatIcon({ name, size = 34 }) {
  return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">{ICONS[name] || ICONS.Other}</svg>;
}
