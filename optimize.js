const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PHOTOS_DIR = path.join(__dirname, 'content', 'photos');
const OUTPUT_DIR = path.join(__dirname, 'content', 'photos_optimized');
const MAX_WIDTH = 1200;
const WEBP_QUALITY = 80;

// Video settings
const VIDEO_MAX_HEIGHT = 720;
const VIDEO_CRF = 28; // Lower = better quality, higher = smaller file. 23-30 is reasonable.

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function compressVideo(srcPath, destPath) {
  // Output as .mp4 (H.264 + AAC) for max browser compatibility
  const mp4Path = destPath.replace(/\.[^.]+$/, '.mov');
  const relPath = path.relative(PHOTOS_DIR, srcPath);
  const srcSize = fs.statSync(srcPath).size;

  try {
    // -vf scale: limit height to VIDEO_MAX_HEIGHT, keep aspect ratio (width divisible by 2)
    // -c:v libx264: H.264 codec
    // -crf: constant rate factor (quality)
    // -preset slow: better compression
    // -c:a aac: AAC audio
    // -movflags +faststart: optimize for web streaming
    execSync(
      `ffmpeg -i "${srcPath}" -vf "scale=-2:'min(${VIDEO_MAX_HEIGHT},ih)'" -c:v libx264 -crf ${VIDEO_CRF} -preset slow -c:a aac -b:a 128k -movflags +faststart -y "${mp4Path}"`,
      { stdio: 'pipe', timeout: 600000 } // 10 min timeout per video
    );

    const destSize = fs.statSync(mp4Path).size;
    const savings = ((1 - destSize / srcSize) * 100).toFixed(0);
    console.log(`  ${relPath} → ${path.basename(mp4Path)}  (${formatSize(srcSize)} → ${formatSize(destSize)}, -${savings}%)`);
  } catch (err) {
    console.warn(`  Error comprimiendo video ${relPath}: ${err.message}`);
    // Fallback: copy original
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copiado (sin comprimir): ${relPath}`);
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

async function optimizeDir(srcDir, destDir, hasFfmpeg) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await optimizeDir(srcPath, destPath, hasFfmpeg);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    // Handle videos
    if (VIDEO_EXTS.has(ext)) {
      if (hasFfmpeg) {
        compressVideo(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  Copiado (ffmpeg no disponible): ${path.relative(PHOTOS_DIR, srcPath)}`);
      }
      continue;
    }

    // Handle images
    if (IMAGE_EXTS.has(ext)) {
      const webpName = path.basename(entry.name, ext) + '.webp';
      const webpPath = path.join(destDir, webpName);

      try {
        const img = sharp(srcPath);
        const meta = await img.metadata();

        let pipeline = img;
        if (meta.width > MAX_WIDTH) {
          pipeline = pipeline.resize(MAX_WIDTH);
        }

        await pipeline.webp({ quality: WEBP_QUALITY }).toFile(webpPath);

        const srcSize = fs.statSync(srcPath).size;
        const destSize = fs.statSync(webpPath).size;
        const savings = ((1 - destSize / srcSize) * 100).toFixed(0);
        const relPath = path.relative(PHOTOS_DIR, srcPath);
        console.log(`  ${relPath} → ${webpName}  (${formatSize(srcSize)} → ${formatSize(destSize)}, -${savings}%)`);
      } catch (err) {
        console.warn(`  Error optimizando ${path.relative(PHOTOS_DIR, srcPath)}: ${err.message}`);
        fs.copyFileSync(srcPath, destPath);
      }
      continue;
    }

    // Other files: just copy
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copiado: ${path.relative(PHOTOS_DIR, srcPath)}`);
  }
}

async function main() {
  const hasFfmpeg = checkFfmpeg();

  console.log(`Optimizando media...`);
  console.log(`  Origen: ${PHOTOS_DIR}`);
  console.log(`  Destino: ${OUTPUT_DIR}`);
  console.log(`  Imágenes: max ${MAX_WIDTH}px, WebP calidad ${WEBP_QUALITY}`);
  console.log(`  Videos: ${hasFfmpeg ? `max ${VIDEO_MAX_HEIGHT}p, H.264 CRF ${VIDEO_CRF}` : '⚠ ffmpeg no instalado, se copiarán sin comprimir'}`);
  console.log();

  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });

  await optimizeDir(PHOTOS_DIR, OUTPUT_DIR, hasFfmpeg);

  console.log(`\nOptimización completada en content/photos_optimized/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
