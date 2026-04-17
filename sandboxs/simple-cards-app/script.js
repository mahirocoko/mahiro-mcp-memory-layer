const filters = document.querySelectorAll(".filter");
const cards = document.querySelectorAll(".card");

function applyFilter(category) {
  filters.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === category);
  });

  cards.forEach((card) => {
    const matches = category === "all" || card.dataset.category === category;
    card.classList.toggle("is-hidden", !matches);
  });
}

filters.forEach((button) => {
  button.addEventListener("click", () => applyFilter(button.dataset.filter));
});
