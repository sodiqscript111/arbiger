# Arbiger

Arbiger is an intelligent incident management and root-cause analysis platform. Designed for modern engineering teams, Arbiger automatically aggregates error events into **Fingerprints**, monitors them for volume spikes or anomalous drift, and escalates them into **Incidents** when appropriate.

Using state-of-the-art AI, Arbiger generates highly accurate root-cause summaries and actionable remediation steps, drastically reducing Mean Time to Resolution (MTTR).

## Key Features

- **Event Aggregation**: Ingests high volumes of telemetry and error events, seamlessly grouping identical occurrences into distinct fingerprints.
- **Anomaly Detection**: Monitors fingerprint velocity using statistical models to detect sudden spikes and persistence drift.
- **AI Root Cause Analysis**: Leverages LLMs (OpenAI) to automatically diagnose incidents, providing engineers with immediate context and next steps.
- **Sleek Dashboard**: A beautiful, dark-themed React dashboard that surfaces critical insights instantly.

## Tech Stack

- **Backend**: [Bun](https://bun.sh/) + TypeScript
- **Database**: PostgreSQL (`postgres` driver)
- **Caching/Queues**: Redis (`ioredis`)
- **AI**: OpenAI API for incident diagnosis
- **Frontend**: React + Vite + Tailwind CSS v4 (`apps/dashboard`)
- **Documentation**: Mintlify (`docs/`)

## Project Structure

```
arbiger/
├── apps/
│   └── dashboard/    # React/Vite frontend application
├── docs/             # Mintlify documentation site
├── migrations/       # Database schema migrations
├── src/              # Backend service source code
│   ├── analysis/     # Anomaly detection & correlation jobs
│   ├── api/          # REST API router and handlers
│   ├── ingestion/    # Event ingestion and deduplication
│   ├── providers/    # Third-party integrations (e.g., OpenAI)
│   └── storage/      # Database and Redis repositories
├── package.json      # Backend dependencies and scripts
└── bun.lock          # Bun lockfile
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed locally
- [Node.js](https://nodejs.org/) & npm (for the frontend and docs)
- A running instance of PostgreSQL
- A running instance of Redis
- An OpenAI API key (optional, but required for AI features)

### 1. Backend Setup

Clone the repository and install the backend dependencies:

```bash
bun install
```

Set up your environment variables by creating a `.env` file in the root directory:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
# Ensure you also provide your database and redis connection strings as required by the storage layer
```

Run database migrations:

```bash
bun run migrate
```

Start the backend development server:

```bash
bun run dev
```

The API will run at `http://0.0.0.0:3000` (or your configured `PORT`).

### 2. Frontend Setup

In a new terminal, navigate to the dashboard app and install dependencies:

```bash
cd apps/dashboard
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

### 3. Documentation Setup

To view or edit the documentation locally, navigate to the docs folder:

```bash
cd docs
npx mintlify dev
```

The docs will be available at `http://localhost:3000`.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
