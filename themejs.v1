/* Riff Vault — appearance (theme + accent) and card spotlight.
   Runs before app.js so the saved look is applied with no flash. */
(() => {
  const KEY = "riffvault.look";
  const root = document.documentElement;
  const THEME_COLOR = { midnight: "#0b0b0e", obsidian: "#000000", ivory: "#f5f1e8", plum: "#0f0a16" };
  let look = { theme: "midnight", accent: "gold" };
  try { look = { ...look, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (_) {}
  if (!THEME_COLOR[look.theme]) look.theme = "midnight";

  function mark() {
    document.querySelectorAll("[data-theme-opt]").forEach(b => {
      const on = b.dataset.themeOpt === look.theme; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
    document.querySelectorAll("[data-accent-opt]").forEach(b => {
      const on = b.dataset.accentOpt === look.accent; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
  }
  function apply() {
    root.dataset.theme = look.theme;
    root.dataset.accent = look.accent;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = THEME_COLOR[look.theme];
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (_) {}
    mark();
  }
  apply();

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    // warn if an old style.css is being served (mismatched file versions)
    if (getComputedStyle(root).getPropertyValue("--rv-css").trim() !== "4") {
      const w = document.createElement("div");
      w.textContent = "Riff Vault: style.css is out of date. Upload the latest style.css, then hard-refresh (Cmd+Shift+R).";
      w.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:999;padding:10px 16px;background:#7a2d24;color:#fff;font:500 13px system-ui;text-align:center";
      document.body.appendChild(w);
    }
    const btn = document.getElementById("look-btn"), pop = document.getElementById("look-pop");
    const toggle = (open) => { pop.classList.toggle("hidden", !open); btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(pop.classList.contains("hidden")); });
    pop.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = e.target.closest("[data-theme-opt]"), a = e.target.closest("[data-accent-opt]");
      if (t) { look.theme = t.dataset.themeOpt; apply(); }
      if (a) { look.accent = a.dataset.accentOpt; apply(); }
    });
    document.addEventListener("click", () => toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });

    // soft spotlight that follows the cursor on cards
    document.addEventListener("pointermove", (e) => {
      const c = e.target.closest?.(".card"); if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });

    // decorative waveform on the sign-in card
    const w = document.getElementById("wave");
    if (w) for (let i = 0; i < 44; i++) {
      const b = document.createElement("i");
      b.style.animationDelay = (-Math.random() * 2.4).toFixed(2) + "s";
      b.style.animationDuration = (1.6 + Math.random() * 1.6).toFixed(2) + "s";
      w.appendChild(b);
    }
  });
})();
