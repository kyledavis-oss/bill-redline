// Test harness: runs the REAL parser/classifier from index.html against the real PDFs.
const fs = require("fs");
const path = require("path");
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

// 1) extract the inline <script> from index.html and load its functions
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const scriptBody = m[m.length - 1][1];

const stubEl = new Proxy({}, {
  get: () => stubElFn,
});
function stubElFn() { return stubEl; }
const noop = () => {};
const docStub = {
  querySelector: () => ({
    addEventListener: noop, classList: { add: noop, remove: noop },
    querySelectorAll: () => [], innerHTML: "", textContent: "", open: false,
    scrollIntoView: noop, value: "",
  }),
};
const api = new Function(
  "pdfjsLib", "document", "window", "performance",
  scriptBody + "\n;return {classify, linesToItems, SERVICES, feeMap, NO_DELIVERABLE};"
)(
  { GlobalWorkerOptions: {} },
  docStub,
  { scrollTo: noop, location: {} },
  { now: () => 0 }
);
const { classify, linesToItems, SERVICES, feeMap, NO_DELIVERABLE } = api;
const labelOf = k => (SERVICES.find(s => s.key === k) || {}).label || k;

// 2) replicate parsePdf() text grouping exactly as the browser does it
async function parsePdf(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const byY = {};
    tc.items.forEach(it => {
      if (!it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      (byY[y] = byY[y] || []).push({ x: it.transform[4], s: it.str });
    });
    Object.keys(byY).map(Number).sort((a, b) => b - a).forEach(y => {
      const text = byY[y].sort((a, b) => a.x - b.x).map(o => o.s).join(" ").replace(/\s+/g, " ").trim();
      if (text) lines.push(text);
    });
  }
  let matter = "";
  const mi = lines.findIndex(l => /^matter\b/i.test(l));
  if (mi >= 0) {
    matter = lines[mi].replace(/^matter[:\s]*/i, "").trim();
    const next = (lines[mi + 1] || "").trim();
    if (next && /[a-z]/i.test(next) && next.length < 90 &&
        !/^(date|invoice|page|for professional|total|fees|due|remittance|professional summary)/i.test(next))
      matter += " | " + next;
  }
  return { items: linesToItems(lines), matter, rawLines: lines };
}

function glTotal(items) {
  const seen = new Set(); let gl = 0;
  items.forEach(it => { if (!NO_DELIVERABLE.has(it.task) && !seen.has(it.task)) { seen.add(it.task); gl += feeMap[it.task] || 0; } });
  return gl;
}

// 3) ground truth from each PDF
const TRUTH = {
  "33254340.pdf":     { matter: "216563.00001", title: "Review of Contract re Rapid Response Defense Systems", items: 1,  total: 330 },
  "33300793.pdf":     { matter: "216563.00001", title: "Review of Contract re Rapid Response Defense Systems", items: 1,  total: 260 },
  "33342217 (1).pdf": { matter: "216563.00003", title: "Space Force GAO Protest",                              items: 17, total: 8582 },
  "33364911.pdf":     { matter: "216563.00003", title: "Space Force GAO Protest",                              items: 6,  total: 8759.5 }, // 5 entries + 1 discount line
  "33387612.pdf":     { matter: "216563.00003", title: "Space Force GAO Protest",                              items: 4,  total: 780.5 },
};

const DL = "C:/Users/kylek/Downloads";

(async () => {
  for (const [fname, t] of Object.entries(TRUTH)) {
    const { items, matter } = await parsePdf(path.join(DL, fname));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const gl = glTotal(items);
    const okTotal = Math.abs(total - t.total) < 0.01;
    const okCount = items.length === t.items;
    const okMatter = matter.includes(t.matter);
    console.log("\n=== " + fname + " ===");
    console.log("  matter detected : '" + matter + "'   " + (okMatter ? "OK" : "EXPECTED to contain " + t.matter));
    console.log("  line items      : " + items.length + " (expected " + t.items + ") " + (okCount ? "OK" : "MISMATCH"));
    console.log("  parsed total    : $" + total.toFixed(2) + " (expected $" + t.total.toFixed(2) + ") " + (okTotal ? "OK" : "MISMATCH"));
    console.log("  GL flat total   : $" + gl);
    items.forEach((it, i) => {
      console.log("    " + String(i + 1).padStart(2) + ". $" + String(it.amount.toFixed(2)).padStart(8) +
        "  " + (it.hours ? it.hours + "h" : "   ") + " @" + (it.rate ? "$" + it.rate : "   ").toString().padStart(5) +
        "  [" + it.task.padEnd(11) + "] " + it.desc.slice(0, 60));
    });
  }
})();
