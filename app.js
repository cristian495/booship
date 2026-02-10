(function () {
  const PBKDF2_ITERATIONS = 100_000;

  const $ = (sel) => document.querySelector(sel);

  async function deriveKey(passphrase, saltB64) {
    const salt = base64ToBuffer(saltB64);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  }

  async function decryptData(encObj, key) {
    const iv = base64ToBuffer(encObj.iv);
    const data = base64ToBuffer(encObj.data);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  }

  async function decryptBinary(buffer, key) {
    // Format: iv (12 bytes) + ciphertext+authTag
    const iv = buffer.slice(0, 12);
    const data = buffer.slice(12);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  }

  function base64ToBuffer(b64) {
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf.buffer;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("es", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function cloneTemplate(id) {
    return document.getElementById(id).content.cloneNode(true)
      .firstElementChild;
  }

  let tiltIndex = 0;
  function addTilt(card) {
    tiltIndex++;
    const tiltClass = `card-tilt-${((tiltIndex - 1) % 6) + 1}`;
    card.classList.add(tiltClass);
  }

  function renderMemory(memory) {
    if (memory.type === "quote") {
      const card = cloneTemplate("tpl-quote");
      card.querySelector(".quote-text").textContent = memory.text;
      card.querySelector(".quote-author").textContent = memory.author
        ? `\u2014 ${memory.author}`
        : "";
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      return card;
    }

    if (memory.type === "group") {
      const card = cloneTemplate("tpl-group");
      card.querySelector(".card-title").textContent = memory.title || "";
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      card.querySelector(".card-description").textContent =
        memory.description || "";
      if (memory._groupPhotos && memory._groupPhotos.length > 0) {
        const stack = card.querySelector(".group-stack");
        const hint = document.createElement("div");
        hint.className = "group-hint";
        hint.textContent = `Touch to see more (${memory._groupPhotos.length} photos)`;
        stack.before(hint);

        memory._groupPhotos.forEach((gp, i) => {
          const polaroid = document.createElement("div");
          polaroid.className = "group-polaroid";
          const placeholder = document.createElement("div");
          placeholder.className = "photo-placeholder";
          placeholder.textContent = "Cargando...";
          placeholder.id = `group-${Math.random().toString(36).slice(2)}`;
          if (gp.fit) placeholder.dataset.fit = gp.fit;
          polaroid.appendChild(placeholder);
          const pad = document.createElement("div");
          pad.className = "polaroid-pad";
          polaroid.appendChild(pad);
          stack.appendChild(polaroid);
          gp._placeholderId = placeholder.id;
          if (i === memory._groupPhotos.length - 1)
            polaroid.classList.add("on-top");
        });
        // Click to cycle
        stack.addEventListener("click", () => {
          const polaroids = stack.querySelectorAll(".group-polaroid");
          const topOne = stack.querySelector(".on-top");
          if (topOne) topOne.classList.remove("on-top");
          // Move top to back
          const arr = Array.from(polaroids);
          const topIndex = arr.indexOf(topOne);
          const nextIndex = (topIndex - 1 + arr.length) % arr.length;
          arr[nextIndex].classList.add("on-top");
        });
      }
      return card;
    }

    if (memory.type === "message") {
      const card = cloneTemplate("tpl-message");
      card.querySelector(".message-text").textContent = memory.text;
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      if (memory.layout === "wide") card.classList.add("card-wide");
      return card;
    }

    if (memory.type === "media-group") {
      const card = cloneTemplate("tpl-video-group");
      card.querySelector(".card-title").textContent = memory.title || "";
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      card.querySelector(".card-description").textContent =
        memory.description || "";
      if (memory._groupMedia && memory._groupMedia.length > 0) {
        const list = card.querySelector(".video-group-list");
        memory._groupMedia.forEach((gm) => {
          const placeholder = document.createElement("div");
          placeholder.className = "photo-placeholder";
          placeholder.textContent = gm.kind === "video" ? "Cargando video..." : "Cargando foto...";
          placeholder.id = `mgroup-${Math.random().toString(36).slice(2)}`;
          placeholder.dataset.kind = gm.kind;
          list.appendChild(placeholder);
          gm._placeholderId = placeholder.id;
        });
      }
      return card;
    }

    if (memory.type === "video") {
      const card = cloneTemplate("tpl-video");
      card.querySelector(".card-title").textContent = memory.title || "";
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      card.querySelector(".card-description").textContent =
        memory.description || "";
      addTilt(card);
      if (memory.video) {
        const placeholder = card.querySelector(".photo-placeholder");
        const videoId = `video-${Math.random().toString(36).slice(2)}`;
        placeholder.id = videoId;
        memory._videoPlaceholderId = videoId;
      }
      if (memory._decorations && memory._decorations.length > 0) {
        card.classList.add("card-has-decos");
        memory._decorations.forEach((deco, i) => {
          const decoEl = document.createElement("div");
          decoEl.className = "card-deco";
          decoEl.id = `deco-${Math.random().toString(36).slice(2)}`;
          decoEl.dataset.decoIndex = i;
          const positions = [
            { top: "-25px", right: "-20px", rotate: "15deg" },
            { bottom: "-25px", left: "-20px", rotate: "-10deg" },
            { top: "-20px", left: "-25px", rotate: "-20deg" },
            { bottom: "-20px", right: "-25px", rotate: "10deg" },
          ];
          const pos = positions[i % positions.length];
          Object.assign(decoEl.style, {
            position: "absolute",
            zIndex: "2",
            width: "70px",
            height: "140px",
            ...pos,
            transform: `rotate(${pos.rotate})`,
          });
          delete decoEl.style.rotate;
          card.appendChild(decoEl);
          deco._placeholderId = decoEl.id;
        });
      }
      return card;
    }

    if (memory.type === "photo") {
      const card = cloneTemplate("tpl-photo");
      card.querySelector(".card-title").textContent = memory.title || "";
      card.querySelector(".card-date").textContent = formatDate(memory.date);
      card.querySelector(".card-description").textContent =
        memory.description || "";
      if (memory.layout === "wide") card.classList.add("card-wide");
      if (memory.layout === "heart") {
        card.classList.add("card-heart");
        card.classList.remove("card-polaroid");
      }
      addTilt(card);
      if (memory.photo) {
        const placeholder = card.querySelector(".photo-placeholder");
        const photoId = `photo-${Math.random().toString(36).slice(2)}`;
        placeholder.id = photoId;
        if (memory.fit) placeholder.dataset.fit = memory.fit;
        memory._photoPlaceholderId = photoId;
      }
      // Add decoration placeholders
      if (memory._decorations && memory._decorations.length > 0) {
        card.classList.add("card-has-decos");
        memory._decorations.forEach((deco, i) => {
          const decoEl = document.createElement("div");
          decoEl.className = "card-deco";
          decoEl.id = `deco-${Math.random().toString(36).slice(2)}`;
          decoEl.dataset.decoIndex = i;
          // Position around the card edges
          const isHeart = memory.layout === "heart";
          const positions = isHeart
            ? [
                { top: "0px", right: "-15px", rotate: "15deg" },
                { top: "0px", left: "-15px", rotate: "-15deg" },
                { top: "40%", right: "-20px", rotate: "10deg" },
                { top: "40%", left: "-20px", rotate: "-10deg" },
              ]
            : [
                { top: "-25px", right: "-20px", rotate: "15deg" },
                { bottom: "-25px", left: "-20px", rotate: "-10deg" },
                { top: "-20px", left: "-25px", rotate: "-20deg" },
                { bottom: "-20px", right: "-25px", rotate: "10deg" },
              ];
          const pos = positions[i % positions.length];
          Object.assign(decoEl.style, {
            position: "absolute",
            zIndex: "2",
            width: "70px",
            height: "140px",
            ...pos,
            transform: `rotate(${pos.rotate})`,
          });
          delete decoEl.style.rotate;
          card.appendChild(decoEl);
          deco._placeholderId = decoEl.id;
        });
      }
      return card;
    }

    const card = cloneTemplate("tpl-memory");
    card.querySelector(".card-title").textContent = memory.title || "";
    card.querySelector(".card-date").textContent = formatDate(memory.date);
    card.querySelector(".card-description").textContent =
      memory.description || "";
    if (memory.layout === "wide") card.classList.add("card-wide");
    return card;
  }

  async function loadMedia(memory, key) {
    const isVideo = memory.type === "video";
    const src = isVideo ? memory.video : memory.photo;
    const placeholderId = isVideo
      ? memory._videoPlaceholderId
      : memory._photoPlaceholderId;
    if (!src || !placeholderId) return;
    try {
      const resp = await fetch(src);
      const encBuffer = await resp.arrayBuffer();
      const decrypted = await decryptBinary(encBuffer, key);
      const mime = memory._mime || (isVideo ? "video/mp4" : "image/jpeg");
      const blob = new Blob([decrypted], { type: mime });
      const url = URL.createObjectURL(blob);
      const placeholder = document.getElementById(placeholderId);
      if (!placeholder) return;
      if (isVideo) {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        placeholder.replaceWith(video);
      } else {
        const img = document.createElement("img");
        img.src = url;
        img.alt = memory.title || "Foto";
        if (placeholder.dataset.fit) img.style.objectFit = placeholder.dataset.fit;
        placeholder.replaceWith(img);
      }
    } catch {
      const placeholder = document.getElementById(placeholderId);
      if (placeholder)
        placeholder.textContent = isVideo
          ? "Error al cargar video"
          : "Error al cargar foto";
    }
  }

  $("#unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const passphrase = $("#passphrase").value;
    if (!passphrase) return;

    const btn = $("#unlock-form button");
    const errorMsg = $("#error-msg");
    btn.disabled = true;
    btn.textContent = "Descifrando...";
    errorMsg.hidden = true;

    try {
      const resp = await fetch("data.enc.json");
      const encData = await resp.json();

      const key = await deriveKey(passphrase, encData.check.salt);

      try {
        const checkBuf = await decryptData(encData.check, key);
        const checkStr = new TextDecoder().decode(checkBuf);
        if (checkStr !== "booship-ok") throw new Error("bad check");
      } catch {
        errorMsg.hidden = false;
        btn.disabled = false;
        btn.textContent = "Desbloquear";
        return;
      }

      const memoriesBuf = await decryptData(encData.memories, key);
      const memories = JSON.parse(new TextDecoder().decode(memoriesBuf));

      $("#lock-screen").hidden = true;
      $("#memories-screen").hidden = false;

      // Load header photos
      if (encData.header) {
        const headerBuf = await decryptData(encData.header, key);
        const headerPhotos = JSON.parse(new TextDecoder().decode(headerBuf));
        for (let i = 0; i < headerPhotos.length; i++) {
          const hp = headerPhotos[i];
          try {
            const resp = await fetch(hp.src);
            const encBuffer = await resp.arrayBuffer();
            const decrypted = await decryptBinary(encBuffer, key);
            const blob = new Blob([decrypted], { type: hp.mime });
            const url = URL.createObjectURL(blob);
            const container = document.getElementById(`header-photo-${i}`);
            if (container) {
              const img = document.createElement("img");
              img.src = url;
              img.alt = "";
              container.appendChild(img);
            }
          } catch {
            /* skip */
          }
        }
      }

      const grid = $("#memories-grid");
      for (const memory of memories) {
        grid.appendChild(renderMemory(memory));
      }

      // Load media (photos + videos + groups) in parallel
      const mediaPromises = memories
        .filter(
          (m) =>
            (m.type === "photo" && m.photo) || (m.type === "video" && m.video),
        )
        .map((m) => loadMedia(m, key));

      // Load group photos
      for (const memory of memories) {
        if (memory.type !== "group" || !memory._groupPhotos) continue;
        for (const gp of memory._groupPhotos) {
          if (!gp._placeholderId || !gp.src) continue;
          mediaPromises.push(
            (async () => {
              try {
                const resp = await fetch(gp.src);
                const encBuffer = await resp.arrayBuffer();
                const decrypted = await decryptBinary(encBuffer, key);
                const blob = new Blob([decrypted], { type: gp.mime });
                const url = URL.createObjectURL(blob);
                const placeholder = document.getElementById(gp._placeholderId);
                if (placeholder) {
                  const img = document.createElement("img");
                  img.src = url;
                  if (placeholder.dataset.fit) img.style.objectFit = placeholder.dataset.fit;
                  placeholder.replaceWith(img);
                }
              } catch {
                /* skip */
              }
            })(),
          );
        }
      }

      // Load media-group items (photos + videos)
      for (const memory of memories) {
        if (memory.type !== "media-group" || !memory._groupMedia) continue;
        for (const gm of memory._groupMedia) {
          if (!gm._placeholderId || !gm.src) continue;
          mediaPromises.push(
            (async () => {
              try {
                const resp = await fetch(gm.src);
                const encBuffer = await resp.arrayBuffer();
                const decrypted = await decryptBinary(encBuffer, key);
                const blob = new Blob([decrypted], { type: gm.mime });
                const url = URL.createObjectURL(blob);
                const placeholder = document.getElementById(gm._placeholderId);
                if (placeholder) {
                  if (gm.kind === "video") {
                    const video = document.createElement("video");
                    video.src = url;
                    video.controls = true;
                    video.playsInline = true;
                    video.preload = "metadata";
                    placeholder.replaceWith(video);
                  } else {
                    const img = document.createElement("img");
                    img.src = url;
                    img.alt = memory.title || "Foto";
                    placeholder.replaceWith(img);
                  }
                }
              } catch {
                /* skip */
              }
            })(),
          );
        }
      }

      await Promise.all(mediaPromises);

      // Load decorations
      const decoPromises = [];
      for (const memory of memories) {
        if (!memory._decorations) continue;
        for (const deco of memory._decorations) {
          if (!deco._placeholderId || !deco.src) continue;
          decoPromises.push(
            (async () => {
              try {
                const resp = await fetch(deco.src);
                const encBuffer = await resp.arrayBuffer();
                const decrypted = await decryptBinary(encBuffer, key);
                const blob = new Blob([decrypted], { type: deco.mime });
                const url = URL.createObjectURL(blob);
                const container = document.getElementById(deco._placeholderId);
                if (container) {
                  const img = document.createElement("img");
                  img.src = url;
                  img.style.width = "100%";
                  img.style.height = "100%";
                  img.style.objectFit = "contain";
                  container.appendChild(img);
                }
              } catch {
                /* skip */
              }
            })(),
          );
        }
      }
      await Promise.all(decoPromises);
    } catch (err) {
      console.error(err);
      errorMsg.hidden = false;
      btn.disabled = false;
      btn.textContent = "Desbloquear";
    }
  });
})();
