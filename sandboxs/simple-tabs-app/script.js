const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const body = document.body;

function setActiveTab(nextTab) {
  const tabName = nextTab.dataset.tab;

  tabs.forEach((tab) => {
    const isActive = tab === nextTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  body.dataset.theme = nextTab.dataset.theme;
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab));
});
