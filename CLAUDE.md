# Hex Flex - Project Guidelines

## Project Overview

Hex Flex is a web-based Intel HEX file viewer and comparator. Currently built with React/TypeScript/esbuild, it is being migrated to Blazor WebAssembly (see `docs/dev/BLAZOR_MIGRATION_PLAN.md`).

## Build & Run (Current React App)

```bash
npm run build                        # esbuild bundle to dist/
cp test_files/*.hex dist/            # make test files available
cd dist && uv run python -m http.server 4002 &   # serve locally
```

## Package Management Philosophy

**Use `uv` for ALL Python packages and tooling.** Python dependencies are declared in `pyproject.toml` so that `uv run python <script>` resolves them automatically — no `--with` flags needed.

**Use `dotnet` CLI / NuGet for .NET/Blazor packages.** This is the only exception to the uv rule — .NET has its own ecosystem.

**Packages are cheap to add and remove.** If a package helps, install it and add it to `pyproject.toml`. If it's no longer needed, remove it. Don't hesitate.

## Testing Strategy

### Principles
1. **Do not assume things work just because they're implemented.** Verify everything, including existing React behavior.
2. **Test each piece before moving to the next.** No phase is complete without passing tests.
3. **Validate against established reference tools, not our own code.** Use vetted libraries like Python `intelhex` as ground truth for parsing validation — not the React app.
4. **Use Playwright for all E2E/browser testing.** Run via `uv run python <script>` (playwright is a project dependency).
5. **Screenshots are assertions.** Playwright screenshots can be read by Claude's Read tool — use them to verify visual output.

### Test Output

All test artifacts (screenshots, JSON fixtures, reports) go in `test_output/`. This directory is gitignored. Clean it at the start of each test run.

### Running E2E Tests

```bash
# One-time setup
uv tool install playwright
playwright install chromium

# Run tests (dependencies resolved from pyproject.toml)
npm run build && cp test_files/*.hex dist/
cd dist && uv run python -m http.server 4002 &
PYTHONIOENCODING=utf-8 uv run python test_e2e.py
```

See `docs/dev/TESTING.md` for detailed test documentation.

### Test Files

Located in `test_files/`:
- `package_complete_123.hex` — ~1.8MB, 745.67 KB data, 3 segments (0x08000000, 0x08080000, 0x081FFC00)
- `package_complete_v142.hex` — ~1.9MB, 764.64 KB data, 3 segments

## Git Workflow

### Branching
- **`master`** — stable, production-ready code (current React app)
- **`branch/blazor-migration`** — all Blazor migration work happens here
- Never commit migration work directly to master

### Commit Practices
- Commit frequently — after each meaningful unit of work
- Commit messages should describe *what* and *why*
- Do NOT push until the user has confirmed a checkin (see Migration Plan)

### Checkins
The migration plan includes periodic human checkin points — one between each phase. At each checkin:
1. Summarize what was implemented since last checkin
2. List what is working and testable
3. List any known issues or deviations from plan
4. Wait for user confirmation before pushing or proceeding to the next phase

## Architecture Notes

### Current React App Structure
- **Services**: `hexParser.ts`, `sparseMemory.ts`, `memoryComparer.ts`, `fileValidator.ts`
- **Views**: `SingleFileView.tsx`, `ComparisonView.tsx`
- **Key Components**: `MemoryMap`, `ComparisonMap`, `VirtualizedHexView`, minimaps
- **Hooks**: `useHexFileParser`, `useHexFileComparison`, `useSegmentManager`
- **External deps**: React 19 (CDN), Tailwind CSS 4 (CDN), esbuild (dev)

### Core Logic (Most Critical to Migrate Correctly)
1. **Intel HEX parsing** (`hexParser.ts`) — Record types 0x00, 0x01, 0x02, 0x04, 0x05. Checksum validation.
2. **Sparse memory** (`sparseMemory.ts`) — 64KB block-based storage for non-contiguous data.
3. **Memory comparison** (`memoryComparer.ts`) — Byte-level diff: Modified/Added/Removed/Unchanged.
4. **Virtual row generation** — Gap collapsing, segment detection (1KB threshold).

### Known Bugs & Issues
See `docs/dev/BUGS.md` for tracked issues in the current React codebase.

## Windows Notes
- Set `PYTHONIOENCODING=utf-8` for Python scripts that print Unicode (segment labels contain arrows)
- Use forward slashes in paths within scripts
- Python HTTP server cleanup: `netstat -ano | grep :4002` then `taskkill //PID <pid> //F`
