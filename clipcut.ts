#!/usr/bin/env bun
import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const ESC = "\x1b[";
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  // fg
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  // bright fg
  bRed: "\x1b[91m",
  bGreen: "\x1b[92m",
  bYellow: "\x1b[93m",
  bBlue: "\x1b[94m",
  bMagenta: "\x1b[95m",
  bCyan: "\x1b[96m",
  bWhite: "\x1b[97m",
  // bg
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgBlue: "\x1b[44m",
  bgCyan: "\x1b[46m",
  bgDark: "\x1b[48;2;18;18;28m",
  bgCard: "\x1b[48;2;26;26;38m",
  bgSel: "\x1b[48;2;60;40;120m",
  bgAccent: "\x1b[48;2;120;60;200m",
};
const mv = (r: number, c: number) => `${ESC}${r};${H(c)}f`;
const clr = () => `${ESC}2J${ESC}H`;
const clrLine = () => `${ESC}2K`;
const hideCursor = () => `${ESC}?25l`;
const showCursor = () => `${ESC}?25h`;
const H = (c: number) => `${c}H`.slice(-`${c}H`.length);
const moveTo = (r: number, c: number) =>
  process.stdout.write(`${ESC}${r};${c}H`);
const write = (s: string) => process.stdout.write(s);

// ─── Terminal size ────────────────────────────────────────────────────────────
function termSize() {
  return {
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
  };
}

// ─── Box drawing ─────────────────────────────────────────────────────────────
function box(
  x: number,
  y: number,
  w: number,
  h: number,
  title = "",
  color = C.bMagenta,
) {
  const tl = "╭",
    tr = "╮",
    bl = "╰",
    br = "╯",
    hz = "─",
    vt = "│";
  let out = "";
  const titleStr = title ? ` ${title} ` : "";
  const topFill = titleStr
    ? hz.repeat(2) +
      C.bold +
      color +
      titleStr +
      C.reset +
      color +
      hz.repeat(w - 4 - titleStr.length)
    : hz.repeat(w - 2);
  moveTo(y, x);
  out = `${color}${tl}${topFill}${tr}${C.reset}`;
  write(out);
  for (let i = 1; i < h - 1; i++) {
    moveTo(y + i, x);
    write(`${color}${vt}${C.reset}`);
    moveTo(y + i, x + w - 1);
    write(`${color}${vt}${C.reset}`);
  }
  moveTo(y + h - 1, x);
  write(`${color}${bl}${hz.repeat(w - 2)}${br}${C.reset}`);
}

function fillBg(x: number, y: number, w: number, h: number, bg: string) {
  for (let i = 0; i < h; i++) {
    moveTo(y + i, x);
    write(`${bg}${" ".repeat(w)}${C.reset}`);
  }
}

// ─── Video file discovery ─────────────────────────────────────────────────────
const RECORDS_DIR = "/home/kisakay/Videos/Records";

function getLastMp4s(
  dir: string,
  n = 10,
): { name: string; path: string; mtime: Date }[] {
  let files: { name: string; path: string; mtime: Date }[] = [];
  try {
    const entries = readdirSync(dir);
    for (const e of entries) {
      if (!e.toLowerCase().endsWith(".mp4")) continue;
      const full = join(dir, e);
      try {
        const st = statSync(full);
        files.push({ name: e, path: full, mtime: st.mtime });
      } catch {}
    }
  } catch (err) {
    return [];
  }
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files.slice(0, n);
}

// ─── Duration formatter ───────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(1) + " KB";
}
function fmtDate(d: Date): string {
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// ─── Input ────────────────────────────────────────────────────────────────────
type Key = { name: string; raw: Buffer | string };

function readKey(): Promise<Key> {
  return new Promise((res) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (data: Buffer | string) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const buf: Buffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data as string, "utf-8");
      const hex = buf.toString("hex");
      let name = "unknown";
      if (hex === "0d" || hex === "0a") name = "enter";
      else if (hex === "1b5b44") name = "left";
      else if (hex === "1b5b43") name = "right";
      else if (hex === "1b5b41") name = "up";
      else if (hex === "1b5b42") name = "down";
      else if (hex === "03" || hex === "71" || hex === "1b") name = "quit";
      else if (hex === "7f" || hex === "08") name = "backspace";
      else name = buf.toString("utf-8");
      res({ name, raw: buf });
    });
  });
}

