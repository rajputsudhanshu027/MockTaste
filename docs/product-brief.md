# RRB NTPC Undergraduate practice tool

## Goal

A private, English-language practice tool for one RRB NTPC Undergraduate candidate. It runs in a browser on the candidate's computer and creates topic tests, weekly tests, and on-demand CBT-1 full mocks from study material, approved online sources, and past-paper collections.

## Study material and topics

- Accept PDFs, DOCX files, and ordered groups of images. Support text-readable files, printed pages, clean scans, and simple tables first; show extracted text and let the candidate correct it before generation. Skip complex diagrams, maps, and charts, identifying the skipped pages.
- Allow a chapter or page range from one file for a topic test. A weekly test can combine selections from several files.
- In Create a test, read the complete uploaded document and identify supported topics and exam sections automatically. Show the detected topics without asking the candidate to enter a subject. The default document test covers those topics using the selected notes; generated questions must have supporting document evidence or a checked worked solution, and topic detection must be refreshed after text corrections.
- Let the candidate mark studied topics each week, using RRB NTPC syllabus topics with optional custom labels. A topic can be marked without an uploaded file and supported by approved online sources.
- Keep uploads, extracted text, tests, scores, and progress on the computer, with deletion controls. Saved tests can be taken and reviewed offline.
- Let the candidate create a friend exam link from the local dashboard. The app starts a temporary HTTPS tunnel automatically when the candidate creates the link. A separate student-only server on the creator's PC serves the paper. Each friend submits and sees only a confirmation. The creator receives private scored reports on the same PC, optionally writes feedback, and downloads a PDF report to send to the friend. The PDF includes scores, section and topic performance, feedback, questions, answer choices, selected answers, correct answers, and explanations. Save any newly entered feedback before downloading. PDF generation does not require a tunnel or AI request. The owner dashboard stays bound to loopback and is never exposed through the student server.

## Tests

| Test | Construction | Timing and scoring |
| --- | --- | --- |
| Document test | Identify topics and sections automatically from the complete uploaded document. Write questions based on the selected notes, without requiring a subject or topic entry. | Candidate chooses 5–50 questions and a time limit; CBT-1 negative marking. |
| Topic test | Questions from a selected topic and material, supplemented by approved same-topic sources | Candidate chooses a shorter length and time; CBT-1 negative marking |
| Weekly test | Default 30 main questions: 24 from this week's topics and 6 new questions on earlier weak topics. About 25% draw from past-paper collections. Append exact questions missed in the previous weekly test as retries. | Default 27 minutes for the main test; +1 correct, −⅓ wrong, 0 unanswered. Retries are untimed and reported separately from the main score. |
| Full mock | On-demand CBT-1 paper covering the wider syllabus: 40 General Awareness, 30 Mathematics, and 30 Reasoning questions. Include current affairs from the rolling 12 months before the test date. | 100 questions in 90 minutes; +1 correct, −⅓ wrong, 0 unanswered. |

The CBT-1 pattern follows the [official RRB NTPC Undergraduate notice](https://www.rrbcdg.gov.in/uploads/2025/07-NTPCUG/072025NTPCUG-CEN.pdf). Timed tests cannot be paused and submit automatically when time expires. A weekly reminder appears on Sunday evening when the local app is open; the candidate starts full mocks manually. Prepare weekly tests ahead of Sunday when possible. If a weekly test has fewer than 30 defensible main questions, show the reduced count and set its timer to 0.9 minutes per main question. If 100 defensible questions cannot be assembled, do not present the result as a Full Mock; offer a shorter practice test with a distinct label.

## Question sources and review

- Use a target mix of roughly 25% past-paper questions and 75% new questions. Do not repeat a past-paper question until the available pool is exhausted, except for explicit retry questions. If the pool cannot supply the target share, use new questions and show the actual mix.
- Label online past-paper items as verified official, third-party claimed copy, or memory-based reconstruction. Keep the original source link; never imply a third-party item is official.
- Automatically search approved official sources such as [RRB](https://www.rrbcdg.gov.in/2025-07-ntpcug.php), [PIB](https://www.pib.gov.in/allrelease.aspx?lang=1&reg=1), [RBI](https://m.rbi.org.in/), and [ISRO](https://www.isro.gov.in/ISRO_EN/Press.html) for relevant facts. Automatically import checked English Undergraduate CBT-1 questions from clearly labelled [Prepp paper copies](https://prepp.in/rrb-ntpc-exam/question-paper-2024). The candidate does not need to supply links.
- Require an exact approved source reference for factual answers. New self-contained Mathematics and Reasoning questions require a worked solution and a separate answer check. Show source dates for current affairs.
- Prefer a current official source if it conflicts with uploaded notes. Omit a question if the conflict cannot be resolved. If material and approved online sources still cannot support enough questions, explain the gap and generate fewer.
- Run automatic question checks before a test. After submission, show correct answers, explanations, source references or worked solutions, and the provenance of each question. A flagged wrong or ambiguous question is excluded from the score and future tests.
- Track total, section, and topic performance over weeks and identify weak topics.

## Operation and cost

- No additional paid API or search service. Use the candidate's existing ChatGPT Plus plan for eligible AI requests through a local app, subject to plan limits and sign-in. Only selected pages, images, or extracted text are sent for generation; make this visible in the app. See [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart) and its [input and tool limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- Prepare and save a weekly test before Sunday when plan usage is available. If generation is unavailable and no test is saved, wait for usage to reset rather than incur a charge.

## First-version quality gate

Manually audit 100 generated questions across PDF, DOCX, and image inputs. No audited question may have a wrong answer key or an unsupported factual answer.

