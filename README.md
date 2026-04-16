# CSV Date Inner Joiner

A lightweight web app that:

- accepts up to 6 `.csv` files
- detects a date column in each file
- performs an **inner join** on the date value across all uploaded files
- downloads the merged result as a new `.csv`

## Run

Because this is a static app, you can run it by opening `index.html` in your browser.

For best compatibility, you can also serve it from the project folder with any static server.

## Behavior and Error Handling

The app validates and reports:

- no files selected
- more than 6 files selected
- non-CSV files
- missing headers or missing data rows
- row column count mismatch
- invalid or missing date values
- duplicate dates within the same file
- no intersecting dates across files
- malformed CSV with unmatched quotes

## Date Detection Rules

The app first looks for a header like `date` (or containing ` date` / ending with `_date`).
If not found, it samples values in each column and picks the column where at least 70% of sample rows parse as dates.

Supported date formats include:

- `YYYY-MM-DD`
- `MM/DD/YYYY`
- `DD/MM/YYYY` (when unambiguous)
- ISO date-time strings parseable by JavaScript `Date`

## Output Columns

Output includes:

- `date`
- all non-date columns from each file, prefixed with `fileN_` where `N` is upload order

Example: `file2_revenue`, `file3_status`