async function readLine(prompt: string, initial = ""): Promise<string | null> {
  process.stdin.setRawMode(false);
  process.stdout.write(prompt);
  let buf = initial;
  process.stdout.write(buf);
  return new Promise((res) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (raw: Buffer | string) => {
      const data: Buffer = Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(raw as string, "utf-8");
      const hex = data.toString("hex");

      // Ignorer toutes les séquences d'échappement (flèches, F-keys, etc.)
      if (hex.startsWith("1b")) {
        if (hex === "1b") {
          // ESC seul = annuler
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          res(null);
        }
        // toute autre séquence 1b5b... (flèches etc.) → ignorée silencieusement
        return;
      }

      if (hex === "0d" || hex === "0a") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        write("\n");
        res(buf);
      } else if (hex === "03") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        res(null);
      } else if (hex === "7f" || hex === "08") {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          write("\b \b");
        }
      } else {
        const ch = data.toString("utf-8");
        buf += ch;
        write(ch);
      }
    };
    process.stdin.on("data", onData);
  });
}

// ─── Screen: file selector ────────────────────────────────────────────────────
async function screenSelector(
  files: { name: string; path: string; mtime: Date }[],
): Promise<string | null> {
  let idx = 0;
  const { cols, rows } = termSize();

  function render() {
    write(clr());
    write(hideCursor());

    // Header
    fillBg(1, 1, cols, 3, C.bgAccent);
    moveTo(1, 1);
    const header = " ✂  ClipCut  —  Sélectionnez un enregistrement ";
    write(`${C.bgAccent}${C.bWhite}${C.bold}${header.padEnd(cols)}${C.reset}`);
    moveTo(2, 1);
    write(
      `${C.bgAccent}${C.dim}${C.white}${"  /home/kisakay/Videos/Records  ·  10 derniers fichiers MP4".padEnd(cols)}${C.reset}`,
    );

    // List
    const listY = 4;
    const listH = rows - 6;
    const listW = cols - 4;
    const startX = 3;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const y = listY + i * 2;
      if (y + 1 > rows - 2) break;

      const sel = i === idx;
      const bg = sel ? C.bgSel : i % 2 === 0 ? C.bgCard : C.bgDark;
      const num = `${C.gray}${String(i + 1).padStart(2, "0")}${C.reset}`;

      // Row bg
      fillBg(startX - 1, y, listW + 2, 2, bg);

      moveTo(y, startX + 1);
      const icon = sel ? `${C.bMagenta}▶ ` : `${C.gray}  `;
      const name = sel
        ? `${C.bWhite}${C.bold}${f.name}`
        : `${C.white}${f.name}`;

      let st;
      try {
        st = statSync(f.path);
      } catch {
        st = null;
      }
      const meta = st
        ? `${C.gray}${fmtDate(f.mtime)}  ${fmtSize(st.size)}`
        : `${C.gray}${fmtDate(f.mtime)}`;

      const maxName = listW - 30;
      const displayName =
        f.name.length > maxName ? f.name.slice(0, maxName - 1) + "…" : f.name;
      write(
        `${bg}${icon}${num}  ${name.replace(f.name, displayName)}${C.reset}`,
      );
      moveTo(y + 1, startX + 5);
      write(`${bg}${meta}${C.reset}`);
    }

    // Footer
    moveTo(rows - 1, 1);
    fillBg(1, rows - 1, cols, 1, C.bgAccent);
    moveTo(rows - 1, 1);
    write(
      `${C.bgAccent}${C.dim}  ↑↓ Parcourir   → Prévisualiser   Enter Découper   ← / q Retour${C.reset}`,
    );
  }

  render();

  while (true) {
    const key = await readKey();
    if (key.name === "quit" || key.name === "left") {
      write(showCursor());
      write(clr());
      return null;
    }
    if (key.name === "down") {
      idx = (idx + 1) % files.length;
    } else if (key.name === "up") {
      idx = (idx - 1 + files.length) % files.length;
    } else if (key.name === "right") {
      // Ouvre le fichier avec le player par défaut sans quitter le sélecteur
      spawn("xdg-open", [files[idx].path], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (key.name === "enter") {
      write(showCursor());
      return files[idx].path;
    }
    render();
  }
}

// ─── Time input parser ────────────────────────────────────────────────────────
function parseTime(s: string): string | null {
  s = s.trim();
  // hh:mm:ss or mm:ss or ss
  if (/^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}(\.\d+)?$/.test(s)) return s;
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  return null;
}

