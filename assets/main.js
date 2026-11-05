const menuButton = document.querySelector(".menu-button");
const siteNav = document.querySelector(".site-nav");
const dropdowns = [...document.querySelectorAll(".nav-dropdown")];
const mainScript = document.currentScript;
const siteRootURL = mainScript
  ? new URL("../", mainScript.src)
  : new URL("./", window.location.href);

function siteURL(path = "") {
  return new URL(String(path).replace(/^\/+/, ""), siteRootURL).href;
}

function closeMobileNav() {
  if (!siteNav || !menuButton) return;
  siteNav.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
}

function wireNavigationLinks() {
  if (!siteNav) return;
  siteNav.querySelectorAll("a").forEach((link) => {
    if (link.dataset.navWired === "true") return;
    link.dataset.navWired = "true";
    link.addEventListener("click", closeMobileNav);
  });
}

if (menuButton && siteNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  wireNavigationLinks();
}

dropdowns.forEach((dropdown) => {
  dropdown.addEventListener("toggle", () => {
    if (!dropdown.open) return;
    dropdowns.forEach((item) => {
      if (item !== dropdown) item.open = false;
    });
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".nav-dropdown")) {
    dropdowns.forEach((item) => { item.open = false; });
  }
});

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeResource(value = "") {
  const resource = String(value).trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(resource)) {
    return escapeHTML(resource);
  }
  if (/^assets\//i.test(resource)) return escapeHTML(siteURL(resource));
  return "";
}

