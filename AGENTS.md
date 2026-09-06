# AI Coding Guidelines

When working on this repository, please adhere to the following guidelines:

## Project Configuration
- This file (`AGENTS.md`) is the primary instruction file for Gemini CLI in this project, as configured in `.gemini/settings.json`.
- The following tools are allowed to run without manual confirmation:
  - Git commands (`status`, `log`, `diff`, `show`, `add`, `commit`, `push`, etc.). Note: force pushes (`-f`, `--force`) always require manual confirmation.
  - Common bash commands (`ls`, `grep`, `cat`, `head`, etc.).
  - File editing tools (`write_file`, `replace`).
- **Git Workflow:** If you are on the `master` branch and need to make changes, you MUST create a new branch before committing those changes. After committing and pushing to the new branch, if there is no pull request, you MUST create one. If a pull request was already opened by you and is still not merged, you MUST continue work in that same pull request instead of opening a new one.

## General
- Use strict TypeScript.
- Always use `yarn` for package management and running scripts; never use `npm`.
- Prefer using `interfaces` and `type` aliases (or `structs` in Go) over `classes`.
- Minimize the use of third-party libraries. Stick to native APIs or lightweight, well-known libraries when necessary.
- **Do not touch any code in the `money_flow` directory.**
- **Always run `yarn type-check` and `yarn lint` to ensure there are no errors before committing any code.**

## Error Handling
- Use the `ts-error-as-value` library for error handling in TypeScript.
- Import the globals to convert functions that can throw exceptions to functions that return errors: `import "ts-error-as-value/lib/globals"`.
- Handle all errors in a Go-style manner (checking for `error` objects rather than using `try/catch` blocks).
- Always add context to errors when returning them. For example:
  ```typescript
  return err(new AggregateError([response.error], "failed to make request to proxy"));
  ```

## UI/State
- Use React for the UI.
- Use MobX for state management.
- **MobX Async Actions**: When updating MobX observables after an `await` in an asynchronous function, you MUST wrap the state updates in `runInAction(() => { ... })`. Failure to do so will cause MobX strict mode errors.
- **Component Architecture**: The UI is modularized (e.g., `transactions_view.tsx`, `settings_view.tsx`, etc.). When creating new features, extract them into separate files. For modal dialogues, conditionally render them in their parent components (e.g., `{store.isModalOpen && <Modal />}`) to ensure they unmount when closed, preventing stale local state issues without needing `useEffect`.
- **Authentication State**: Tinkoff authorization logic is managed by its own `authStore` (`web_src/auth_store.ts`). Use `authStore.startLogin()` to initiate the flow, which conditionally renders `TinkoffLoginDialog`.

## PWA & Offline Support
- **Service Worker (`web_src/sw.ts`)**:
  - **Pre-caching**: On `install`, pre-caches core static assets (manifest, icons, `./index.html`) and the background worker (`__WORKER_URL__`), then parses `index.html` to discover and pre-cache hashed JS and CSS bundles.
  - **Navigation Fallback**: Navigation requests (HTML documents, shortcut URLs, deep routes) use a Network-First strategy with fallback to cached `./index.html` so the app always opens offline.
  - **Permanent Cache-First**: All static assets (same-origin JS/CSS/icons/workers and external fonts from `fonts.googleapis.com` / `fonts.gstatic.com`) use a permanent Cache-First strategy to avoid redundant network requests once cached.
  - **API Passthrough**: Network APIs (`www.googleapis.com`, `accounts.google.com`, `tinkoff.ru`, `/proxy`) must be excluded from Service Worker caching.
  - **Theme & Splash Screen**: PWA `background_color` and `theme_color` in `app.webmanifest`, HTML meta tags (`theme-color`, `color-scheme`), and critical inline `<style>` in `index.html` must remain in sync with `--bg-color` (`#0f172a`) to prevent white flashes during app launch.

## Go/Serverless
- Serverless functions are written in Go.
- Handle errors idiomatically in Go, returning errors with appropriate context.

## Google Drive API Integration
- **Eventual Consistency**: Google Drive search indexes have eventual consistency delays. Files created via API might not immediately appear in `listFiles` search results. Implement polling or retries when verifying creation of files (e.g. locks) using search.
- **Clock Skew**: When implementing file staleness checks (like lock expiration) using `Date.now()` against Google Drive's `createdTime` (server time), be aware that local device clock skew can cause locks to falsely expire too early or never expire.
- **Metadata**: Prefer using `appProperties` to store small bits of application-specific metadata on files instead of writing to the file content. 
  - `appProperties` must be requested explicitly via the `fields` query parameter (e.g. `fields=files(id,name,appProperties)`).
  - Property keys and values must be strings.
- **Synchronization Locking**: When acquiring locks on Google Drive, use an optimistic approach: create the lock immediately without pre-checking, and rely on eventual consistency polling and server-side `createdTime` to gracefully resolve collisions. The winner should NOT aggressively delete active competitors' locks; losers must discover they lost and delete their own locks.
- **Local Cross-Tab Locking**: Use the browser's native `navigator.locks` API to ensure that multiple tabs from the same device do not concurrently perform sync operations.

## Design System
- Use the Vanilla CSS defined in `web_src/index.css`.
- Rely on defined CSS variables (`--bg-color`, `--accent-color`, etc.) and semantic classes (`.btn`, `.form-input`, `.modal-overlay`, `.app-container`) instead of Tailwind or inline styles.
- Maintain the glassmorphism aesthetic and rich modern typography.

## Post-Iteration Workflow
After each iteration of code changes, you MUST always perform the following steps:
- **Verify**: Always run full type checking and linting (`yarn type-check` and `yarn lint`) to ensure zero errors or warnings before committing.
- **Update Documentation**: Synchronize and update documentation (`README.md`, `AGENTS.md`, etc.) to reflect any changes in architecture, workflows, scripts, or APIs.
- **Conventional Commits**: Format commit messages using conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`) with clear, descriptive summaries.
- **Git & PR Workflow**: If on `master`, branch out before committing. Push the branch and create or update a Pull Request via `vcscli`.

## Autonomous Agent & Telegram Directives
When operating as Anton via Telegram within this workspace:
- **Parsing & Identification Errors**: If a message fails to parse or cannot be identified, NEVER search the codebase or debug source files. Concisely inform the user that a message processing/parsing error occurred.
- **Service & Technical Messages**: System/service messages (chat photo updates, pins, topic actions, member events) are logged but must NEVER trigger actions or codebase modifications.
- **Concise Markdown & File Links**: Keep Telegram responses concise, clear, and formatted in GitHub-Flavored Markdown. Always create clickable links with the `file://` scheme for all files and code symbols (e.g. `[Component](file:///path/to/component.tsx)`).
- **Embedded Media & UI Artifacts**: When referring to UI screenshots, mockups, or local media assets, use standard Markdown image syntax (`![description](path/to/image.png)`). Anton's rich media pipeline automatically resolves and displays them.

## Architecture & Code Organization
- **Separation of Concerns**: Keep domain models (`web_src/domain`), infrastructure/storage (`web_src/infrastructure`, IndexedDB, Google Drive sync), and UI presentation (`web_src/`) cleanly decoupled.
- **Pure Helpers**: Extract complex computational or transformation logic into pure, stateless helper functions to enable isolated, deterministic testing.
- **Offline-First & Local Source of Truth**: IndexedDB is the primary source of truth on the client. Remote synchronizations (Google Drive) must handle eventual consistency, offline states, and concurrent tabs safely without corrupting local data.


@telegram_agent_context.md
