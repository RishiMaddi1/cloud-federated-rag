import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";

GlobalWorkerOptions.workerSrc = pdfWorker;

function fileExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

async function extractPdf(file) {
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const line = textContent.items
      .map((item) => (item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n\n").trim();
}

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return String(value || "").trim();
}

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".log",
  ".yaml",
  ".yml",
  ".rst",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".bat",
  ".ps1",
  ".env",
  ".ini",
  ".toml",
  ".tex",
  ".properties",
]);

/**
 * Browser-side extraction for the demo. Not every binary format can be parsed without a server.
 * File picker is unrestricted; unsupported types get a clear error.
 */
export async function extractTextFromFile(file) {
  if (!file) return "";
  const name = file.name || "document";
  const ext = fileExt(name);
  const mime = file.type || "";

  if (ext === ".pdf" || mime === "application/pdf") {
    const t = await extractPdf(file);
    if (!t) {
      throw new Error(
        "No text could be extracted from this PDF (it may be scanned images only). Try OCR or paste text."
      );
    }
    return t;
  }

  if (ext === ".docx" || mime.includes("wordprocessingml.document")) {
    return extractDocx(file);
  }

  if (ext === ".doc" && !mime.includes("openxml")) {
    throw new Error(
      "Legacy .doc is not supported in the browser. Save as .docx or PDF, or paste text."
    );
  }

  if (TEXT_EXT.has(ext) || mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return readAsText(file);
  }

  throw new Error(
    `This file type is not supported in the browser demo (${ext || "unknown"}). ` +
      "Supported: PDF, DOCX, and common text types (.txt, .md, .csv, .json, code, etc.). " +
      "Images, Excel, and other binaries need export to text/PDF or use the Python/Gradio app."
  );
}