function sortedVisible(items = []) {
  return items
    .filter((item) => item.visible !== false)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

async function loadJSON(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function coursePageURL(code) {
  const url = new URL("course-machine-learning/", siteRootURL);
  url.searchParams.set("code", code);
  return url.href;
}

function renderTeachingMenu(courses) {
  const teachingDropdown = dropdowns.find((dropdown) => {
    const summary = dropdown.querySelector(":scope > summary");
    return summary?.textContent.trim().toLowerCase() === "teaching";
  });
  const menu = teachingDropdown?.querySelector(".dropdown-menu");
  if (!menu) return;

  [...menu.querySelectorAll("a")].slice(1).forEach((link) => link.remove());

  courses.forEach((course) => {
    const link = document.createElement("a");
    link.href = coursePageURL(course.code);
    link.textContent = `${course.code} ${course.title}`;
    menu.append(link);
  });
  wireNavigationLinks();
}

function renderCourseList(courses) {
  const list = document.querySelector("#course-list");
  if (!list) return;

  if (!courses.length) {
    list.innerHTML = '<li class="notice">No courses are currently listed.</li>';
    return;
  }

  list.innerHTML = courses.map((course) => `
    <li>
      <a class="course-link" href="${coursePageURL(course.code)}">
        <span class="course-code">${escapeHTML(course.code)}</span>
        <div>
          <strong>${escapeHTML(course.title)}</strong>
          <span>${escapeHTML(course.semester)} · ${escapeHTML(course.institution)}</span>
        </div>
        <b aria-hidden="true">→</b>
      </a>
    </li>
  `).join("");
}

function personHTML(person) {
  const name = escapeHTML(person?.name || "");
  const email = escapeHTML(person?.email || "");
  if (!email) return name;
  return `${name} · <a href="mailto:${email}">${email}</a>`;
}

function documentLinkHTML(path, label) {
  const href = safeResource(path);
  if (!href) return '<span class="status-muted">Not yet posted</span>';
  return `<a href="${href}" target="_blank" rel="noopener">${escapeHTML(label)}</a>`;
}

function renderCoursePage(course) {
  const main = document.querySelector("[data-course-page]");
  if (!main) return;

  document.title = `${course.code} ${course.title} | STIL Lab`;

  const assistants = (course.teachingAssistants || [])
    .map(personHTML)
    .join("<br>") || "—";

  const assignmentNotes = (course.assignmentNotes || [])
    .map((note) => `<li>${escapeHTML(note)}</li>`)
    .join("");

  const assignments = (course.assignments || []).map((assignment) => `
    <tr>
      <td>${escapeHTML(assignment.name)}</td>
      <td>${escapeHTML(assignment.assigned)}</td>
      <td>${escapeHTML(assignment.due)}</td>
      <td>${documentLinkHTML(assignment.document, "Assignment PDF")}</td>
    </tr>
  `).join("");

  let previousSection = "";
  const lectures = (course.lectures || []).map((lecture) => {
    let sectionRow = "";
    if (lecture.section && lecture.section !== previousSection) {
      previousSection = lecture.section;
      sectionRow = `<tr class="course-part"><td colspan="4">${escapeHTML(lecture.section)}</td></tr>`;
    }

    const topic = lecture.type === "exam"
      ? `<strong>${escapeHTML(lecture.title)}</strong>`
      : `<strong>Lecture ${escapeHTML(lecture.number)}</strong><br>${escapeHTML(lecture.title)}`;

    const description = (lecture.description || []).length
      ? `<ul class="topic-list">${lecture.description.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
      : "—";

    const materials = lecture.slides || lecture.notes
      ? `<div class="material-links">
          ${lecture.slides ? documentLinkHTML(lecture.slides, "Slides PDF") : ""}
          ${lecture.notes ? documentLinkHTML(lecture.notes, "With notes PDF") : ""}
        </div>`
      : (lecture.type === "exam" ? "—" : '<span class="status-muted">Not yet posted</span>');

    const rowClass = lecture.type === "exam" ? ' class="exam-row"' : "";
    return `${sectionRow}<tr${rowClass}>
      <td>${escapeHTML(lecture.date)}</td>
      <td>${topic}</td>
      <td>${description}</td>
      <td>${materials}</td>
    </tr>`;
  }).join("");

  main.innerHTML = `
    <div class="page-heading">
      <h1><span class="t-light">${escapeHTML(course.code)}</span> <span class="t-bold">${escapeHTML(course.title)}</span></h1>
      <p>${escapeHTML(course.semester)} · ${escapeHTML(course.institution)}</p>
    </div>

    <section class="content-section section-grid">
      <div><h2>Course Information</h2></div>
      <table class="contact-table"><tbody>
        <tr><th>Instructor</th><td>${personHTML(course.instructor)}</td></tr>
        <tr><th>Teaching Assistants</th><td>${assistants}</td></tr>
        <tr><th>Lecture</th><td>${escapeHTML(course.lecture)}</td></tr>
        <tr><th>Office Hours</th><td>${escapeHTML(course.officeHours)}</td></tr>
        <tr><th>Grading</th><td>${escapeHTML(course.grading)}</td></tr>
      </tbody></table>
    </section>

    <section class="content-section section-grid">
      <div>
        <h2>Homework Assignments</h2>
        <ul class="course-notes">${assignmentNotes}</ul>
      </div>
      <table class="course-table assignment-table">
        <thead><tr><th>Assignment</th><th>Assigned</th><th>Due</th><th>Document</th></tr></thead>
        <tbody>${assignments}</tbody>
      </table>
    </section>

    <section class="content-section lecture-section">
      <div class="section-heading-row">
        <div><h2>Lecture Slides</h2><p class="section-note">Course schedule and downloadable materials</p></div>
      </div>
      <div class="course-table-wrap">
        <table class="course-table lecture-table">
          <thead><tr><th>Date</th><th>Topic</th><th>Description</th><th>Documents</th></tr></thead>
          <tbody>${lectures}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMembers(data) {
  const container = document.querySelector("#student-groups");
  if (!container) return;

  const groups = [...(data.groups || [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const members = sortedVisible(data.members || []);

  container.innerHTML = groups.map((group) => {
    const groupMembers = members.filter((member) => member.group === group.id);
    const cards = groupMembers.map((member) => {
      const photo = safeResource(member.photo);
      const email = escapeHTML(member.email || "");
      return `
        <article class="student-card">
          ${photo ? `<img class="student-photo" src="${photo}" alt="${escapeHTML(member.nameEn)}">` : '<div class="ph ph-student" role="img" aria-label="Portrait unavailable"></div>'}
          <div class="student-info">
            <h3>${escapeHTML(member.nameEn)} <span class="text-muted">${escapeHTML(member.nameKo)}</span></h3>
            <p>${escapeHTML(member.position)}</p>
            ${email ? `<p><a href="mailto:${email}">${email}</a></p>` : '<p class="sample-label">Email to be added</p>'}
          </div>
        </article>`;
    }).join("");

    return `
      <div class="student-group">
        <h2 class="student-group-title">${escapeHTML(group.label)}</h2>
        ${cards ? `<div class="student-list">${cards}</div>` : '<p class="text-muted">No members listed.</p>'}
      </div>`;
  }).join("");
}

async function initializeCourses() {
  try {
    const data = await loadJSON(siteURL("data/courses.json"));
    const courses = sortedVisible(data.courses || []);
    renderTeachingMenu(courses);
    renderCourseList(courses);

    const coursePage = document.querySelector("[data-course-page]");
    if (coursePage) {
      const params = new URLSearchParams(window.location.search);
      const requestedCode = params.get("code") || coursePage.dataset.defaultCourse;
      const course = courses.find((item) => item.code.toLowerCase() === String(requestedCode).toLowerCase());
      if (course) renderCoursePage(course);
    }
  } catch (error) {
    console.warn("Course data could not be loaded. The static fallback remains visible.", error);
  }
}

async function initializeMembers() {
  if (!document.querySelector("#student-groups")) return;
  try {
    const data = await loadJSON(siteURL("data/members.json"));
    renderMembers(data);
  } catch (error) {
    console.warn("Member data could not be loaded. The static fallback remains visible.", error);
  }
}


// Support clean folder links when HTML files are opened directly on Windows.
if (window.location.protocol === "file:") {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");

    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    const url = new URL(href, window.location.href);

    if (url.protocol === "file:" && url.pathname.endsWith("/")) {
      event.preventDefault();
      url.pathname += "index.html";
      window.location.href = url.href;
    }
  });
}

initializeCourses();
initializeMembers();
