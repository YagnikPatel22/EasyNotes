/* Riff Vault — private document library (Supabase auth + storage + Postgres) */
(() => {
  const cfg = window.APP_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  if (!cfg || cfg.SUPABASE_URL.includes("YOUR-PROJECT") || cfg.SUPABASE_ANON_KEY.includes("YOUR-ANON")) {
    $("#setup-warn").classList.remove("hidden");
    return;
  }

  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  const state = {
    user: null, docs: [], category: "All", tag: null, q: "", sort: "new",
    view: store.get("riffvault.view", "grid") === "list" ? "list" : "grid",
    mode: "signin", queue: [], editing: null, firstPaint: true
  };

  /* ---------- helpers ---------- */
  const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBytes = (b) => {
    if (!b) return "0 B";
    const u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 4);
    return (b / 1024 ** i).toFixed(i ? 1 : 0).replace(/\.0$/, "") + " " + u[i];
  };
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const ext = (n) => (n.includes(".") ? n.split(".").pop().toLowerCase().slice(0, 4) : "file");
  const safeName = (n) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-120);
  const parseTags = (s) => [...new Set(s.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function toast(msg, err = false) {
    const el = document.createElement("div");
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------- engraved cover art (unique per document) ---------- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function art(d) {
    const r = mulberry(hash(String(d.id || "") + d.name));
    const y0 = 62 + Math.floor(r() * 34);              // top staff line
    const n = 6 + Math.floor(r() * 3);                 // number of notes
    let staff = "", notes = "";
    for (let k = 0; k < 5; k++) staff += `<line x1="20" x2="180" y1="${y0 + k * 12}" y2="${y0 + k * 12}"/>`;
    staff += `<line x1="20" x2="20" y1="${y0}" y2="${y0 + 48}"/><line x1="180" x2="180" y1="${y0}" y2="${y0 + 48}"/>`;
    for (let i = 0; i < n; i++) {
      const x = 40 + i * (120 / (n - 1));
      const y = y0 + 54 - Math.floor(r() * 11) * 6;    // 11 steps from below the staff to above it
      const up = y >= y0 + 24;
      notes += `<ellipse cx="${x.toFixed(1)}" cy="${y}" rx="6.2" ry="4.6" transform="rotate(-20 ${x.toFixed(1)} ${y})"/>` +
        (up ? `<line x1="${(x + 5.4).toFixed(1)}" x2="${(x + 5.4).toFixed(1)}" y1="${y}" y2="${y - 30}"/>`
            : `<line x1="${(x - 5.4).toFixed(1)}" x2="${(x - 5.4).toFixed(1)}" y1="${y}" y2="${y + 30}"/>`);
    }
    return `<svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
      `<g class="st">${staff}</g><g class="nh">${notes}</g><text class="ex" x="18" y="228">${esc(ext(d.name))}</text></svg>`;
  }

  /* ---------- auth ---------- */
  function setMode(mode) {
    state.mode = mode;
    const up = mode === "signup";
    $("#auth-title").textContent = up ? "Create your account" : "Welcome back";
    $("#auth-sub").textContent = up ? "Only you can open what you add." : "Sign in to open your library.";
    $("#auth-submit").textContent = up ? "Create account" : "Sign in";
    $("#switch-text").textContent = up ? "Already have an account?" : "New here?";
    $("#switch-btn").textContent = up ? "Sign in" : "Create an account";
    $("#password").autocomplete = up ? "new-password" : "current-password";
    $("#auth-msg").textContent = "";
  }

  $("#switch-btn").onclick = () => setMode(state.mode === "signin" ? "signup" : "signin");

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#auth-msg"); msg.className = "msg"; msg.textContent = "";
    const email = $("#email").value.trim(), password = $("#password").value;
    if (!email || password.length < 8) { msg.textContent = "Enter your email and a password with at least 8 characters."; return; }
    const btn = $("#auth-submit"); btn.disabled = true;
    try {
      if (state.mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { setMode("signin"); msg.className = "msg ok"; msg.textContent = "Check your inbox to confirm your email, then sign in."; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      msg.textContent = err.message || "Something went wrong. Try again.";
    } finally { btn.disabled = false; }
  });

  $("#signout").onclick = async () => { await sb.auth.signOut(); };

  sb.auth.onAuthStateChange((_evt, session) => {
    const user = session?.user || null;
    if (user?.id === state.user?.id && user) return; // token refresh etc.
    state.user = user;
    if (user) enterApp(); else leaveApp();
  });

  (async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) leaveApp();
  })();

  function leaveApp() {
    state.docs = [];
    $("#app-view").classList.add("hidden");
    $("#auth-view").classList.remove("hidden");
    $("#password").value = "";
  }

  async function enterApp() {
    $("#auth-view").classList.add("hidden");
    $("#app-view").classList.remove("hidden");
    $("#who-mail").textContent = state.user.email;
    $("#avatar").textContent = (state.user.email || "U")[0].toUpperCase();
    $("#max-size").textContent = fmtBytes(cfg.MAX_FILE_BYTES);
    state.firstPaint = true;
    await loadDocs();
  }

  /* ---------- data ---------- */
  async function loadDocs() {
    const { data, error } = await sb.from("documents").select("*").order("created_at", { ascending: false });
    if (error) { toast("Could not load documents: " + error.message, true); return; }
    state.docs = data || [];
    render();
  }

  function categories() {
    const set = new Map();
    cfg.DEFAULT_CATEGORIES.forEach(c => set.set(c, 0));
    state.docs.forEach(d => set.set(d.category, (set.get(d.category) || 0) + 1));
    return set;
  }

  const inCategory = () => state.docs.filter(d => state.category === "All" || d.category === state.category);

  function filtered() {
    const q = state.q.toLowerCase();
    const list = inCategory().filter(d =>
      (!state.tag || (d.tags || []).includes(state.tag)) &&
      (!q || [d.name, d.category, d.note || "", (d.tags || []).join(" ")].join(" ").toLowerCase().includes(q)));
    const s = state.sort;
    list.sort((a, b) =>
      s === "old" ? new Date(a.created_at) - new Date(b.created_at) :
      s === "name" ? a.name.localeCompare(b.name) :
      s === "size" ? b.size_bytes - a.size_bytes :
      new Date(b.created_at) - new Date(a.created_at));
    return list;
  }

  /* ---------- render ---------- */
  const ICON = {
    open: '<path d="M7 17 17 7M8 7h9v9"/>',
    dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4"/>',
    del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'
  };
  const iconBtn = (a, label, cls = "") =>
    `<button class="icon-btn ${cls}" data-a="${a}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[a]}</svg></button>`;

  function render() {
    // categories
    const cats = categories();
    $("#cats").innerHTML =
      `<button class="cat ${state.category === "All" ? "on" : ""}" data-c="All"><span>All documents</span><small>${state.docs.length}</small></button>` +
      [...cats].map(([c, n]) => `<button class="cat ${state.category === c ? "on" : ""}" data-c="${esc(c)}"><span>${esc(c)}</span><small>${n}</small></button>`).join("");
    $$(".cat").forEach(b => b.onclick = () => { state.category = b.dataset.c; state.tag = null; $("#side").classList.remove("open"); render(); });
    $("#cat-list").innerHTML = [...cats.keys()].map(c => `<option value="${esc(c)}">`).join("");

    // storage
    const used = state.docs.reduce((a, d) => a + Number(d.size_bytes || 0), 0);
    $("#usage-text").textContent = `${fmtBytes(used)} of ${fmtBytes(cfg.QUOTA_BYTES)}`;
    $("#usage-bar").style.width = Math.min(100, (used / cfg.QUOTA_BYTES) * 100) + "%";

    // tag chips (from the current category)
    const counts = new Map();
    inCategory().forEach(d => (d.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    if (state.tag && !counts.has(state.tag)) state.tag = null;
    $("#tagrow").innerHTML = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([t]) => `<button class="tagf ${state.tag === t ? "on" : ""}" data-t="${esc(t)}">#${esc(t)}</button>`).join("");

    // heading
    const list = filtered();
    const total = list.reduce((a, d) => a + Number(d.size_bytes || 0), 0);
    $("#list-title").textContent = state.category === "All" ? "All documents" : state.category;
    $("#list-count").textContent = list.length ? `${plural(list.length, "file")}, ${fmtBytes(total)}` : "";

    // view
    const isList = state.view === "list";
    $("#colhead").classList.toggle("hidden", !isList || !list.length);
    $("#v-grid").classList.toggle("on", !isList);
    $("#v-list").classList.toggle("on", isList);

    // empty state
    const empty = list.length === 0;
    const library = state.docs.length === 0;
    $("#empty").classList.toggle("hidden", !empty);
    $("#empty-title").textContent = library ? "Your library is empty" : "Nothing matches";
    $("#empty-text").textContent = library
      ? `Add chord charts, tabs or theory notes. Files can be up to ${fmtBytes(cfg.MAX_FILE_BYTES)}.`
      : "Try a different search, or clear the filters to see everything.";
    $("#empty-upload").classList.toggle("hidden", !library);
    $("#empty-clear").classList.toggle("hidden", library);

    // documents
    const box = $("#docs");
    box.className = "docs " + state.view + (state.firstPaint ? " enter" : "");
    box.innerHTML = list.map((d, i) => `
      <article class="card" data-id="${d.id}" style="--d:${Math.min(i, 12) * 45}ms" tabindex="0" title="${esc(d.name)}">
        <div class="cover">${art(d)}</div>
        <div class="info">
          <div class="card-name">${esc(d.name)}</div>
          ${(d.tags || []).length ? `<div class="card-tags">${d.tags.map(t => "#" + esc(t)).join("  ")}</div>` : ""}
          <div class="sub-line"><span>${esc(d.category)}</span><span>${fmtBytes(d.size_bytes)}</span></div>
          ${d.note ? `<div class="note">${esc(d.note)}</div>` : ""}
        </div>
        <span class="c-cat">${esc(d.category)}</span><span class="c-size">${fmtBytes(d.size_bytes)}</span><span class="c-date">${fmtDate(d.created_at)}</span>
        <div class="actions">${iconBtn("open", "Open")}${iconBtn("dl", "Download")}${iconBtn("edit", "Edit details")}${iconBtn("del", "Delete", "del")}</div>
      </article>`).join("");
    state.firstPaint = false;
  }

  $("#docs").addEventListener("click", (e) => {
    const card = e.target.closest(".card"); if (!card) return;
    const doc = state.docs.find(d => d.id === card.dataset.id);
    const act = e.target.closest("[data-a]")?.dataset.a || "open";
    if (act === "open") openDoc(doc, false);
    if (act === "dl") openDoc(doc, true);
    if (act === "edit") openEdit(doc);
    if (act === "del") removeDoc(doc);
  });
  $("#docs").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) e.target.click(); });

  $("#tagrow").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    state.tag = state.tag === b.dataset.t ? null : b.dataset.t; render();
  });
  $("#empty-clear").onclick = () => { state.q = ""; state.tag = null; $("#search").value = ""; render(); };

  async function openDoc(doc, download) {
    const { data, error } = await sb.storage.from(cfg.BUCKET).createSignedUrl(doc.storage_path, 120, download ? { download: doc.name } : undefined);
    if (error) return toast("Could not open the file: " + error.message, true);
    if (download) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = doc.name; document.body.appendChild(a); a.click(); a.remove(); }
    else window.open(data.signedUrl, "_blank", "noopener");
  }

  async function removeDoc(doc) {
    if (!confirm(`Delete "${doc.name}" permanently?`)) return;
    const { error: e1 } = await sb.storage.from(cfg.BUCKET).remove([doc.storage_path]);
    if (e1) return toast("Could not delete the file: " + e1.message, true);
    const { error: e2 } = await sb.from("documents").delete().eq("id", doc.id);
    if (e2) return toast("Could not delete the file: " + e2.message, true);
    state.docs = state.docs.filter(d => d.id !== doc.id);
    render(); toast("Deleted");
  }

  /* ---------- edit ---------- */
  function openEdit(doc) {
    state.editing = doc;
    $("#ed-name").value = doc.name; $("#ed-cat").value = doc.category;
    $("#ed-tags").value = (doc.tags || []).join(", "); $("#ed-note").value = doc.note || "";
    $("#edit-dlg").showModal();
  }
  const closeEdit = () => $("#edit-dlg").close();
  $("#edit-x").onclick = $("#edit-cancel").onclick = closeEdit;
  $("#edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = state.editing;
    const patch = { name: $("#ed-name").value.trim() || d.name, category: $("#ed-cat").value.trim() || "Other", tags: parseTags($("#ed-tags").value), note: $("#ed-note").value.trim() || null };
    const { data, error } = await sb.from("documents").update(patch).eq("id", d.id).select().single();
    if (error) return toast("Could not save changes: " + error.message, true);
    Object.assign(d, data); closeEdit(); render(); toast("Changes saved");
  });

  /* ---------- upload ---------- */
  const dlg = $("#upload-dlg");
  const openUpload = () => { dlg.showModal(); };
  $("#open-upload").onclick = $("#empty-upload").onclick = openUpload;
  $("#up-cancel").onclick = () => dlg.close();

  const drop = $("#drop"), input = $("#file-input");
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  input.onchange = () => { addToQueue([...input.files]); input.value = ""; };
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => addToQueue([...e.dataTransfer.files]));
  // allow dropping anywhere on the page
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => { if (!state.user || e.target.closest("#drop")) return; e.preventDefault(); if (!dlg.open) dlg.showModal(); addToQueue([...e.dataTransfer.files]); });

  function addToQueue(files) {
    for (const f of files) {
      const item = { file: f, status: "ready", pct: 0, id: crypto.randomUUID() };
      if (f.size > cfg.MAX_FILE_BYTES) { item.status = "err"; item.msg = `Over ${fmtBytes(cfg.MAX_FILE_BYTES)}`; }
      state.queue.push(item);
    }
    renderQueue();
  }

  function renderQueue() {
    $("#queue").innerHTML = state.queue.map(q => `
      <li class="q ${q.status === "done" ? "done" : q.status === "err" ? "err" : ""}" data-id="${q.id}">
        <div class="q-top"><span>${esc(q.file.name)}</span><span>${q.status === "err" ? esc(q.msg || "Failed") : q.status === "done" ? "Done" : fmtBytes(q.file.size)}</span></div>
        <div class="bar"><i style="width:${q.pct}%"></i></div>
      </li>`).join("");
    $("#up-start").disabled = !state.queue.some(q => q.status === "ready");
  }

  $("#up-start").onclick = async () => {
    const btn = $("#up-start"); btn.disabled = true;
    const category = $("#up-cat").value.trim() || "Other";
    const tags = parseTags($("#up-tags").value);
    for (const item of state.queue.filter(q => q.status === "ready")) {
      item.status = "uploading"; renderQueue();
      try {
        await uploadOne(item, category, tags);
        item.status = "done"; item.pct = 100;
      } catch (err) {
        item.status = "err"; item.msg = err.message || "Failed";
      }
      renderQueue();
    }
    await loadDocs();
    const ok = state.queue.filter(q => q.status === "done").length;
    if (ok) toast(`${plural(ok, "file")} added`);
    setTimeout(() => { state.queue = state.queue.filter(q => q.status === "err"); renderQueue(); if (!state.queue.length) dlg.close(); }, 900);
  };

  async function uploadOne(item, category, tags) {
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Session expired. Sign in again.");
    const used = state.docs.reduce((a, d) => a + Number(d.size_bytes || 0), 0);
    if (used + item.file.size > cfg.QUOTA_BYTES) throw new Error("Storage is full");

    const f = item.file;
    const path = `${state.user.id}/${crypto.randomUUID()}-${safeName(f.name)}`;

    await new Promise((resolve, reject) => {
      const up = new tus.Upload(f, {
        endpoint: `${cfg.SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${token}`, apikey: cfg.SUPABASE_ANON_KEY, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024, // Supabase requires 6 MB chunks
        metadata: { bucketName: cfg.BUCKET, objectName: path, contentType: f.type || "application/octet-stream", cacheControl: "3600" },
        onError: (e) => reject(new Error(e.message?.includes("413") ? "File is over the size limit set in Supabase" : (e.message || "Upload failed"))),
        onProgress: (sent, total) => {
          item.pct = Math.round((sent / total) * 100);
          const li = $(`.q[data-id="${item.id}"] .bar i`); if (li) li.style.width = item.pct + "%";
        },
        onSuccess: resolve
      });
      up.findPreviousUploads().then(prev => { if (prev.length) up.resumeFromPreviousUpload(prev[0]); up.start(); });
    });

    const { error } = await sb.from("documents").insert({
      user_id: state.user.id, name: f.name, category, tags,
      storage_path: path, size_bytes: f.size, mime_type: f.type || null
    });
    if (error) { await sb.storage.from(cfg.BUCKET).remove([path]); throw error; }
  }

  /* ---------- toolbar ---------- */
  $("#search").addEventListener("input", debounce(e => { state.q = e.target.value; render(); }));
  $("#search").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; state.q = ""; e.target.blur(); render(); } });
  $("#sort").onchange = (e) => { state.sort = e.target.value; render(); };
  const setView = (v) => { state.view = v; store.set("riffvault.view", v); render(); };
  $("#v-grid").onclick = () => setView("grid"); $("#v-list").onclick = () => setView("list");
  $("#menu-btn").onclick = (e) => { e.stopPropagation(); $("#side").classList.toggle("open"); };
  $("#main").addEventListener("click", () => $("#side").classList.remove("open"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && state.user) { e.preventDefault(); $("#search").focus(); }
  });
  [dlg, $("#edit-dlg")].forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  setMode("signin");
})();
