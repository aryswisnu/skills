# Language and Runtime Support

Visual PR Review is implementation-language agnostic. Git supplies the textual and binary code diff, while the preview contract is an HTTP process, not a specific framework.

## Portable preview contract

A repository is supported when each revision can:

1. Be checked out by Git.
2. Run an optional non-interactive install command.
3. Start an HTTP preview with `startCommand`.
4. Accept `{port}`, `PORT`, or `VISUAL_REVIEW_PORT` so base and head can run simultaneously.
5. Render deterministic reviewer-selected routes in Chromium.

The CLI itself requires Node.js 20 or newer, Playwright, and Git. The application under review does not need to use JavaScript.

## Example commands

These are starting points. Use the repository's own reproducible commands rather than copying them blindly.

| Stack | `installCommand` | `startCommand` |
| --- | --- | --- |
| Static HTML | omitted | `python3 -m http.server {port} --bind 127.0.0.1` |
| Node.js | `npm ci` | `npm run dev -- --host 127.0.0.1 --port {port}` |
| Python, Django | `python -m pip install -r requirements.txt` | `python manage.py runserver 127.0.0.1:{port}` |
| Python, Flask | `python -m pip install -r requirements.txt` | `flask run --host 127.0.0.1 --port {port}` |
| Ruby on Rails | `bundle install` | `bin/rails server -b 127.0.0.1 -p {port}` |
| PHP, Laravel | `composer install --no-interaction` | `php artisan serve --host=127.0.0.1 --port={port}` |
| Go | `go mod download` | `go run ./cmd/web --port {port}` |
| Rust | `cargo fetch` | `cargo run -- --port {port}` |
| Java, Spring Boot | `./mvnw dependency:go-offline` | `./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port={port}` |
| .NET | `dotnet restore` | `dotnet run --urls http://127.0.0.1:{port}` |

Commands for Go, Rust, Java, and other compiled applications depend on each repository's flags. A tiny project-owned preview wrapper is acceptable when the application does not already accept a port.

## What is universal

- Changed-file discovery and binary-safe Git patches work regardless of programming language.
- Before, after, side-by-side, and pixel-diff images work for any browser-renderable application that satisfies the preview contract.
- The report and manifest format are independent of the application stack.

## What is not universal yet

- Native iOS and Android screens require a simulator-oriented capture adapter such as Maestro or Appium.
- Native desktop applications require a platform-specific launcher and capture adapter.
- APIs, CLIs, libraries, workers, and infrastructure changes have no honest screenshot unless they expose a purpose-built visual fixture.
- Language-aware semantic summaries require parser or language-server adapters. The current report preserves the Git patch and statistics but does not pretend to understand every language's semantics.

The extension point should therefore be **capture adapters by application surface**, not a hardcoded list of programming languages. That keeps the core generic and avoids turning framework detection into a vibes-based build system.
