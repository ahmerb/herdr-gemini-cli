# Contributing to herdr-gemini-cli

Thank you for your interest in contributing to `herdr-gemini-cli`!

This project provides an open-source integration between the [Herdr](https://herdr.dev) terminal multiplexer and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli).

---

## Code of Conduct

Please be respectful, collaborative, and constructive in all discussions, issues, and pull requests.

---

## Getting Started

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/herdr-gemini-cli.git
   cd herdr-gemini-cli
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Verify the development environment:**
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

4. **Link the extension locally into Gemini CLI:**
   ```bash
   gemini extensions link .
   ```

---

## Development Guidelines

- **Zero Runtime Dependencies:** Production code in `src/` must have zero runtime dependencies. Everything required at runtime must be bundled into `dist/` using `tsup`.
- **Fail-Safe Operation:** Hook handlers must never throw or exit with non-zero exit codes. Outside Herdr or on error, the dispatcher must always return `{}` on `stdout` and exit with code `0`.
- **Type Safety:** Ensure all changes pass `npm run typecheck` with strict TypeScript settings.
- **Automated Tests:** Add or update unit tests in `src/` and integration tests in `tests/`. All tests must pass via `npm test` before submitting.
- **Extension Validation:** Run `gemini extensions validate .` to ensure extension metadata and hook definitions comply with Gemini CLI schemas.

---

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`.
2. Commit your changes with clear, semantic commit messages (e.g. `feat:`, `fix:`, `test:`, `docs:`).
3. Ensure CI checks pass:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
4. Submit a Pull Request against the `main` branch with a description of your changes and any relevant test outputs.

---

## License

By contributing to `herdr-gemini-cli`, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
