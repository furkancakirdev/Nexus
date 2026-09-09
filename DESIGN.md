# Marlin Nexus UI Design Context

## Product stance

Marlin Nexus is an evidence-first management control center. The first viewport must answer three questions quickly: what is healthy, what is blocked or under review, and what action is next. Financial values are never made more certain by presentation; missing cost or exchange-rate evidence stays `—` or `İnceleme gerekli`.

## Visual direction

- Dark-first "Nautical Slate" control room: `#0F172A` background with Ocean Blue `#0284C7` and Teal `#0D9488` actions and chart accents.
- Slate surfaces use clear borders and restrained shadows; glow and decorative gradients are not part of the system.
- Amber means review, red means error, green means verified, and read-only source state is always labelled in text as well as color.
- Typography uses the local `Source Sans 3` family when installed, then `Segoe UI` and the system UI stack. Runtime does not depend on a remote font request.
- The signature element is the five-second executive summary: trust strip, compact KPI row, action queue, and one annotated trend surface.

## Runtime token mapping

`src/styles.css` owns global color, typography, spacing, surface, chart, focus, dark-theme, high-contrast, and reduced-motion tokens. `src/components/layout/NexusShell.css` owns only navigation-shell geometry and shell-specific surface tokens. Shared UI primitives consume the global tokens; page components do not introduce parallel financial colors.

Primary dark tokens: `#0f172a` canvas, `#111c2b` surface, `#e2e8f0` ink, `#0284c7` Ocean Blue, `#0d9488` Teal, `#15803d` verified, `#b45309` review, `#b42318` error. Light-theme tokens remain available as an explicit user override.

## Behavioral contracts

- Navigation is capability-filtered and direct routes fall back to the first accessible page; a session with no accessible module fails closed without rendering financial data.
- CPM is read-only. The shell displays source, update, and read-only status in the context bar.
- Charts have visible text legends and a table alternative. Responsive containers use `min-width: 0`; document overflow is suppressed on narrow viewports while table surfaces retain intentional horizontal scrolling.
- Theme, high contrast, and reduced motion are user-controlled and available from the shell on desktop and mobile.
- Native selects remain platform-owned controls for reliable keyboard and mobile behavior. The login form owns validation and uses `noValidate` with inline error text.

## Verification expectations

Run `npm test` and `npm run build` after UI changes. Check desktop and narrow layouts, light/dark themes, high contrast, reduced motion, loading/error/empty states, capability boundaries, and evidence-gated financial values. Browser screenshots are preferred when a Browser/Playwright runtime is available.
