"use strict";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-corporate-form] .form-note").forEach((note) => {
    const privacy = note.querySelector('a[href="privacy.html"]');
    if (!privacy || note.querySelector('a[href="terms.html"]')) return;
    privacy.insertAdjacentHTML("afterend", ' and <a href="terms.html">service information</a>');
  });

  const service = document.getElementById("service-needed");
  const serviceFields = Array.from(document.querySelectorAll("[data-service-fields]"));
  const journeyControls = ["Travellers_count", "From", "Destination", "Preferred_date", "Return_date", "Payment_method"]
    .map((name) => service?.form.elements.namedItem(name)).filter(Boolean);
  function updateServiceFields() {
    const id = SERVICES.find((entry) => entry[1] === service?.value)?.[0];
    const reporting = id === "report";
    journeyControls.forEach((input) => {
      input.closest(".field").hidden = reporting;
      input.disabled = reporting;
      if (reporting) setFieldError(input, "");
    });
    serviceFields.forEach((fieldset) => {
      const relevant = fieldset.dataset.serviceFields.split(" ").includes(id);
      fieldset.hidden = !relevant;
      fieldset.disabled = !relevant;
      if (!relevant) fieldset.querySelectorAll("input, select, textarea").forEach((input) => setFieldError(input, ""));
    });
  }
  if (service && serviceFields.length) {
    updateServiceFields();
    service.addEventListener("change", updateServiceFields);
    service.form.addEventListener("corporate:saved", updateServiceFields);
  }
  const today = new Date();
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  document.querySelectorAll("[data-future-date]").forEach((input) => { input.min = date; });

  const search = document.getElementById("help-search");
  if (search) {
    const topics = Array.from(document.querySelectorAll("[data-help-topic]"));
    const count = document.getElementById("help-results");
    const empty = document.getElementById("help-empty");
    search.addEventListener("input", () => {
      const words = search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      let visible = 0;
      topics.forEach((topic) => {
        const match = words.every((word) => topic.textContent.toLocaleLowerCase().includes(word));
        topic.hidden = !match;
        if (match) visible += 1;
      });
      count.textContent = visible + (visible === 1 ? " topic" : " topics");
      empty.hidden = visible !== 0;
    });
  }
});
