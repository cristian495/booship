const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const CONTENT_DIR = path.join(__dirname, 'content');
const DIST_DIR = path.join(__dirname, 'dist');
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function askPassphrase() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Frase secreta: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

function encrypt(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, data: Buffer.concat([encrypted, authTag]) };
}

function encryptToJSON(data, key, salt) {
  const result = encrypt(data, key);
  return {
    salt: salt.toString('base64'),
    iv: result.iv.toString('base64'),
    data: result.data.toString('base64'),
  };
}

async function main() {
  const passphrase = await askPassphrase();
  if (!passphrase) {
    console.error('La frase no puede estar vacía.');
    process.exit(1);
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);

  // Read memories
  const memoriesPath = path.join(CONTENT_DIR, 'memories.json');
  if (!fs.existsSync(memoriesPath)) {
    console.error('No se encontró content/memories.json');
    process.exit(1);
  }
  const memories = JSON.parse(fs.readFileSync(memoriesPath, 'utf-8'));

  // Prepare dist
  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Encrypt media (photos and videos) and update references
  fs.mkdirSync(path.join(DIST_DIR, 'media'), { recursive: true });
  const mimeTypes = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  };
  let mediaIndex = 0;
  for (const memory of memories) {
    // Handle photos
    if (memory.type === 'photo' && memory.photo) {
      const filePath = path.join(CONTENT_DIR, memory.photo);
      if (!fs.existsSync(filePath)) {
        console.warn(`  Foto no encontrada: ${memory.photo}, saltando...`);
        memory.photo = null;
        continue;
      }
      // Convert to sRGB if needed (fixes Display P3 / HDR washed-out colors)
      const tmpFile = path.join(DIST_DIR, '_tmp_srgb' + path.extname(filePath));
      try {
        execSync(`sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "${filePath}" --out "${tmpFile}"`, { stdio: 'pipe' });
      } catch {
        fs.copyFileSync(filePath, tmpFile);
      }
      const data = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      const ext = path.extname(memory.photo).toLowerCase();
      const encrypted = encrypt(data, key);
      const encFileName = `${mediaIndex}.enc`;
      fs.writeFileSync(
        path.join(DIST_DIR, 'media', encFileName),
        Buffer.concat([encrypted.iv, encrypted.data])
      );
      memory.photo = `media/${encFileName}`;
      memory._mime = mimeTypes[ext] || 'image/jpeg';
      mediaIndex++;
      console.log(`  Foto encriptada: ${encFileName} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
    }
    // Handle decorations
    if (memory.decorations && memory.decorations.length > 0) {
      const encDecos = [];
      for (const decoPath of memory.decorations) {
        const filePath = path.join(CONTENT_DIR, decoPath);
        if (!fs.existsSync(filePath)) {
          console.warn(`  Decoración no encontrada: ${decoPath}, saltando...`);
          continue;
        }
        const data = fs.readFileSync(filePath);
        const encrypted = encrypt(data, key);
        const encFileName = `${mediaIndex}.enc`;
        fs.writeFileSync(
          path.join(DIST_DIR, 'media', encFileName),
          Buffer.concat([encrypted.iv, encrypted.data])
        );
        encDecos.push({ src: `media/${encFileName}`, mime: 'image/png' });
        mediaIndex++;
        console.log(`  Decoración encriptada: ${encFileName}`);
      }
      memory._decorations = encDecos;
      delete memory.decorations;
    }
    // Handle videos
    if (memory.type === 'video' && memory.video) {
      const filePath = path.join(CONTENT_DIR, memory.video);
      if (!fs.existsSync(filePath)) {
        console.warn(`  Video no encontrado: ${memory.video}, saltando...`);
        memory.video = null;
        continue;
      }
      const data = fs.readFileSync(filePath);
      const ext = path.extname(memory.video).toLowerCase();
      const encrypted = encrypt(data, key);
      const encFileName = `${mediaIndex}.enc`;
      fs.writeFileSync(
        path.join(DIST_DIR, 'media', encFileName),
        Buffer.concat([encrypted.iv, encrypted.data])
      );
      memory.video = `media/${encFileName}`;
      memory._mime = mimeTypes[ext] || 'video/mp4';
      mediaIndex++;
      console.log(`  Video encriptado: ${encFileName} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
    }
    // Handle photo groups
    if (memory.type === 'group' && memory.photos) {
      const encPhotos = [];
      for (const photoEntry of memory.photos) {
        const photoPath = typeof photoEntry === 'string' ? photoEntry : photoEntry.src;
        const photoFit = typeof photoEntry === 'object' ? photoEntry.fit : undefined;
        const filePath = path.join(CONTENT_DIR, photoPath);
        if (!fs.existsSync(filePath)) {
          console.warn(`  Grupo foto no encontrada: ${photoPath}, saltando...`);
          continue;
        }
        const tmpFile = path.join(DIST_DIR, '_tmp_srgb' + path.extname(filePath));
        try {
          execSync(`sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "${filePath}" --out "${tmpFile}"`, { stdio: 'pipe' });
        } catch {
          fs.copyFileSync(filePath, tmpFile);
        }
        const data = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        const ext = path.extname(photoPath).toLowerCase();
        const encrypted = encrypt(data, key);
        const encFileName = `${mediaIndex}.enc`;
        fs.writeFileSync(
          path.join(DIST_DIR, 'media', encFileName),
          Buffer.concat([encrypted.iv, encrypted.data])
        );
        const photoMeta = { src: `media/${encFileName}`, mime: mimeTypes[ext] || 'image/jpeg' };
        if (photoFit) photoMeta.fit = photoFit;
        encPhotos.push(photoMeta);
        mediaIndex++;
        console.log(`  Grupo foto encriptada: ${encFileName} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
      }
      memory._groupPhotos = encPhotos;
      delete memory.photos;
    }
    // Handle media groups (mixed photos + videos)
    if (memory.type === 'media-group' && memory.media) {
      const encMedia = [];
      const videoExts = new Set(['.mp4', '.mov', '.webm', '.avi']);
      for (const mediaPath of memory.media) {
        const filePath = path.join(CONTENT_DIR, mediaPath);
        if (!fs.existsSync(filePath)) {
          console.warn(`  Media grupo no encontrado: ${mediaPath}, saltando...`);
          continue;
        }
        const ext = path.extname(mediaPath).toLowerCase();
        const isVideo = videoExts.has(ext);
        let data;
        if (isVideo) {
          data = fs.readFileSync(filePath);
        } else {
          // Convert images to sRGB
          const tmpFile = path.join(DIST_DIR, '_tmp_srgb' + ext);
          try {
            execSync(`sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "${filePath}" --out "${tmpFile}"`, { stdio: 'pipe' });
          } catch {
            fs.copyFileSync(filePath, tmpFile);
          }
          data = fs.readFileSync(tmpFile);
          fs.unlinkSync(tmpFile);
        }
        const encrypted = encrypt(data, key);
        const encFileName = `${mediaIndex}.enc`;
        fs.writeFileSync(
          path.join(DIST_DIR, 'media', encFileName),
          Buffer.concat([encrypted.iv, encrypted.data])
        );
        const mime = mimeTypes[ext] || (isVideo ? 'video/mp4' : 'image/jpeg');
        encMedia.push({ src: `media/${encFileName}`, mime, kind: isVideo ? 'video' : 'image' });
        mediaIndex++;
        console.log(`  Media grupo encriptado: ${encFileName} (${isVideo ? 'video' : 'imagen'}, ${(data.length / 1024 / 1024).toFixed(1)}MB)`);
      }
      memory._groupMedia = encMedia;
      delete memory.media;
    }
  }

  // Encrypt header photos (profile pics)
  const headerPhotos = [
    { file: 'photos/she.jpg', mime: 'image/jpeg' },
    { file: 'photos/him.png', mime: 'image/png' },
  ];
  const headerMeta = [];
  for (let i = 0; i < headerPhotos.length; i++) {
    const hp = headerPhotos[i];
    const filePath = path.join(CONTENT_DIR, hp.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  Header foto no encontrada: ${hp.file}`);
      continue;
    }
    // Convert to sRGB
    const tmpFile = path.join(DIST_DIR, `_tmp_header${path.extname(filePath)}`);
    try {
      execSync(`sips -m "/System/Library/ColorSync/Profiles/sRGB Profile.icc" "${filePath}" --out "${tmpFile}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(filePath, tmpFile);
    }
    const data = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);
    const encrypted = encrypt(data, key);
    const encFileName = `header-${i}.enc`;
    fs.writeFileSync(
      path.join(DIST_DIR, 'media', encFileName),
      Buffer.concat([encrypted.iv, encrypted.data])
    );
    headerMeta.push({ src: `media/${encFileName}`, mime: hp.mime });
    console.log(`  Header foto: ${encFileName}`);
  }

  // Encrypt check token (used to verify passphrase)
  const checkToken = encryptToJSON(Buffer.from('booship-ok'), key, salt);

  // Encrypt memories metadata
  const memoriesBuffer = Buffer.from(JSON.stringify(memories), 'utf-8');
  const memoriesEncrypted = encryptToJSON(memoriesBuffer, key, salt);

  // Encrypt header metadata
  const headerEncrypted = encryptToJSON(Buffer.from(JSON.stringify(headerMeta), 'utf-8'), key, salt);

  // Write encrypted data
  const output = {
    check: checkToken,
    header: headerEncrypted,
    memories: memoriesEncrypted,
  };
  fs.writeFileSync(path.join(DIST_DIR, 'data.enc.json'), JSON.stringify(output));

  // Copy assets
  const assetsDir = path.join(__dirname, 'assets');
  if (fs.existsSync(assetsDir)) {
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else { fs.copyFileSync(s, d); console.log(`  Asset: ${entry.name}`); }
      }
    };
    copyDir(assetsDir, path.join(DIST_DIR, 'assets'));
  }

  // Copy static files
  for (const file of ['index.html', 'style.css', 'app.js']) {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST_DIR, file));
      console.log(`  Copiado: ${file}`);
    } else {
      console.warn(`  No encontrado: ${file}`);
    }
  }

  console.log(`\nBuild completado. ${memories.length} recuerdos encriptados en dist/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