// ─── Screen: cut editor ────────────────────────────────────────────────────────
async function screenCut(filePath: string): Promise<void> {
  const { cols, rows } = termSize();
  const fileName = basename(filePath);

  write(clr());
  write(hideCursor());

  // Header
  fillBg(1, 1, cols, 3, C.bgAccent);
  moveTo(1, 1);
  write(
    `${C.bgAccent}${C.bWhite}${C.bold}  ✂  ClipCut  —  Définir les points de découpe${" ".repeat(cols - 47)}${C.reset}`,
  );
  moveTo(2, 1);
  const short =
    fileName.length > cols - 10 ? fileName.slice(0, cols - 13) + "…" : fileName;
  write(
    `${C.bgAccent}${C.dim}${C.white}  ${short}${" ".repeat(cols - 2 - short.length - 1)}${C.reset}`,
  );

  // Card
  const cw = Math.min(70, cols - 4);
  const cx = Math.floor((cols - cw) / 2);
  const cy = 5;
  fillBg(cx, cy, cw, 16, C.bgCard);
  box(cx, cy, cw, 16, "✂  DÉCOUPE", C.bMagenta);

  moveTo(cy + 2, cx + 3);
  write(`${C.gray}Fichier :  ${C.bWhite}${C.bold}${short}${C.reset}`);
  moveTo(cy + 3, cx + 3);
  write(`${C.gray}${"─".repeat(cw - 6)}${C.reset}`);

  moveTo(cy + 5, cx + 3);
  write(`${C.bCyan}⏱  Entrée ${C.gray}(ex: 00:01:30 ou 90)${C.reset}`);

  write(showCursor());
  moveTo(cy + 6, cx + 5);
  write(`${C.bWhite}› ${C.reset}`);

  const entryStr = await readLine(`${C.bGreen}`, "");
  if (entryStr === null) {
    write(clr());
    return;
  }
  const entry = parseTime(entryStr);
  if (!entry) {
    moveTo(cy + 7, cx + 3);
    write(`${C.bRed}Format invalide. Exemples: 00:01:30 ou 90${C.reset}`);
    await new Promise((r) => setTimeout(r, 1800));
    return screenCut(filePath);
  }

  write(hideCursor());
  moveTo(cy + 7, cx + 3);
  write(`${C.bGreen}✓ Entrée : ${C.bWhite}${entry}${C.reset}`);

  moveTo(cy + 9, cx + 3);
  write(`${C.bCyan}⏹  Sortie ${C.gray}(ex: 00:03:45 ou 225)${C.reset}`);

  write(showCursor());
  moveTo(cy + 10, cx + 5);
  write(`${C.bWhite}› ${C.reset}`);

  const exitStr = await readLine(`${C.bGreen}`, "");
  if (exitStr === null) {
    write(clr());
    return;
  }
  const exit = parseTime(exitStr);
  if (!exit) {
    moveTo(cy + 11, cx + 3);
    write(`${C.bRed}Format invalide.${C.reset}`);
    await new Promise((r) => setTimeout(r, 1800));
    return screenCut(filePath);
  }

  write(hideCursor());
  moveTo(cy + 11, cx + 3);
  write(`${C.bGreen}✓ Sortie : ${C.bWhite}${exit}${C.reset}`);

  // Reason / output name
  moveTo(cy + 13, cx + 3);
  write(
    `${C.bCyan}📄 Nom du clip ${C.gray}(raison/date — sans .mp4)${C.reset}`,
  );

  write(showCursor());
  moveTo(cy + 14, cx + 5);
  write(`${C.bWhite}› ${C.reset}`);

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const reason = await readLine(`${C.bGreen}`, datePart);
  if (reason === null || reason.trim() === "") {
    write(clr());
    return;
  }

  const outName = reason.trim().replace(/\.mp4$/i, "") + ".mp4";
  const outPath = join(RECORDS_DIR, outName);

  // Confirm
  write(hideCursor());
  write(clr());
  fillBg(1, 1, cols, rows, C.bgDark);

  const pw = Math.min(80, cols - 4);
  const px = Math.floor((cols - pw) / 2);
  const py = Math.floor(rows / 2) - 8;
  fillBg(px, py, pw, 18, C.bgCard);
  box(px, py, pw, 18, "🚀  CONFIRMER LA DÉCOUPE", C.bGreen);

  const cmd = `ffmpeg -ss ${entry} -to ${exit} -i "${filePath}" -c copy "${outPath}"`;

  moveTo(py + 2, px + 3);
  write(`${C.gray}Commande générée :${C.reset}`);
  moveTo(py + 3, px + 3);
  const cmdShort = cmd.length > pw - 6 ? cmd.slice(0, pw - 9) + "…" : cmd;
  write(`${C.bYellow}${cmdShort}${C.reset}`);

  moveTo(py + 5, px + 3);
  write(`${C.gray}Entrée  :  ${C.bGreen}${entry}${C.reset}`);
  moveTo(py + 6, px + 3);
  write(`${C.gray}Sortie  :  ${C.bRed}${exit}${C.reset}`);
  moveTo(py + 7, px + 3);
  write(`${C.gray}Source  :  ${C.white}${short}${C.reset}`);
  moveTo(py + 8, px + 3);
  write(`${C.gray}Output  :  ${C.bCyan}${outName}${C.reset}`);

  moveTo(py + 10, px + 3);
  write(`${C.gray}${"─".repeat(pw - 6)}${C.reset}`);
  moveTo(py + 11, px + 3);
  write(
    `${C.bWhite}${C.bold}Lancer la découpe ? ${C.green}[Enter]${C.white} / ${C.bRed}[q] Annuler${C.reset}`,
  );

  while (true) {
    const key = await readKey();
    if (key.name === "quit") {
      write(clr());
      write(showCursor());
      process.exit(0);
    }
    if (key.name === "enter") break;
  }

  // Run ffmpeg
  write(clr());
  fillBg(1, 1, cols, rows, C.bgDark);
  moveTo(Math.floor(rows / 2) - 2, Math.floor(cols / 2) - 20);
  write(`${C.bMagenta}${C.bold}⚙  Découpe en cours avec ffmpeg…${C.reset}`);
  moveTo(Math.floor(rows / 2), Math.floor(cols / 2) - 20);
  write(`${C.gray}${cmd}${C.reset}`);

  write(showCursor());
  moveTo(Math.floor(rows / 2) + 3, 1);

  await new Promise<void>((res, rej) => {
    const proc = spawn(
      "ffmpeg",
      ["-ss", entry, "-to", exit, "-i", filePath, "-c", "copy", outPath],
      { stdio: ["inherit", "inherit", "inherit"] },
    );
    proc.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`ffmpeg exited with code ${code}`));
    });
  })
    .then(() => {
      write("\n\n");
      write(
        `${C.bGreen}${C.bold}✓ Clip créé : ${C.bCyan}${outPath}${C.reset}\n`,
      );
      write(
        `${C.gray}Appuyez sur une touche pour revenir au menu…${C.reset}\n`,
      );
      return readKey();
    })
    .catch((err) => {
      write("\n\n");
      write(`${C.bRed}✗ Erreur ffmpeg : ${err.message}${C.reset}\n`);
      write(
        `${C.gray}Appuyez sur une touche pour revenir au menu…${C.reset}\n`,
      );
      return readKey();
    });
}

// ─── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  process.on("exit", () => {
    write(showCursor());
  });
  process.on("SIGINT", () => {
    write(showCursor());
    write(clr());
    process.exit(0);
  });

  while (true) {
    const { cols, rows } = termSize();
    write(clr());
    write(hideCursor());
    fillBg(1, 1, cols, rows, C.bgDark);

    const files = getLastMp4s(RECORDS_DIR, 10);
    if (files.length === 0) {
      moveTo(Math.floor(rows / 2), Math.floor(cols / 2) - 20);
      write(
        `${C.bRed}Aucun fichier MP4 trouvé dans ${RECORDS_DIR}${C.reset}\n`,
      );
      write(showCursor());
      process.exit(1);
    }

    const selected = await screenSelector(files);
    if (!selected) break;

    await screenCut(selected);
  }

  write(showCursor());
  write(clr());
}

main();
