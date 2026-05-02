# PRD: smuseats

## Overview
A React + TypeScript SPA for SMU (Singapore Management University) students to browse classroom floor plans, click their seats, and share a URL so friends know where they're sitting. Seat selections are URL-encoded (lz-string compressed), making links fully self-contained with no backend. Deployed as a static site on Vercel.

## Goals
- Display interactive floor plan images for SMU rooms
- Allow students to click seats on a floor plan and copy a shareable link
- Filter rooms by building, floor, and type
- Encode seat selections in URL for zero-backend sharing
- Seat editor for contributors to add/update seat coordinates

## Non-Goals
- Real-time seat reservation (no backend, no database)
- Authentication
- SMU official integration or live classroom data
- Mobile app

## User Stories
- As a student, I want to tell my friend "I'm in seat 12 in LKCSB 4.07" by sharing a link.
- As a student, I want to filter rooms by building and floor quickly.
- As a contributor, I want to add seat coordinates for a new classroom.

## Tech Stack
- **Language**: TypeScript / React
- **Build**: Vite
- **Styling**: Tailwind CSS
- **Compression**: `lz-string` (URL state compression)
- **OCR**: `eng.traineddata` (Tesseract.js — for reading room labels from images?)
- **Deployment**: Vercel

## Architecture
```
smuseats/
├── src/              # React app source
├── public/           # Static assets
├── floorplan/        # Floor plan images
├── registry.json     # Single source of truth: room image paths, dimensions, seat coords
├── design.md         # Architecture design decisions
├── bugfix.md         # Bug fix documentation
├── postcss.config.js
└── eslint.config.js
```

**Routes:**
| Route | Purpose |
|-------|---------|
| `/` | Landing page — hero, how-it-works, building shortcuts |
| `/rooms` | Filterable room browser (building → floor → type) |
| `/room/:roomId` | Interactive seat map — click seats, zoom/pan, share link |
| `/edit` | Contributor seat editor (enabled in dev or with `VITE_ENABLE_EDITOR=true`) |
| `/compare` | Image enhancement method comparison sandbox |

**State:**
- Seat selections: compressed into URL via `lz-string` (no server state)
- Room registry: `registry.json` — image path, dimensions, seat coordinates per room

## Features (detailed)

### Interactive Seat Map
- Renders floor plan image with SVG overlay for seats
- Click seat → toggle selection
- Zoom/pan support
- Copy sharable URL encoding current selections

### URL-Encoded State
- `lz-string` compresses seat selection JSON into URL query param
- Self-contained links — recipient opens URL and sees same selections
- Max encoded-length threshold with UI warning if exceeded (design.md A2)

### Room Browser
- Filter by building → floor → room type
- Shareable query param state for filtered view

### Contributor Editor (`/edit`)
- Add, move, delete, renumber seats on floor plan images
- Export edited seat data as JSON download
- Gated by `VITE_ENABLE_EDITOR=true` env var (disabled in production)

## Data / Config
| File | Description |
|------|-------------|
| `registry.json` | Room metadata: id, image path, dimensions, seat coordinates |
| `VITE_ENABLE_EDITOR` | Env var — enable contributor editor in production |

## Deployment / Run
```bash
npm install
npm run dev
# Editor mode:
VITE_ENABLE_EDITOR=true npm run dev
```

## Constraints & Notes
- **No backend**: all state is in the URL — no persistence beyond sharing the link
- **lz-string URL size**: very large selections may exceed URL length limits in some browsers; handled via A2 safeguard (design.md)
- **Floor plans**: images must be added manually to `floorplan/`; seat coordinates manually mapped in `registry.json`
- **SMU-specific**: floor plans, room IDs, and building names are specific to SMU campus
