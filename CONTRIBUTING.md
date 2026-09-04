# Contributing to Numi

Thanks for your interest in contributing! This project helps Numista collectors migrate their collections between accounts securely.

## How to Contribute

### Reporting Bugs

- Open an issue with:
  - What you expected to happen
  - What actually happened
  - A screenshot of the live logs (redact your API keys!)
  - Your browser and OS version

### Suggesting Features

- Open an issue tagged with `enhancement`.
- Examples of useful additions:
  - Support for wishlists migration.
  - CSV/Excel import mapping.
  - Pausing/Resuming long copy jobs.

### Submitting Code

This project has migrated from a Python CLI script to a modern web application (React/Vite).

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/my-improvement`)
3. **Make your changes** — please adhere to the existing pure grayscale, brutalist CSS design system in `src/index.css`.
4. **Test** your changes thoroughly against the Numista API in a local development environment.
5. **Submit a Pull Request** with a clear description of what changed and why.

### Code Style

- Use **TypeScript** strictly for all new logic.
- Avoid introducing external UI libraries (like Tailwind or Material UI). The design system is strictly vanilla CSS and should remain zero-dependency where possible.
- State management uses Zustand (`src/store`).

## Code of Conduct

Be respectful, constructive, and kind. We're all collectors here. 🪙
