# MockTaste

A private study workspace for students across subjects and exam categories. Students save material and notes, generate personal multiple-choice tests, review answers, and track completed practice on a GitHub-style activity calendar. The existing RRB NTPC workspace is preserved as the private admin panel.

## Accounts and workspaces

The student product now has an Android-first native app under [`mobile/`](mobile/README.md). It opens to the camera and shares the same student accounts, notes, snaps, quizzes, and streaks with the web workspace. See its setup guide for the separate student-only mobile API and development build. The admin panel remains on the web.

For an installable internal APK that runs without Metro, run `rtk npm run apk` from `mobile/`. The build script uses the downloaded tools in `.android-tools/` and writes `artifacts/MockTaste-android-preview.apk`. See the [Android guide](mobile/README.md#installable-local-apk) for network setup and emulator checks.

Open `http://127.0.0.1:4173` to create a Student or Teacher account or sign in. Students have separate libraries, tests, results, AI connections, and activity histories. Personal tests cannot be shared. Students can explicitly share study photos with accepted study mates using Study snaps. Teacher accounts can register and sign in; classroom and assignment features have not been defined yet.

Administrators cannot register publicly. Stop the app, then run the following once for yourself and again for your friend, using different email addresses:

```bash
rtk npm run admin -- you@example.com "Your name"
```

The command asks for a password and confirmation without displaying the password. Restart the app and sign in: admin accounts open `/admin`, retaining the original documents, tests, reports, settings, and friend-sharing features. Existing data stays in its original location. Account data is saved under `data/accounts/`, with a separate workspace per student. These directories remain excluded from version control.

### Student workflow

1. Create a Student account. The activity calendar uses the time zone detected at signup.
2. In **My notes**, write notes or upload a PDF, DOCX, or ordered images. Organize material by subject or course. Open an uploaded document and choose **Read document**, then review and correct its text.
3. Connect your own ChatGPT account in **Settings** to generate tests or read scanned pages. Student accounts never use the administrator’s AI credentials. Text PDFs and DOCX can be read without AI; document extraction requires the same local PDF/unzip tools as the admin workspace.
4. In **Create a test**, choose ready material, title, question count, duration, difficulty, and wrong-answer penalty. Generation uses only selected study text and checks answers in a second AI pass. It supports subjects beyond RRB; the current student question format is single-answer multiple choice.
5. Start a saved test. Answers save as you select them. The timer is kept on the server and continues after navigation or reload. Tests automatically finish at their deadline using saved answers, including when the browser is closed. After an app restart, expired tests finish when the workspace is next opened, using their original deadline as the completion time.
6. Completed tests add activity to the calendar. Multiple completions darken a day; uploads and logins do not count. Yesterday’s streak stays current until today ends without practice. Results and explanations remain saved.

This remains a computer-hosted application, bound to loopback. Public deployment, email verification, and self-service password recovery are not included in this change.

### Study snaps and study mates

1. Open **Study mates** and exchange the 10-character study code with another student on this installation. Send a request; the other student must accept. Codes reveal a display name, not an email address or library.
2. In **Study snaps**, choose **Take a study snap**. Mobile devices can open their camera; desktop browsers can choose a photo. The app resizes the image and converts it to JPEG, with server-side removal of photo metadata.
3. Your own connected AI account reads that photo and creates three source-supported questions, with a second answer check. If three questions cannot be supported, take a clearer or fuller photo. No study photo is sent to a mate during generation.
4. Answer all three questions at your own pace. There is no timer or required score. Completion adds one personal practice activity; answers and score stay private.
5. Choose accepted study mates and send. Only the photo, caption, and confirmation of quiz completion are shared. A sent snap cannot be resent as fresh activity on another day.
6. A shared streak day counts when a quiz-completed snap is sent and opened by its recipient on the same calendar day. Either person may send. Each pair earns at most one day per date; repeated opens do not extend the streak. The shared time zone is fixed to the requester's account time zone and displayed to both mates.
7. Photos remain available until the sender deletes them. Removing a mate revokes access to shared photos. Deleting a snap removes its photo, study text, and question content; already earned practice activity and shared streak days are retained.

This is a private study-mate inbox, without public feeds or searchable student directories. It uses the existing local app; remote access and push notifications are not included.

## Run

Requirements: Node.js 22 or newer, Poppler utilities (`pdfinfo`, `pdftotext`, `pdftoppm`, `pdftohtml`), and `unzip`. Install the Node dependencies once, then start the app.

```bash
rtk npm install
rtk npm run start
```

Open `http://127.0.0.1:4173` to sign in. Admin accounts open the existing dashboard at `/admin`. The app binds only to this computer. A separate friend-exam server listens on port `4174` for links created by admins. Files, tests, and reports are stored in `data/` on this PC, which is excluded from version control.

Connect your ChatGPT Plus account in **Settings** before reading scanned pages or generating questions. This uses [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart) for eligible plan-backed requests, with no separate paid API key. The app stops generation when plan usage is unavailable. Only selected study text/images are sent for AI requests; saved history stays local. ChatGPT sign-in and AI generation require internet, while prepared tests and answer review work offline as long as the local server is running.

For the optional local QLoRA demo, see [`finetune/README.md`](finetune/README.md). It can generate student practice questions on the RTX 2050; ChatGPT remains responsible for the independent answer audit.

## Admin workflow

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
