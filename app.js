class AppError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppError";
  }
}

const csvInput = document.getElementById("csvFiles");
const mergeButton = document.getElementById("mergeButton");
const resetButton = document.getElementById("resetButton");
const statusSection = document.getElementById("statusSection");
const previewSection = document.getElementById("previewSection");
const previewTable = document.getElementById("previewTable");

mergeButton.addEventListener("click", onMergeClicked);
resetButton.addEventListener("click", resetUI);

async function onMergeClicked() {
  clearStatus();
  hidePreview();

  try {
    const files = Array.from(csvInput.files || []);
    if (files.length === 0) {
      throw new AppError("Please select at least one CSV file.");
    }
    if (files.length > 6) {
      throw new AppError("You can upload a maximum of 6 CSV files.");
    }

    setStatus("Reading and validating CSV files...", "success");

    const datasets = [];
    for (let i = 0; i < files.length; i += 1) {
      const parsed = await parseCSVFile(files[i], i + 1);
      datasets.push(parsed);
    }

    const merged = innerJoinByDate(datasets);
    renderPreview(merged.headers, merged.rows.slice(0, 12));
    downloadMergedCsv(merged.headers, merged.rows);

    setStatus(
      `Merged successfully. ${merged.rows.length} rows matched across ${datasets.length} file(s). Download started.`,
      "success"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while merging.";
    setStatus(message, "error");
  }
}

function resetUI() {
  csvInput.value = "";
  clearStatus();
  hidePreview();
}

function setStatus(message, type) {
  statusSection.textContent = message;
  statusSection.className = `status ${type}`;
}

function clearStatus() {
  statusSection.className = "status hidden";
  statusSection.textContent = "";
}

function hidePreview() {
  previewSection.classList.add("hidden");
  previewTable.innerHTML = "";
}

function renderPreview(headers, rows) {
  previewSection.classList.remove("hidden");

  const headerHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  previewTable.innerHTML = `<thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function parseCSVFile(file, fileIndex) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new AppError(`File ${file.name} is not a .csv file.`);
  }

  const text = await file.text();
  const parsed = parseCSV(text, file.name);

  if (parsed.headers.length === 0) {
    throw new AppError(`File ${file.name} has no header row.`);
  }
  if (parsed.rows.length === 0) {
    throw new AppError(`File ${file.name} has no data rows.`);
  }

  const dateColumnIndex = detectDateColumnIndex(parsed.headers, parsed.rows, file.name);

  const columns = parsed.headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter((column) => column.index !== dateColumnIndex);

  const rowMap = new Map();

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i];
    if (row.length !== parsed.headers.length) {
      throw new AppError(
        `In ${file.name}, row ${i + 2} has ${row.length} columns but the header has ${parsed.headers.length}.`
      );
    }

    const rawDate = row[dateColumnIndex];
    const dateKey = normalizeDate(rawDate);
    if (!dateKey) {
      throw new AppError(
        `In ${file.name}, row ${i + 2} has an invalid date value in "${parsed.headers[dateColumnIndex]}": "${rawDate}".`
      );
    }

    if (rowMap.has(dateKey)) {
      throw new AppError(
        `In ${file.name}, duplicate date "${dateKey}" detected at row ${i + 2}. Each file must have unique dates for inner join.`
      );
    }

    const values = columns.map((column) => row[column.index] ?? "");
    rowMap.set(dateKey, values);
  }

  return {
    fileName: file.name,
    fileIndex,
    dateColumn: parsed.headers[dateColumnIndex],
    columns,
    rowMap
  };
}

function detectDateColumnIndex(headers, rows, fileName) {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  const nameMatch = normalized.findIndex((h) => h === "date" || h.endsWith("_date") || h.includes(" date"));
  if (nameMatch >= 0) {
    return nameMatch;
  }

  let bestIndex = -1;
  let bestScore = 0;

  for (let col = 0; col < headers.length; col += 1) {
    let validCount = 0;
    const sampleSize = Math.min(30, rows.length);

    for (let row = 0; row < sampleSize; row += 1) {
      if (normalizeDate(rows[row][col])) {
        validCount += 1;
      }
    }

    const score = sampleSize > 0 ? validCount / sampleSize : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = col;
    }
  }

  if (bestIndex >= 0 && bestScore >= 0.7) {
    return bestIndex;
  }

  throw new AppError(
    `Could not identify a date column in ${fileName}. Use a header named "date" or ensure one column contains valid dates.`
  );
}

function normalizeDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return buildDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);

    if (first > 12 && second <= 12) {
      return buildDateKey(year, second, first);
    }
    return buildDateKey(year, first, second);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(
      parsed.getUTCDate()
    ).padStart(2, "0")}`;
  }

  return null;
}

function buildDateKey(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function innerJoinByDate(datasets) {
  if (datasets.length === 0) {
    throw new AppError("No valid dataset to merge.");
  }

  let intersection = new Set(datasets[0].rowMap.keys());

  for (let i = 1; i < datasets.length; i += 1) {
    const nextSet = new Set();
    for (const dateKey of intersection) {
      if (datasets[i].rowMap.has(dateKey)) {
        nextSet.add(dateKey);
      }
    }
    intersection = nextSet;
  }

  if (intersection.size === 0) {
    throw new AppError("No matching dates found across all uploaded files (inner join result is empty).");
  }

  const sortedDates = Array.from(intersection).sort((a, b) => (a < b ? -1 : 1));
  const headers = ["date"];

  for (const dataset of datasets) {
    for (const col of dataset.columns) {
      headers.push(`file${dataset.fileIndex}_${sanitizeHeader(col.header)}`);
    }
  }

  const rows = sortedDates.map((dateKey) => {
    const row = [dateKey];
    for (const dataset of datasets) {
      const values = dataset.rowMap.get(dateKey);
      if (!values) {
        throw new AppError(`Missing expected date ${dateKey} during merge.`);
      }
      row.push(...values);
    }
    return row;
  });

  return { headers, rows };
}

function sanitizeHeader(value) {
  const trimmed = String(value || "column").trim();
  return trimmed.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

function downloadMergedCsv(headers, rows) {
  const csvText = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `inner_join_${timestamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseCSV(text, fileName) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }

      row.push(field);
      field = "";

      if (!isRowCompletelyEmpty(row)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new AppError(`Malformed CSV in ${fileName}: unmatched quote detected.`);
  }

  row.push(field);
  if (!isRowCompletelyEmpty(row)) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows };
}

function isRowCompletelyEmpty(row) {
  return row.every((cell) => String(cell).trim() === "");
}
