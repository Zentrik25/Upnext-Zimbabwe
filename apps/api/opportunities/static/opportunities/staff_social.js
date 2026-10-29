/* Staff editor: copy-link button, address availability check, suggestions and the social sharing preview (D-47).
   Loaded with the staff pages' own origin only (CSP script-src 'self'); no inline script, no external request. */
(function () {
  "use strict";

  // ---- Copy public link (listing page) ----
  document.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest(".js-copy-link") : null;
    if (!button) return;
    var status = button.parentNode.querySelector(".js-copy-status");
    var url = button.getAttribute("data-url");
    var done = function (ok) {
      if (status) status.textContent = ok ? "Link copied." : "Copy failed; select and copy it: " + url;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  function init() {
  var configNode = document.getElementById("social-config");
  if (!configNode) return;
  var config = JSON.parse(configNode.textContent || "{}");
  var $ = function (id) { return document.getElementById("id_" + id); };

  // ---- Suggestions: the same wording as opportunities/social.py ----
  function clip(text, limit) {
    text = text.replace(/\s+/g, " ").trim();
    if (text.length <= limit) return text;
    var cut = text.slice(0, limit - 1);
    var space = cut.lastIndexOf(" ");
    if (space > 0) cut = cut.slice(0, space);
    return cut.replace(/[,;:.\- ]+$/, "") + "…";
  }
  function organisationName() {
    var select = $("organisation");
    if (!select || !select.options || select.selectedIndex < 0) return "";
    return (select.options[select.selectedIndex].text || "").trim();
  }
  function locationName() {
    var primary = document.querySelector("input[name$='-is_primary']:checked");
    var row = primary ? primary.closest("tr") : null;
    var select = row ? row.querySelector("select[name$='-location']") : null;
    var name = select && select.selectedIndex > 0 ? select.options[select.selectedIndex].text.trim() : "";
    if (!name) return "";
    return /zimbabwe/i.test(name) ? name : name + ", Zimbabwe";
  }
  function suggestTitle() {
    var suffix = " | " + config.brand;
    var title = ($("title") || {}).value || "";
    var org = organisationName();
    return clip(org ? title + " at " + org : title, config.titleMax - suffix.length) + suffix;
  }
  function suggestDescription() {
    var title = ($("title") || {}).value || "";
    var org = organisationName();
    var where = locationName();
    var inWhere = where ? " in " + where : "";
    var tail = " View requirements, closing date and application details on " + config.brand + ".";
    var head = config.jobCategories.indexOf(config.category) >= 0
      ? org + " is recruiting a " + title + inWhere + "."
      : title + " from " + org + inWhere + ".";
    return clip(head, config.descriptionMax - tail.length) + tail;
  }
  function suggestSlug() {
    var text = ((($("title") || {}).value || "") + " " + organisationName()).toLowerCase();
    text = text.normalize ? text.normalize("NFKD").replace(/[̀-ͯ]/g, "") : text;
    var slug = text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug.length > 80) slug = slug.slice(0, 80).replace(/-[^-]*$/, "");
    return slug.replace(/^-+|-+$/g, "");
  }

  // ---- Fields that show a suggestion as a placeholder and a button; typed text is never replaced ----
  function addSuggestButton(input, label, provider) {
    if (!input) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "button js-suggest";
    button.textContent = label;
    button.addEventListener("click", function () {
      input.value = provider();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    input.parentNode.appendChild(button);
  }
  addSuggestButton($("og_title"), "Use suggestion", suggestTitle);
  addSuggestButton($("og_description"), "Use suggestion", suggestDescription);
  addSuggestButton($("slug_request"), "Suggest from title", suggestSlug);

  // ---- Address availability (409 when taken) ----
  var slugInput = $("slug_request");
  var statusLine = null;
  var timer = null;
  if (slugInput) {
    statusLine = document.createElement("p");
    statusLine.className = "slug-status";
    statusLine.setAttribute("role", "status");
    slugInput.parentNode.appendChild(statusLine);
    slugInput.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(checkSlug, 350);
    });
  }
  function checkSlug() {
    var value = slugInput.value.trim().toLowerCase();
    if (!value) { statusLine.textContent = ""; statusLine.className = "slug-status"; slugInput.setCustomValidity(""); return; }
    var query = "?slug=" + encodeURIComponent(value) + (config.opportunityId ? "&exclude=" + encodeURIComponent(config.opportunityId) : "");
    fetch(config.checkUrl + query, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (response) { return response.json().then(function (body) { return { status: response.status, body: body }; }); })
      .then(function (result) {
        if (result.status === 200) {
          statusLine.textContent = "Available.";
          statusLine.className = "slug-status ok";
          slugInput.setCustomValidity("");
        } else {
          statusLine.textContent = result.body.message || "This address cannot be used.";
          statusLine.className = "slug-status error";
          slugInput.setCustomValidity(statusLine.textContent);
        }
      })
      .catch(function () { statusLine.textContent = ""; });
  }

  // ---- Images chosen in the browser (read locally; nothing is uploaded until the draft is saved) ----
  var featuredUri = config.featuredUri || null;
  var socialUri = config.socialUri || null;
  var imageNote = document.getElementById("sp-image-note");
  function readFile(input, assign) {
    if (!input) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { assign(String(reader.result)); render(); };
      reader.readAsDataURL(file);
    });
  }
  readFile($("featured_image_file"), function (uri) { featuredUri = uri; var r = $("remove_featured_image"); if (r) r.checked = false; });
  readFile($("social_image_file"), function (uri) {
    socialUri = uri;
    var custom = document.querySelector("input[name='social_image_source'][value='custom']");
    if (custom) custom.checked = true;
  });
  var remove = $("remove_featured_image");
  if (remove) remove.addEventListener("change", function () { if (remove.checked) featuredUri = null; render(); });
  document.querySelectorAll("input[name='social_image_source']").forEach(function (radio) {
    radio.addEventListener("change", render);
  });
  function sourceIsCustom() {
    var checked = document.querySelector("input[name='social_image_source']:checked");
    return checked ? checked.value === "custom" : false;
  }
  function chosenImage() {
    return sourceIsCustom() && socialUri ? socialUri : featuredUri;
  }
  function checkShape(uri) {
    if (!imageNote) return;
    imageNote.hidden = true;
    if (!uri) { return; }
    var probe = new Image();
    probe.onload = function () {
      var notes = [];
      if (probe.naturalWidth < 1200 || probe.naturalHeight < 630) {
        notes.push("This image is " + probe.naturalWidth + " x " + probe.naturalHeight + "; link previews look best at 1200 x 630.");
      }
      var ratio = probe.naturalWidth / probe.naturalHeight;
      if (Math.abs(ratio - 1200 / 630) / (1200 / 630) > 0.12) {
        notes.push("Its shape (" + ratio.toFixed(2) + ":1) differs from 1.91:1, so platforms will crop it. Replace it, or tick the crop option for the social image.");
      }
      if (notes.length) { imageNote.textContent = notes.join(" "); imageNote.hidden = false; }
    };
    probe.src = uri;
  }

  // ---- Render the four cards ----
  function value(id) { var el = $(id); return el ? el.value.trim() : ""; }
  function render() {
    var title = value("og_title") || suggestTitle();
    var description = value("og_description") || suggestDescription();
    var image = chosenImage();
    var domain = config.domain;
    document.querySelectorAll(".sp-card").forEach(function (card) {
      var img = card.querySelector(".sp-img");
      if (image) { img.style.backgroundImage = "url(\"" + image + "\")"; img.classList.remove("sp-empty"); }
      else { img.style.backgroundImage = "none"; img.classList.add("sp-empty"); }
      var set = function (selector, text) { var el = card.querySelector(selector); if (el) el.textContent = text; };
      set(".sp-title", title);
      set(".sp-desc", description);
      set(".sp-domain", domain);
      set(".sp-domain-chip", domain);
    });
    var canonical = document.querySelector(".js-canonical");
    if (canonical && slugInput) {
      var slug = slugInput.value.trim().toLowerCase() || config.currentSlug || "(set at publication)";
      canonical.textContent = canonical.getAttribute("data-base") + slug;
    }
    var og = $("og_title"); if (og) og.placeholder = suggestTitle();
    var od = $("og_description"); if (od) od.placeholder = suggestDescription();
    checkShape(image);
  }
  ["title", "summary", "organisation", "og_title", "og_description", "slug_request", "seo_title", "seo_description"].forEach(function (id) {
    var el = $(id);
    if (el) { el.addEventListener("input", render); el.addEventListener("change", render); }
  });
  document.addEventListener("change", function (event) {
    if (event.target && /-location$|-is_primary$/.test(event.target.name || "")) render();
  });
  render();
  }
  // The staff pages load this script in <head>: wait for the form to exist.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
