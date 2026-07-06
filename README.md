# PR Detective (Turing Test) Platform

A real-time, interactive coding event platform where participants analyze code snippets and guess whether they were written by a **Human** or an **AI**. The platform features live round control, automated AI scoring using Google Gemini, and a dynamic leaderboard.

## Features

- **Real-Time Multiplayer:** Built with Socket.IO for seamless synchronized event phases (Lobby, Question, Results).
- **Organizer Dashboard:** Full control over the event flow (Start, Pause, Next Question, Reset Round).
- **Question Management:** Easily add, edit, and delete PR questions from the dashboard.
- **AI-Powered Scoring:** Integrates with Google Gemini (`@google/genai`) to automatically evaluate and score the participants' reasoning from a student coding perspective.
- **Dynamic Leaderboard:** Auto-updates with base points (for correct Human/AI guesses) plus LLM-graded reasoning points.
- **CSV Export:** Download all participant responses and LLM feedback directly to CSV for post-event analysis.
- **Anti-Cheat Mechanics:** Designed for live events, preventing unauthorized tab switching and enforcing a strict timer.

## Tech Stack

- **Frontend:** Next.js (App Router), React, Framer Motion, CSS Modules (Custom styling with vibrant gradients)
- **Backend:** Node.js, Express, Socket.IO
- **Database:** MongoDB (Mongoose)
- **AI Integration:** Google Gemini 2.5 Flash

## Prerequisites

- Node.js (v18+ recommended)
- MongoDB (Local instance or MongoDB Atlas)
- Google Gemini API Key

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Turing_Test
   ```

2. **Backend Setup:**
   ```bash
   cd server
   npm install
   ```
   **For local development**, create a `.env` file in the `server` directory:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/turing-test
   ADMIN_PASSWORD=your_admin_password
   GEMINI_API_KEY=your_gemini_api_key
   ```
   *(Note: If deploying to a platform like Render or Railway, set these variables in your hosting dashboard instead of creating a `.env` file.)*

   *Optional:* Seed the database with sample questions:
   ```bash
   npm run seed
   ```

3. **Frontend Setup:**
   ```bash
   cd ../client
   npm install
   ```
   **For local development**, create a `.env.local` file in the `client` directory:
   ```env
   NEXT_PUBLIC_SERVER_URL=http://localhost:5000
   ```
   *(Note: If deploying to a platform like Vercel, set `NEXT_PUBLIC_SERVER_URL` in your Vercel project settings to your deployed backend URL. You do not need a `.env.local` file in production.)*

## Running the Application

Both the frontend and backend can be run simultaneously.

**Start the Backend:**
```bash
cd server
npm run dev
```

**Start the Frontend:**
```bash
cd client
npm run dev
```

- **Participant View:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin` (Login with your `ADMIN_PASSWORD`)

## Event Flow

1. **Lobby Phase:** Participants join via the Participant View, enter their team name and room number. They wait in the lobby until the organizer starts the round.
2. **Question Phase:** The admin starts the round. A code snippet is displayed. Participants must select 'Human' or 'AI', provide their confidence level, and write their reasoning.
3. **Result Phase:** When the timer runs out (or the admin skips), the correct answer is revealed on all screens along with the purpose and built-in reasoning of the question.
4. **Leaderboard:** The admin can generate scores at any time from the Leaderboard tab. Gemini will read all unscored reasoning and provide a score out of 10.



