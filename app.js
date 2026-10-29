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

  const state = { user: null, docs: [], category: "All", q: "", sort: "new", view: "grid", mode: "signin", queue: [], editing: null };

  /* ---------- helpers ---------- */
  const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtBytes = (b) => {
    if (!b) return "0 B";
    const u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 4);
    return (b / 1024 ** i).toFixed(i ? 1 : 0).replace(/\.0$/, "") + " " + u[i];
  };
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const ext = (n) => (n.includes(".") ? n.split(".").pop().toUpperCase().slice(0, 4) : "FILE");
  const safeName = (n) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-120);
  const parseTags = (s) => [...new Set(s.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg, err = false) {
    const el = document.createElement("div");
    el.className = "toast" + (err ? " err" : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------- auth ---------- */
  function setMode(mode) {
    state.mode = mode;
    const up = mode === "signup";
    $("#auth-title").textContent = up ? "Start your library." : "Welcome back.";
    $("#auth-sub").textContent = up ? "Create an account — your files stay private to you." : "Sign in to open your private library.";
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
    if (!email || password.length < 8) { msg.textContent = "Enter a valid email and a password of 8+ characters."; return; }
    const btn = $("#auth-submit"); btn.disabled = true;
    try {
      if (state.mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { msg.className = "msg ok"; msg.textContent = "Check your inbox to confirm your email, then sign in."; setMode("signin"); msg.className = "msg ok"; msg.textContent = "Check your inbox to confirm your email, then sign in."; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      msg.textContent = err.message || "Something went wrong.";
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

  function filtered() {
    const q = state.q.toLowerCase();
    let list = state.docs.filter(d =>
      (state.category === "All" || d.category === state.category) &&
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
  function render() {
    // sidebar categories
    const cats = categories();
    const total = state.docs.length;
    $("#cats").innerHTML =
      `<button class="cat ${state.category === "All" ? "on" : ""}" data-c="All"><span>All documents</span><small>${total}</small></button>` +
      [...cats].map(([c, n]) => `<button class="cat ${state.category === c ? "on" : ""}" data-c="${esc(c)}"><span>${esc(c)}</span><small>${n}</small></button>`).join("");
    $$(".cat").forEach(b => b.onclick = () => { state.category = b.dataset.c; $("#side").classList.remove("open"); render(); });

    $("#cat-list").innerHTML = [...cats.keys()].map(c => `<option value="${esc(c)}">`).join("");

    // usage
    const used = state.docs.reduce((a, d) => a + Number(d.size_bytes || 0), 0);
    $("#usage-text").textContent = `${fmtBytes(used)} / ${fmtBytes(cfg.QUOTA_BYTES)}`;
    $("#usage-bar").style.width = Math.min(100, (used / cfg.QUOTA_BYTES) * 100) + "%";

    // list
    const list = filtered();
    $("#list-title").textContent = state.category === "All" ? "All documents" : state.category;
    $("#list-count").textContent = `${list.length} ${list.length === 1 ? "file" : "files"}`;
    const box = $("#docs");
    box.className = "docs " + state.view;
    $("#empty").classList.toggle("hidden", list.length > 0);
    box.innerHTML = list.map((d, i) => `
      <article class="card" data-id="${d.id}" style="animation-delay:${Math.min(i, 12) * 35}ms" tabindex="0">
        <div class="badge">${esc(ext(d.name))}</div>
        <div class="card-body">
          <div class="card-name">${esc(d.name)}</div>
          <div class="meta"><span>${esc(d.category)}</span><span>${fmtBytes(d.size_bytes)}</span><span>${fmtDate(d.created_at)}</span></div>
          ${(d.tags || []).length ? `<div class="tags">${d.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
          ${d.note ? `<div class="note">${esc(d.note)}</div>` : ""}
        </div>
        <div class="actions">
          <button class="icon-btn" data-a="open" title="Open" aria-label="Open">↗</button>
          <button class="icon-btn" data-a="dl" title="Download" aria-label="Download">⬇</button>
          <button class="icon-btn" data-a="edit" title="Edit" aria-label="Edit">✎</button>
          <button class="icon-btn del" data-a="del" title="Delete" aria-label="Delete">🗑</button>
        </div>
      </article>`).join("");
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

  async function openDoc(doc, download) {
    const { data, error } = await sb.storage.from(cfg.BUCKET).createSignedUrl(doc.storage_path, 120, download ? { download: doc.name } : undefined);
    if (error) return toast("Could not open file: " + error.message, true);
    if (download) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = doc.name; document.body.appendChild(a); a.click(); a.remove(); }
    else window.open(data.signedUrl, "_blank", "noopener");
  }

  async function removeDoc(doc) {
    if (!confirm(`Delete "${doc.name}" permanently?`)) return;
    const { error: e1 } = await sb.storage.from(cfg.BUCKET).remove([doc.storage_path]);
    if (e1) return toast("Delete failed: " + e1.message, true);
    const { error: e2 } = await sb.from("documents").delete().eq("id", doc.id);
    if (e2) return toast("Delete failed: " + e2.message, true);
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
    if (error) return toast("Save failed: " + error.message, true);
    Object.assign(d, data); closeEdit(); render(); toast("Saved");
  });

  /* ---------- upload ---------- */
  const dlg = $("#upload-dlg");
  const openUpload = () => { dlg.showModal(); };
  $("#open-upload").onclick = $("#empty-upload").onclick = openUpload;
  $("#up-cancel").onclick = () => dlg.close();

  const drop = $("#drop"), input = $("#file-input");
  drop.onclick = () => input.click();
  drop.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") input.click(); };
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
    if (ok) toast(`${ok} file${ok > 1 ? "s" : ""} added`);
    setTimeout(() => { state.queue = state.queue.filter(q => q.status === "err"); renderQueue(); if (!state.queue.length) dlg.close(); }, 900);
  };

  async function uploadOne(item, category, tags) {
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Session expired — sign in again");
    const used = state.docs.reduce((a, d) => a + Number(d.size_bytes || 0), 0);
    if (used + item.file.size > cfg.QUOTA_BYTES) throw new Error("Storage full");

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
        onError: (e) => reject(new Error(e.message?.includes("413") ? "File exceeds the size limit set in Supabase" : (e.message || "Upload failed"))),
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
  $("#sort").onchange = (e) => { state.sort = e.target.value; render(); };
  const setView = (v) => { state.view = v; $("#v-grid").classList.toggle("on", v === "grid"); $("#v-list").classList.toggle("on", v === "list"); render(); };
  $("#v-grid").onclick = () => setView("grid"); $("#v-list").onclick = () => setView("list");
  $("#menu-btn").onclick = () => $("#side").classList.toggle("open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && state.user) { e.preventDefault(); $("#search").focus(); }
  });
  [dlg, $("#edit-dlg")].forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  setMode("signin");
})();
