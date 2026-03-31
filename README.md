# Turing Test — PR Detective

A real-time multiplayer game where teams analyze Pull Requests and guess whether the code was written by a **Human** or **AI**. Scores are calculated automatically using Google Gemini.

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js 16, React 19, Socket.io     |
| Backend   | Express 5, Socket.io, Mongoose      |
| Database  | MongoDB Atlas                       |
| AI Scoring| Google Gemini (2.0 Flash / 1.5 Flash) |

## Project Structure

```
Turing_Test/
├── client/          # Next.js frontend
│   ├── src/app/     # Pages (home, join, quiz, admin)
│   └── src/context/ # Socket & Team providers
├── server/          # Express + Socket.io backend
│   ├── models/      # Mongoose schemas
│   ├── server.js    # Main server entry point
│   └── seed.js      # Database seeder
└── package.json     # Root scripts (dev:client, dev:server)
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Google Gemini API key

### 1. Clone & Install

```bash
git clone <repo-url>
cd Turing_Test
npm run install:all
```

### 2. Configure Environment Variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and fill in:

| Variable        | Description                                |
|-----------------|--------------------------------------------|
| `PORT`          | Server port (default: `5000`)              |
| `MONGODB_URI`   | MongoDB Atlas connection string            |
| `ADMIN_PASSWORD` | Password for the organizer dashboard      |
| `GEMINI_API_KEY` | Google Gemini API key for AI scoring      |
| `FRONTEND_URL`  | Deployed frontend URL (for CORS)           |

For the client, create `client/.env.local`:
```
NEXT_PUBLIC_SERVER_URL=http://localhost:5000
```

### 3. Seed the Database (Optional)

```bash
cd server
npm run seed
```

### 4. Run Locally

```bash
# From root directory — starts both client and server
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000
- **Admin Panel**: http://localhost:3000/admin

## Deployment

### Frontend (Vercel)
1. Import the `client/` directory as a Vercel project
2. Set `NEXT_PUBLIC_SERVER_URL` to your backend URL in Vercel env vars

### Backend (Render / Railway / etc.)
1. Deploy the `server/` directory
2. Set all environment variables from `.env.example`
3. Start command: `npm start`

## Game Flow

1. **Lobby** — Teams join via the `/join` page
2. **Admin starts** — Organizer starts the round from `/admin`
3. **Question phase** — Teams see a code snippet and select Human or AI
4. **Result phase** — Correct answer is revealed with reasoning
5. **Repeat** — Admin advances to the next question
6. **Finished** — Leaderboard is calculated using base score + AI-graded reasoning

## API Endpoints

| Method | Endpoint              | Auth   | Description                    |
|--------|-----------------------|--------|--------------------------------|
| GET    | `/api/questions`      | —      | List all questions             |
| POST   | `/api/questions`      | Admin  | Add a new question             |
| DELETE | `/api/questions/:id`  | Admin  | Delete a question              |
| GET    | `/api/results`        | Admin  | Get all responses              |
| POST   | `/api/score-responses`| Admin  | Trigger AI scoring             |
| GET    | `/api/leaderboard`    | —      | Get ranked leaderboard         |
| GET    | `/api/export-csv`     | Admin  | Export responses as CSV        |
| GET    | `/api/export-llm-csv` | Admin  | Export AI feedback as CSV      |
| GET    | `/api/health`         | —      | Health check                   |
