const countElement = document.querySelector("#count");
const statusElement = document.querySelector("#status");
const buttons = document.querySelectorAll("button[data-action]");

let count = 0;

function render() {
  countElement.textContent = String(count);

  if (count === 0) {
    statusElement.textContent = "Counter is at zero.";
    return;
  }

  if (count > 0) {
    statusElement.textContent = `Counter is positive at ${count}.`;
    return;
  }

  statusElement.textContent = `Counter is negative at ${count}.`;
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const { action } = button.dataset;

    if (action === "increment") {
      count += 1;
    } else if (action === "decrement") {
      count -= 1;
    } else {
      count = 0;
    }

    render();
  });
});
