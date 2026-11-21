// Bundles the renderer (Firebase included) and copies fonts, so the app works offline.
const esbuild = require("esbuild"), fs = require("fs"), path = require("path");
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist/fonts", { recursive: true });
esbuild.buildSync({ entryPoints: ["src/renderer.js"], bundle: true, minify: true, format: "iife", outfile: "dist/renderer.js", target: "chrome120" });
for (const f of ["index.html", "style.css"]) fs.copyFileSync(path.join("src", f), path.join("dist", f));
let css = "";
const RANGES = {
  arabic: "U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC",
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215"
};
for (const [pkg, family] of [["aref-ruqaa", "Aref Ruqaa"], ["readex-pro", "Readex Pro"]]) {
  const dir = path.join("node_modules", "@fontsource", pkg, "files");
  if (!fs.existsSync(dir)) { console.warn("fonts missing:", pkg); continue; }
  for (const f of fs.readdirSync(dir)) {
    const m = /^(.+)-(arabic|latin)-(\d+)-normal\.woff2$/.exec(f);
    if (!m || !["400", "600", "700"].includes(m[3])) continue;
    fs.copyFileSync(path.join(dir, f), path.join("dist", "fonts", f));
    css += `@font-face{font-family:"${family}";font-weight:${m[3]};font-style:normal;font-display:swap;src:url(fonts/${f}) format("woff2");unicode-range:${RANGES[m[2]]}}\n`;
  }
}
fs.writeFileSync("dist/fonts.css", css);
console.log("built");
