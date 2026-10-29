/* Sets the colour theme before first paint (the staff CSP allows scripts from this origin only, so this is a file,
   not an inline script). Light is the default on every device; Dark is an explicit choice kept in this browser
   under the same key as the public site. */
(function () {
  var theme = "light";
  try {
    if (window.localStorage.getItem("upnext-theme") === "dark") theme = "dark";
  } catch (e) {
    /* storage can be blocked: the page stays light */
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
