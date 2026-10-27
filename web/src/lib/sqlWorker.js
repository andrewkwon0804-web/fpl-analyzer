// SQLite in the browser (sql.js, compiled to WebAssembly), run off the main thread so a slow
// query never freezes the page. The page can terminate this worker to stop a runaway query.
import initSqlJs from "sql.js";

let db = null;
const MAX_ROWS = 5000;

async function open({ wasm, url }) {
  const SQL = await initSqlJs({ locateFile: () => wasm });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`database download failed (${res.status})`);
  const total = +res.headers.get("content-length") || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    self.postMessage({ type: "progress", got, total });
  }
  let bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  // gzip magic number: the file is served as-is, so unpack it here
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  db = new SQL.Database(bytes);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0]?.values.map((v) => v[0]) || [];
  const schema = tables.map((t) => {
    const cols = db.exec(`PRAGMA table_info("${t}")`)[0].values.map((v) => ({ name: v[1], type: v[2] || "ANY" }));
    const rows = db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0];
    return { name: t, rows, cols };
  });
  return { schema, size: bytes.length, download: got };
}

function run(sql) {
  const t0 = performance.now();
  const results = db.exec(sql);
  const ms = performance.now() - t0;
  const last = results.at(-1);
  if (!last) return { columns: [], rows: [], total: 0, ms, statements: results.length };
  return { columns: last.columns, rows: last.values.slice(0, MAX_ROWS), total: last.values.length, ms, statements: results.length };
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    const out = type === "open" ? await open(e.data) : run(e.data.sql);
    self.postMessage({ id, ok: true, ...out });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
