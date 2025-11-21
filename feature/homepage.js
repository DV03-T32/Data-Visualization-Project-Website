// Use shared NAV_ITEMS to build the nav, then show/hide .view sections.
document.addEventListener("DOMContentLoaded", () => {
  const navContainer = document.getElementById("nav-inner");
  const navItems = (window.NAV_ITEMS || []).slice();
  const views = document.querySelectorAll(".view");

  // ----- Build navigation -----
  navItems.forEach((item, index) => {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = item.label;
    link.className = "nav-link";
    link.dataset.view = item.id;

    if (index === 0) {
      link.classList.add("is-active");
    }

    navContainer.appendChild(link);
  });

  const navLinks = navContainer.querySelectorAll(".nav-link");

  // ----- Helper to show one view -----
  function showView(id) {
    views.forEach((view) => {
      if (view.id === `view-${id}`) {
        view.classList.add("is-active");
      } else {
        view.classList.remove("is-active");
      }
    });

    // Later,trigger charts here
  }

  // ----- Nav click behaviour -----
  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const viewName = link.dataset.view;
      if (!viewName) return;

      navLinks.forEach((l) => l.classList.remove("is-active"));
      link.classList.add("is-active");

      showView(viewName);
    });
  });

  // Initial view
  if (navItems.length > 0) {
    showView(navItems[0].id); // home
  }
});
