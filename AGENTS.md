# Repository Guidelines

## Project Structure & Module Organization

This repository is a Shopify Liquid theme. `layout/` contains page shells; `templates/` defines page compositions; `sections/`, `blocks/`, and `snippets/` contain reusable storefront UI. `assets/` holds JavaScript, stylesheets, and media. `config/` contains theme settings, and `locales/` contains translations.

Tailwind v4 sources live in `src/tailwind/`: `index.css` imports component styles, `components/` holds CSS, and `pre-process-template/` supplies class safelists for dynamic Liquid values. The compiled stylesheet is `assets/theme.css`.

## Build, Test, and Development Commands

Install pnpm and Shopify CLI before development.

- `pnpm install`: Install dependencies using `pnpm-lock.yaml`.
- `pnpm tw:watch`: Rebuild Tailwind CSS as files change.
- `pnpm tw:build`: Compile CSS once.
- `pnpm dev`: Preview the configured development theme with theme editor synchronization. Run alongside the CSS watcher.
- `shopify theme check`: Validate Liquid and theme conventions.
- `pnpm push:dev` / `pnpm push:main`: Upload to the selected environment.
- `pnpm pull:dev` / `pnpm pull:main`: Download remote theme files. Review local changes and the target environment first; pulls can overwrite files.

## Coding Style & Naming Conventions

Follow surrounding code, generally using two-space indentation in Liquid, CSS, JavaScript, and JSON. Use descriptive kebab-case filenames, such as `featured-collection.liquid`, and camelCase JavaScript functions. Preserve existing Alpine component and script-loading patterns.

Edit Tailwind sources and rebuild `assets/theme.css`. Add safelist entries when introducing dynamically constructed utility classes. Keep merchant-facing strings in locale files and preserve existing setting IDs. No formatter or ESLint configuration is included.

## Testing Guidelines

No automated test suite, test naming convention, or coverage threshold is configured. For code changes, run `pnpm tw:build` and `shopify theme check`; record failures. Preview affected templates at mobile and desktop widths and verify relevant interactions and theme editor settings.

## Commit & Pull Request Guidelines

Before creating commits, read the [generate-commit-message skill](C:/Users/Administrator/.codex/skills/generate-commit-message/SKILL.md) and follow its instructions for inspecting intended changes and generating the message. Use `<action>(<target>): <short description>`, such as `fix(collection-filters): correct mobile filtering`. Keep commits focused. PRs should describe behavior changes, link relevant issues, list validation results, and include screenshots for visual changes.

## Configuration & Browser Automation

Keep credentials in ignored `shopify.theme.toml`; never commit tokens. Review generated template and settings changes before committing.

Use Chrome DevTools MCP for all Chrome tasks. Attach to existing sessions; never close, terminate, restart, or replace existing instances, windows, or tabs unless explicitly requested. If another automation browser is necessary, use an isolated profile.
