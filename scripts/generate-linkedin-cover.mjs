import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const assetsDir = path.join(root, "public", "assets");
const logoPath = path.join(assetsDir, "conneen-ai-logo.png");
const outputPath = path.join(assetsDir, "conneen-ai-linkedin-cover.jpg");

const width = 4200;
const height = 700;
const ink = "#071523";
const background = "#fbfbf8";
const headlineFont = "file:///C:/Windows/Fonts/segoeuib.ttf";

function seededRandom(seed = 7291) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function binaryBackground() {
  const random = seededRandom();
  const fontSize = 28;
  const cellW = 30;
  const cellH = 38;
  const cols = Math.ceil(width / cellW) + 2;
  const rows = Math.ceil(height / cellH) + 2;
  const glyphs = [];

  for (let row = 0; row < rows; row++) {
    const y = row * cellH + 7;
    for (let col = 0; col < cols; col++) {
      const x = col * cellW;
      const char = random() > 0.52 ? "1" : "0";
      glyphs.push(`<text x="${x}" y="${y}">${char}</text>`);
    }
  }

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${background}"/>
      <g fill="#071523" opacity="0.24" font-family="Consolas, 'Courier New', monospace" font-size="${fontSize}" font-weight="900">
        ${glyphs.join("\n")}
      </g>
      <defs>
      </defs>
    </svg>
  `;
}

function readabilityFadeSvg() {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="soften" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="46"/>
        </filter>
      </defs>
      <rect x="760" y="104" width="2840" height="500" rx="160" fill="${background}" opacity="0.66" filter="url(#soften)"/>
      <rect x="790" y="118" width="2780" height="468" rx="120" fill="${background}" opacity="0.44"/>
    </svg>
  `;
}

function headlineSvg() {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face {
          font-family: HeadlineFont;
          src: url('${headlineFont}');
        }
        .headline {
          fill: ${ink};
          font-family: HeadlineFont, 'Segoe UI', Arial, Helvetica, sans-serif;
          font-size: 132px;
          font-weight: 800;
          letter-spacing: -4px;
        }
      </style>
      <text class="headline" x="1420" y="312">Practical AI for the work that</text>
      <text class="headline" x="1420" y="474">slows growing businesses down.</text>
    </svg>
  `;
}

const icon = await sharp(logoPath)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extract({ left: 0, top: 0, width: 434, height: 506 })
  .resize({ height: 380 })
  .png()
  .toBuffer();

await sharp(Buffer.from(binaryBackground()))
  .composite([
    { input: Buffer.from(readabilityFadeSvg()), left: 0, top: 0 },
    { input: icon, left: 900, top: 160 },
    { input: Buffer.from(headlineSvg()), left: 0, top: 0 },
  ])
  .jpeg({ quality: 92, mozjpeg: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
const stats = await fs.stat(outputPath);
console.log(`Generated ${path.relative(root, outputPath)}`);
console.log(`${metadata.width}x${metadata.height}, ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
