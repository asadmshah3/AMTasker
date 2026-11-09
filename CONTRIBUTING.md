# Contributing to AMTasker

Thanks for your interest. Bug reports, ideas and pull requests are welcome.

## Getting set up

```sh
pnpm install
pnpm dev        # http://localhost:3000
```

Before you open a pull request, run everything CI runs:

```sh
pnpm check      # format check, typecheck, lint, tests and build
```

`pnpm format` fixes formatting.

## How the code is organised

- **`lib/model/`**: data types (`types.ts`) and zod schemas (`schema.ts`). Stored data and backups are validated
  against these schemas when they are read.
- **`lib/data/`**: persistence. `repository.ts` is the interface and `idb-repository.ts` the IndexedDB implementation;
  `backup.ts` handles JSON/CSV import and export.
- **`lib/domain/`**: pure logic with no React and no storage (timelines, totals, planning, stats). This is where most
  unit tests live.
- **`lib/use-app-data.ts`**: the single React hook that owns the app state and writes through the repository.
- **`components/`**: UI. `app-shell.tsx` is the page; each tab and panel has its own file.

## Coding guidelines

### General

- TypeScript in strict mode. Avoid `any`; model data with types from `lib/model/types.ts`.
- Keep logic out of components when you can: put it in `lib/domain/` as a pure function and test it there.
- Prefer small, named functions over long inline expressions. Name things for what they mean
  (`loggedMinutesOnDay`, not `calc2`).
- Comment the _why_, not the _what_. A short doc comment on exported functions is welcome.
- No dead code, commented-out code or `console.log` in commits.

### Style

- Formatting is Prettier's job (`.prettierrc.json`: no semicolons, double quotes, 120 columns). Don't hand-format.
- Files and folders are `kebab-case`; React components are `PascalCase`; functions and variables are `camelCase`;
  constants that act as configuration are `UPPER_SNAKE_CASE`.
- Use Tailwind utility classes and the theme tokens from `app/globals.css` (`bg-card`, `text-muted-foreground`,
  `border-border`, …) instead of hard-coded colours, so light/dark mode and the colour themes keep working.

### Data and storage

- Everything stays in the browser. Don't add network calls, analytics or trackers.
- Never silently drop user data. If you change the stored data model, raise `SCHEMA_VERSION` (and the IndexedDB
  `DB_VERSION` if you add a store) and add a migration for existing data and backups.
- Prefer archiving over deleting; anything that deletes history must ask for confirmation.

### Dates and times

- Dates are local `YYYY-MM-DD` keys (`DateKey`); timestamps are ISO strings.
- Place times on a day by the wall clock (`minuteIn` in `lib/domain/timesheet.ts`), never by "milliseconds since
  midnight", so days with a daylight-saving change work.

### Accessibility

- Never convey state by colour alone: pair it with a symbol or text (✓, ½, ✗, ▶, ■, "Stopped").
- Every icon-only button needs an `aria-label`. Check your change in light and dark mode and at phone width.

### Tests

- Add or update Vitest tests (`*.test.ts` next to the code) for any change in `lib/`.
- Tests must not depend on the time zone or the current date: pass dates in explicitly.

## Commits and pull requests

- One topic per pull request, with a short description of what changed and why. Screenshots help for UI changes.
- Write commit messages in the imperative mood: "Add weekly totals to the Logger", not "Added …".
- CI must pass.
