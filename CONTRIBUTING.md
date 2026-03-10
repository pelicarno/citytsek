# Contributing to CityTsek

Thanks for your interest in contributing! This project is open source and community contributions are welcome.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/citytsek.git
   cd citytsek
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Contribute

### Reporting Bugs

- Open an [issue](https://github.com/pelicarno/citytsek/issues) with a clear title and description.
- Include steps to reproduce the bug, expected behaviour, and actual behaviour.
- Add screenshots or console output if applicable.

### Suggesting Features

- Open an issue with the **enhancement** label.
- Describe the feature, why it would be useful, and any implementation ideas you have.

### Submitting Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes. Keep commits small and focused.
3. Make sure the project builds without errors:
   ```bash
   npm run build
   ```
4. Push your branch and open a Pull Request against `main`.
5. In the PR description, explain what the change does and link any related issues.

## Code Guidelines

- **TypeScript** — all code should be properly typed; avoid `any` where possible.
- **Formatting** — the project uses default Next.js/ESLint conventions. Run `npm run lint` before submitting.
- **Components** — keep components small and focused. Place shared components in `components/` and page-specific logic in `app/`.
- **No secrets** — never commit API keys, tokens, or credentials.

## Code of Conduct

Be respectful and constructive. We follow the spirit of the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/):

- Use welcoming and inclusive language.
- Be respectful of differing viewpoints and experiences.
- Accept constructive criticism gracefully.
- Focus on what is best for the community.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Questions?

Open an issue or start a discussion — we're happy to help.
