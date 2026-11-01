/* Riff Vault — appearance (wood + accent). Runs before the page paints so the saved look has no flash. */
(() => {
  const KEY = "riffvault.look";
  const root = document.documentElement;
  const THEME_COLOR = { rosewood: "#140d0c", ebony: "#0b0b0c", spruce: "#0a1311", maple: "#e8dfcf" };
  const ACCENTS = ["gold", "rose", "emerald", "sky", "violet", "coral"];
  const LEGACY = { midnight: "rosewood", obsidian: "ebony", plum: "spruce", ivory: "maple" }; // earlier theme names
  let look = { theme: "rosewood", accent: "gold" };
  try { look = { ...look, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (_) {}
  look.theme = LEGACY[look.theme] || look.theme;
  if (!THEME_COLOR[look.theme]) look.theme = "rosewood";
  if (!ACCENTS.includes(look.accent)) look.accent = "gold";

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
    if (getComputedStyle(root).getPropertyValue("--rv-css").trim() !== "5") {
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
  });
})();
