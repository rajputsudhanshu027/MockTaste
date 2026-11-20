"""Record the user's review shorthand in the generated review sheet."""
import csv
from pathlib import Path

path = Path(__file__).resolve().parent / "reports/review-sheet.csv"
with path.open(encoding="utf-8-sig", newline="") as stream:
    rows = list(csv.DictReader(stream))
fields = list(rows[0])
for row in rows:
    note = (row.get("human_verdict", "") + " " + row.get("review_notes", "")).casefold()
    malformed = "malform" in note
    row["human_verdict"] = "Malformed" if malformed else "Correct"
    if not malformed:
        row["review_notes"] = "User reviewed: OK"
with path.open("w", encoding="utf-8-sig", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
print(f"Recorded {len(rows)} verdicts; {sum(row['human_verdict'] == 'Malformed' for row in rows)} malformed")
