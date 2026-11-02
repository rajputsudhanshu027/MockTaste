# MockTaste

A local English practice tool for RRB NTPC Undergraduate CBT-1. It creates topic tests, weekly tests, and full mocks from your selected study material, approved online pages, and labelled past-paper questions.

## Run

Requirements: Node.js 22 or newer, Poppler utilities (`pdfinfo`, `pdftotext`, `pdftoppm`, `pdftohtml`), and `unzip`. Install the Node dependencies once, then start the app.

```bash
rtk npm install
rtk npm run start
```

Open `http://127.0.0.1:4173`. The owner dashboard binds only to this computer. A separate student-only server listens on port `4174` for friend exam links. Files, tests, and reports are stored in `data/` on this PC, which is excluded from version control.

Connect your ChatGPT Plus account in **Settings** before reading scanned pages or generating questions. This uses [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart) for eligible plan-backed requests, with no separate paid API key. The app stops generation when plan usage is unavailable. Only selected study text/images are sent for AI requests; saved history stays local. ChatGPT sign-in and AI generation require internet, while prepared tests and answer review work offline as long as the local server is running.

## Workflow

1. In **Create a test**, upload a PDF, DOCX, or ordered image group. The app reads the complete document and identifies its supported topics automatically. Unreadable or complex pages are listed. Use **Study library** to change the range or correct extracted text.
2. The default **Document test** shows the topics found in your notes. Set the question count and time; you do not need to enter a subject or topic. Questions are based on the selected notes, with supporting evidence and checked worked solutions. Weekly and full mock formats remain available; for a weekly test, first mark studied topics in **Dashboard → Plan this week**.
3. The app finds approved factual sources and English Undergraduate past papers online while generating. Third-party papers retain their provenance labels. Only independently checked Mathematics and Reasoning paper questions enter the scored pool until factual answer verification is available.
4. Generate the test. A weekly test defaults to 30 questions in 27 minutes; a CBT-1 full mock requires 100 questions in 90 minutes. The app scales down and relabels a test when there is not enough defensible material.
   If ChatGPT usage stops generation, checked questions are saved under **Results → Saved generation progress**. Resume there when usage is available again.
5. Take the test and review answers, sources, section results, and weak topics. Flag bad questions to exclude them from the score. Missed questions from the previous weekly test appear as separate untimed retries.

To give a friend an exam, open **My tests** and choose **Create friend link**. The app starts a secure temporary connection automatically, then shows a link to copy and send. Your PC serves the paper; the friend sees only a submission confirmation. Their private report appears under **Sharing & reports → Reports received**. Review answers and weak topics, optionally add advice, then choose **Download PDF report**. The download saves your latest advice and includes the score, section and topic results, and complete answer review. Send the PDF file to your friend; it can be read offline. Exam links can be revoked and work only while this PC is on and the app is running.

The app opens a temporary HTTPS tunnel automatically when you create a friend link. This needs `cloudflared` installed and an internet connection. The tunnel relays friend exam and report traffic through Cloudflare; tests and reports remain in `data/` on your PC. The owner dashboard remains on `127.0.0.1:4173` and is never sent through the tunnel. Keep the app open until your friend submits. You can instead use your own HTTPS reverse proxy and enter its address in **For friends**. Do not forward port `4173`.

See [the product brief](docs/product-brief.md) for the agreed behavior and [the decisions](docs/adr/) for the source and data rules.

## Data and configuration

- `PORT` changes the local port (default `4173`).
- `FRIEND_PORT` changes the student-only port (default `4174`). `FRIEND_BIND` changes its bind address (default `0.0.0.0`).
- `FRIEND_BASE_URL` can set the initial reachable address for links. You can also change it in **For friends**.
- `RRB_DATA_DIR` changes the local storage folder (default `data/`).
- **Settings → Export study history** downloads a JSON export of plans, sources, tests, and scores. Uploaded binary files are not included.
- Delete material, source pages, and tests from the app when no longer needed.

The app uses the official RRB CBT-1 section counts and negative marking from the [Undergraduate notice](https://www.rrbcdg.gov.in/uploads/2025/07-NTPCUG/072025NTPCUG-CEN.pdf). Online paper collections may move, become unavailable, or lack independently verifiable answer keys; the app reports shortfalls rather than inventing questions.
