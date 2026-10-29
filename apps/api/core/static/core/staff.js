/* UPNEXT staff site behaviour: navigation drawer, theme switch, menus, search suggestions.
   No framework and no inline handlers (staff CSP: scripts from this origin only). Every control also works as
   a plain link or form without this file, except the theme switch and the drawer button. */
(function () {
  "use strict";

  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---- theme ------------------------------------------------------------------------------------------ */
  var themeButton = $("[data-theme-toggle]");
  function currentTheme() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function syncThemeButton() {
    if (!themeButton) return;
    var dark = currentTheme() === "dark";
    themeButton.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    themeButton.setAttribute("aria-pressed", dark ? "true" : "false");
  }
  if (themeButton) {
    syncThemeButton();
    themeButton.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        if (next === "dark") window.localStorage.setItem("upnext-theme", "dark");
        else window.localStorage.removeItem("upnext-theme");
      } catch (e) { /* the choice then lasts for this page view only */ }
      syncThemeButton();
    });
  }

  /* ---- navigation drawer (below 1100px the sidebar is a drawer) ---------------------------------------- */
  var sidebar = $("#staff-sidebar");
  var scrim = $(".scrim");
  var opener = $("[data-drawer-open]");
  var shell = $(".shell");
  var desktop = window.matchMedia("(min-width: 1100px)");
  function setDrawer(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("is-open", open);
    if (scrim) scrim.hidden = !open;
    if (opener) opener.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("drawer-open", open);
    if (shell) {
      if (open) shell.setAttribute("inert", ""); else shell.removeAttribute("inert");
    }
    if (open) {
      var first = $(".nav-item", sidebar) || $("a", sidebar);
      if (first) window.setTimeout(function () { first.focus(); }, 30); /* after the drawer is visible */
    } else if (opener && document.activeElement !== opener && !desktop.matches) {
      opener.focus();
    }
  }
  if (opener) opener.addEventListener("click", function () { setDrawer(true); });
  $$("[data-drawer-close]").forEach(function (el) { el.addEventListener("click", function () { setDrawer(false); }); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar && sidebar.classList.contains("is-open")) setDrawer(false);
  });
  if (desktop.addEventListener) {
    desktop.addEventListener("change", function () { if (desktop.matches) setDrawer(false); });
  }

  /* ---- menus (<details data-menu>) --------------------------------------------------------------------- */
  var menus = $$("details[data-menu]");
  function closeMenus(except, restoreFocus) {
    menus.forEach(function (m) {
      if (m !== except && m.open) {
        m.open = false;
        if (restoreFocus) { var s = $("summary", m); if (s) s.focus(); }
      }
    });
  }
  menus.forEach(function (m) {
    m.addEventListener("toggle", function () { if (m.open) closeMenus(m, false); });
  });
  document.addEventListener("click", function (e) {
    menus.forEach(function (m) { if (m.open && !m.contains(e.target)) m.open = false; });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenus(null, true);
  });

  /* ---- changelist filters: collapsed unless a filter is in use ------------------------------------------- */
  $$("#changelist-filter details").forEach(function (d) {
    var chosen = $$("li.selected", d).some(function (li) { return li.previousElementSibling !== null; });
    d.open = chosen;
  });

  /* ---- changelists on phones: label every cell with its column heading (cards, see staff.css) ----------- */
  $$("#result_list").forEach(function (table) {
    var heads = $$("thead th", table).map(function (th) { return (th.textContent || "").trim(); });
    $$("tbody tr", table).forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (cell, i) {
        if (cell.tagName === "TD" && heads[i]) cell.setAttribute("data-label", heads[i]);
      });
    });
  });

  /* ---- search suggestions ------------------------------------------------------------------------------ */
  var form = $(".search");
  var input = form && $("input[name=q]", form);
  var box = form && $("#staff-search-results");
  var status = form && $("#staff-search-status");
  if (form && input && box && form.dataset.searchUrl) {
    var timer = null;
    var controller = null;
    var options = [];
    var active = -1;

    var hide = function () {
      box.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
    };
    var setActive = function (index) {
      options.forEach(function (o, i) {
        o.setAttribute("aria-selected", i === index ? "true" : "false");
        o.classList.toggle("is-active", i === index);
      });
      active = index;
      if (index >= 0) {
        input.setAttribute("aria-activedescendant", options[index].id);
        options[index].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    };
    var render = function (groups, term) {
      box.textContent = "";
      options = [];
      var n = 0;
      groups.forEach(function (g) {
        var title = document.createElement("div");
        title.className = "search__group";
        title.setAttribute("role", "presentation");
        title.textContent = g.group;
        box.appendChild(title);
        g.items.forEach(function (item) {
          var a = document.createElement("a");
          a.setAttribute("role", "option");
          a.setAttribute("aria-selected", "false");
          a.id = "staff-search-opt-" + n++;
          a.href = item.url;
          a.className = "search__option";
          var label = document.createElement("span");
          label.className = "search__label";
          label.textContent = item.label;
          var hint = document.createElement("span");
          hint.className = "search__hint";
          hint.textContent = item.hint;
          a.appendChild(label);
          a.appendChild(hint);
          box.appendChild(a);
          options.push(a);
        });
      });
      if (!options.length) {
        var none = document.createElement("div");
        none.className = "search__none";
        none.setAttribute("role", "presentation");
        none.textContent = "No matches for “" + term + "”. Press Enter to search the full list.";
        box.appendChild(none);
      }
      box.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      if (status) status.textContent = options.length ? options.length + " suggestions available" : "No suggestions";
    };
    var lookup = function () {
      var term = input.value.trim();
      if (term.length < 2) { hide(); return; }
      if (controller) controller.abort();
      controller = window.AbortController ? new AbortController() : null;
      var opts = { credentials: "same-origin", headers: { Accept: "application/json" } };
      if (controller) opts.signal = controller.signal;
      fetch(form.dataset.searchUrl + "?q=" + encodeURIComponent(term), opts)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) { if (input.value.trim() === term) render(data.groups || [], term); })
        .catch(function (err) { if (!(err && err.name === "AbortError")) hide(); });
    };
    input.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(lookup, 250); /* debounce: one request per pause in typing */
    });
    input.addEventListener("keydown", function (e) {
      if (box.hidden && e.key === "ArrowDown" && input.value.trim().length >= 2) { lookup(); return; }
      if (box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(active + 1, options.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(active - 1, -1)); }
      else if (e.key === "Home" && options.length) { e.preventDefault(); setActive(0); }
      else if (e.key === "End" && options.length) { e.preventDefault(); setActive(options.length - 1); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); window.location.href = options[active].href; }
      else if (e.key === "Escape") { hide(); }
    });
    document.addEventListener("click", function (e) { if (!form.contains(e.target)) hide(); });
    input.addEventListener("focus", function () { if (options.length && input.value.trim().length >= 2) box.hidden = false; });
  }
})();
