# Bluecore DCTap Dancer 

[![Tests](https://github.com/thisismattmiller/dctap-dancer/actions/workflows/test.yml/badge.svg)](https://github.com/thisismattmiller/dctap-dancer/actions/workflows/test.yml)

A metadata application profile editor implementing the [DC TAP (Dublin Core Tabular Application Profile)](https://www.dublincore.org/specifications/dctap/) standard.

## Bluecore Changes
For Bluecore specific changes see: [Bluecore Changes](BLUECORE.md).

## Features

- **Workspace Management**: Create, duplicate, and delete workspaces
- **Spreadsheet-like Interface**: Edit metadata profiles in a familiar spreadsheet format
- **Shape Management**: Organize properties into shapes (entity types)
- **Namespace Prefixes**: Manage and auto-complete namespace prefixes
- **Import/Export**: Import from and export to CSV/TSV files
- **Validation**: Real-time validation with inline error display
- **Clipboard Support**: Copy, cut, and paste cells and ranges
- **Undo/Redo**: In-session undo/redo support
- **Concurrent Editing**: Polling-based updates for multi-tab usage

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, SQLite (better-sqlite3)
- **Frontend**: Vue 3 (Options API), Vite, TypeScript

## Project Structure

```
dctap-dancer/
├── backend/           # Express API server
│   ├── src/
│   │   ├── index.ts           # Server entry point
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic
│   │   │   ├── database.ts    # SQLite operations
│   │   │   ├── validation.ts  # DCTap validation
│   │   │   └── csv-parser.ts  # Import/export logic
│   │   ├── middleware/        # Error handling
│   │   └── types/             # TypeScript types
│   └── data/                  # SQLite database files
│
├── frontend/          # Vue 3 SPA
│   ├── src/
│   │   ├── views/             # Page components
│   │   ├── components/        # Reusable components
│   │   │   └── spreadsheet/   # Spreadsheet editor
│   │   ├── services/          # API client
│   │   └── types/             # TypeScript types
│   └── index.html
│
└── package.json       # Monorepo workspace config
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development servers (backend + frontend)
npm run dev
```

The frontend will be available at http://localhost:5173
The backend API will be at http://localhost:3000

### Individual Commands

```bash
# Run backend only
npm run dev:backend

# Run frontend only
npm run dev:frontend

# Build frontend for production
npm run build

# Start production backend
npm run start
```

## DC TAP Column Reference

| Column | Description |
|--------|-------------|
| shapeLabel | Human-readable name for the shape |
| propertyID | IRI/CURIE of the vocabulary term (e.g., `dcterms:title`) - **Required** |
| propertyLabel | Human-friendly display name |
| mandatory | Boolean: is this property required? |
| repeatable | Boolean: can this property appear multiple times? |
| valueNodeType | RDF node type: `IRI`, `literal`, or `bnode` |
| valueDataType | XSD datatype (e.g., `xsd:string`) - only for literals |
| valueShape | Reference to another shape - only for IRI/bnode |
| valueConstraint | Constraint value(s) |
| valueConstraintType | Type: `picklist`, `IRIstem`, `pattern`, etc. |
| note | Explanatory text |

## API Endpoints

### Workspaces
- `GET /api/workspaces` - List all workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces/:id` - Get workspace
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace
- `POST /api/workspaces/:id/duplicate` - Duplicate workspace

### Shapes
- `GET /api/workspaces/:id/shapes` - List shapes
- `POST /api/workspaces/:id/shapes` - Create shape
- `GET /api/workspaces/:id/shapes/:shapeId` - Get shape
- `PUT /api/workspaces/:id/shapes/:shapeId` - Update shape
- `DELETE /api/workspaces/:id/shapes/:shapeId` - Delete shape

### Rows
- `GET /api/workspaces/:id/shapes/:shapeId/rows` - List rows
- `POST /api/workspaces/:id/shapes/:shapeId/rows` - Create row
- `PUT /api/workspaces/:id/shapes/:shapeId/rows/:rowId` - Update row
- `PUT /api/workspaces/:id/shapes/:shapeId/rows` - Bulk update
- `DELETE /api/workspaces/:id/shapes/:shapeId/rows/:rowId` - Delete row

### Namespaces
- `GET /api/workspaces/:id/namespaces` - List namespaces
- `POST /api/workspaces/:id/namespaces` - Create namespace
- `PUT /api/workspaces/:id/namespaces/:prefix` - Update namespace
- `DELETE /api/workspaces/:id/namespaces/:prefix` - Delete namespace

### Folders
- `GET /api/workspaces/:id/folders` - List folders
- `POST /api/workspaces/:id/folders` - Create folder
- `PUT /api/workspaces/:id/folders/:folderId` - Update folder
- `DELETE /api/workspaces/:id/folders/:folderId` - Delete folder

### Import/Export
- `POST /api/import` - Import CSV/TSV file
- `GET /api/workspaces/:id/export?format=csv|tsv` - Export workspace

### Marva Profile Export
- `GET /api/marva-profile/export/:id` - Download Marva/Sinopia profile JSON

### LC Starting Points
- `POST /api/starting-point/import/:id` - Import LC Starting Point JSON
- `GET /api/starting-point/export/:id` - Download Starting Points JSON
- `GET /api/starting-point/has/:id` - Check if workspace has starting points

### Serve Endpoints (with caching)
- `GET /api/serve/workspaces` - List workspaces with URLs to all export formats
- `GET /api/serve/:id/profile` - Serve Marva profile JSON (cached)
- `GET /api/serve/:id/starting-points` - Serve Starting Points JSON (cached)
- `GET /api/serve/:id/csv` - Serve CSV export (cached)
- `GET /api/serve/:id/tsv` - Serve TSV export (cached)
- `GET /api/serve/cache/stats` - Cache statistics (debug)

### Health
- `GET /api/health` - Health check endpoint

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow keys | Navigate cells |
| Enter | Edit cell |
| Escape | Cancel editing |
| Tab | Move to next cell |
| Shift+Tab | Move to previous cell |
| Delete/Backspace | Clear selection |
| Ctrl/Cmd+C | Copy |
| Ctrl/Cmd+X | Cut |
| Ctrl/Cmd+V | Paste |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |

## Docker

Build and run the full application (frontend + backend) in a single container:

```bash
# Build image
docker build -t dctap-dancer .

# Run container
docker run -d --name dctap -p 3000:3000 -v dctap-data:/app/data dctap-dancer

# Access at http://localhost:3000
```

The `-v dctap-data:/app/data` flag persists the SQLite databases between container restarts.

## Locked Workspaces

Workspaces can be marked as read-only ("locked") to prevent modifications. Locked workspaces can still be viewed and duplicated, but cannot be edited or deleted. This is useful for public deployments where certain workspaces should remain stable as reference templates.

Locked workspaces are configured via a local `locked-workspaces.json` file (not tracked in git). Use the CLI tool to manage them:

```bash
# List all workspaces with lock status
npm run lock-workspace --workspace=backend list

# Lock a workspace by name or ID
npm run lock-workspace --workspace=backend lock "My Workspace"

# Unlock a workspace
npm run lock-workspace --workspace=backend unlock "My Workspace"

# Show current locked-workspaces.json config
npm run lock-workspace --workspace=backend show
```

**In Docker:** Run commands directly without the workspace flag (the container only has the backend):

```bash
npm run lock-workspace list
# or
node dist/cli/lock-workspace.js list
```

## Testing

```bash
# Run backend tests
cd backend && npm test

# Run tests in watch mode
cd backend && npm run test:watch
```

## License

Creative Commons Zero v1.0 Universal
