/**
 * iconAtlas.ts — Inline SVG icons per node type.
 *
 * Deck.gl's IconLayer auto-atlas mode: `getIcon` returns an object with a
 * URL (here a data URI) and deck.gl builds the atlas internally, caching by URL.
 * `mask: true` uses the texture's red channel as alpha so `getColor` tints the icon.
 */
import type { NodeType } from '@/engine/types';

// All icons are 32×32 white shapes on transparent background.
// Black fills create holes/details — with mask:true they become transparent.
const SVGS: Record<NodeType, string> = {

  person: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="11" fill="white"/>
  </svg>`,

  event: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <polygon points="16,5 18.6,12.4 26.5,12.6 20.3,17.4 22.5,24.9 16,20.5 9.5,24.9 11.7,17.4 5.5,12.6 13.4,12.4" fill="white"/>
  </svg>`,

  period: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect x="2" y="11" width="28" height="10" rx="2" fill="white"/>
  </svg>`,

  place: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M16,3 C9.9,3 5,7.9 5,14 C5,20.6 16,29 16,29 C16,29 27,20.6 27,14 C27,7.9 22.1,3 16,3Z" fill="white"/>
    <circle cx="16" cy="14" r="4.5" fill="black"/>
  </svg>`,

  work: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M16,8 Q12,4 4,5 L4,26 Q12,25 16,28 Q20,25 28,26 L28,5 Q20,4 16,8Z" fill="white"/>
    <line x1="16" y1="8" x2="16" y2="28" stroke="black" stroke-width="2"/>
  </svg>`,

  concept: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <polygon points="28,16 22,26.4 10,26.4 4,16 10,5.6 22,5.6" fill="white"/>
  </svg>`,

  institution: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <polygon points="16,4 28,11 4,11" fill="white"/>
    <rect x="4"  y="24" width="24" height="4" fill="white"/>
    <rect x="6"  y="11" width="4"  height="13" fill="white"/>
    <rect x="14" y="11" width="4"  height="13" fill="white"/>
    <rect x="22" y="11" width="4"  height="13" fill="white"/>
  </svg>`,

  technology: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="8"  fill="white"/>
    <circle cx="16" cy="16" r="3"  fill="black"/>
    <rect x="14" y="2"  width="4" height="7" rx="1.5" fill="white"/>
    <rect x="14" y="23" width="4" height="7" rx="1.5" fill="white"/>
    <rect x="2"  y="14" width="7" height="4" rx="1.5" fill="white"/>
    <rect x="23" y="14" width="7" height="4" rx="1.5" fill="white"/>
  </svg>`,

  route: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <path d="M5,24 Q7,8 22,14" stroke="white" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <polygon points="22,14 14,10 15,17" fill="white"/>
  </svg>`,

  phenomenon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="12" fill="none" stroke="white" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="7"  fill="none" stroke="white" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="2.5" fill="white"/>
  </svg>`,

  dataset: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect x="3"  y="3"  width="11" height="11" rx="1.5" fill="white"/>
    <rect x="18" y="3"  width="11" height="11" rx="1.5" fill="white"/>
    <rect x="3"  y="18" width="11" height="11" rx="1.5" fill="white"/>
    <rect x="18" y="18" width="11" height="11" rx="1.5" fill="white"/>
  </svg>`,
};

// Encode to data URLs once at module load
export const ICON_URLS = Object.fromEntries(
  Object.entries(SVGS).map(([type, svg]) => [
    type,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ' '))}`,
  ]),
) as Record<NodeType, string>;
