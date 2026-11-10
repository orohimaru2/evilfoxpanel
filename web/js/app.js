const views = {
  stats: ["Обзор", "Статистика"],
  users: ["Доступ", "Пользователи"],
  hosts: ["Доступ", "Хосты"],
  groups: ["Доступ", "Группы"],
  templates: ["Доступ", "Шаблоны"],
  nodes: ["Сеть", "Ноды"],
  admins: ["Панель", "Админы"],
  settings: ["Панель", "Настройки"]
};

const login = document.querySelector("#login");
const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");
const dialog = document.querySelector("#user-dialog");
let toastTimer = 0;

const storage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  }
};

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("#theme-icon use").setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0c0f14" : "#f3f1ec");
  storage.set("ef-theme", theme);
}

function openView(name) {
  if (!views[name]) name = "stats";
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-on", view.dataset.view === name);
  });
  document.querySelectorAll(".side-nav .nav-item").forEach((item) => {
    const on = item.dataset.view === name;
    item.classList.toggle("active", on);
    if (on) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const [kicker, title] = views[name];
  document.querySelector("#view-kicker").textContent = kicker;
  document.querySelector("#view-title").textContent = title;
  document.title = `${title} · EvilFox`;
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  storage.set("ef-view", name);
  if (window.matchMedia("(max-width: 860px)").matches) setNav(false);
}

function setNav(open) {
  app.classList.toggle("nav-open", open);
  document.querySelector("#nav-backdrop").hidden = !open;
}

function setCollapsed(collapsed) {
  app.classList.toggle("is-collapsed", collapsed);
  storage.set("ef-collapsed", collapsed ? "1" : "0");
}

function enterPanel() {
  login.hidden = true;
  app.hidden = false;
  storage.set("ef-auth", "1");
  openView((location.hash || "").slice(1) || storage.get("ef-view", "stats"));
}

function leavePanel() {
  app.hidden = true;
  login.hidden = false;
  storage.set("ef-auth", "0");
  document.title = "EvilFox Panel";
}

function applyUserFilter() {
  const query = document.querySelector("#user-search").value.trim().toLowerCase();
  const status = document.querySelector("#status-chips .chip.is-on")?.dataset.status || "all";
  const rows = [...document.querySelectorAll("#users-table tbody tr")];
  let visible = 0;
  rows.forEach((row) => {
    const statusOk = status === "all" || row.dataset.status === status;
    const text = row.innerText.toLowerCase();
    const show = statusOk && (!query || text.includes(query));
    row.hidden = !show;
    if (show) visible += 1;
  });
  document.querySelector("#users-empty").hidden = visible !== 0;
  document.querySelector("#users-count").textContent = `${visible} из ${rows.length}`;
}

function openUserDialog(row) {
  const fresh = !row;
  document.querySelector("#dialog-kicker").textContent = fresh ? "Новая запись" : "Карточка";
  document.querySelector("#dialog-title").textContent = fresh ? "Новый пользователь" : row.dataset.name;
  document.querySelector("#f-name").value = fresh ? "" : row.dataset.name;
  document.querySelector("#f-limit").value = fresh ? "100 ГБ" : row.dataset.limit;
  document.querySelector("#f-expire").value = fresh ? "30 дней" : row.dataset.expire;
  document.querySelector("#f-node").value = fresh ? "Frankfurt" : row.dataset.node;
  document.querySelector("#f-note").value = fresh ? "" : (row.dataset.note || "");
  const protocols = fresh ? "vless trojan" : (row.querySelector("small")?.textContent || "").toLowerCase();
  document.querySelectorAll(".protocols input").forEach((input) => {
    const name = input.parentElement.textContent.trim().toLowerCase();
    const token = name === "shadowsocks" ? "ss" : name;
    input.checked = protocols.includes(token);
  });
  document.querySelector("#dialog-hint").textContent = fresh
    ? "Форма только показывает будущий экран создания. Запись не сохраняется."
    : "Поля заполнены демо-данными и никуда не отправляются.";
  dialog.showModal();
}

document.querySelector("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  enterPanel();
});

document.querySelector("#logout").addEventListener("click", leavePanel);

document.querySelector("#theme-toggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

document.querySelector("#nav-toggle").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 860px)").matches) {
    setNav(!app.classList.contains("nav-open"));
    return;
  }
  setCollapsed(!app.classList.contains("is-collapsed"));
});

document.querySelector("#nav-backdrop").addEventListener("click", () => setNav(false));

document.querySelectorAll(".side-nav .nav-item").forEach((item) => {
  item.addEventListener("click", () => openView(item.dataset.view));
});

document.querySelectorAll("[data-toast]").forEach((item) => {
  item.addEventListener("click", () => showToast(item.dataset.toast));
});

document.querySelector("#global-search").addEventListener("input", (event) => {
  openView("users");
  const field = document.querySelector("#user-search");
  field.value = event.target.value;
  applyUserFilter();
});

document.querySelector("#user-search").addEventListener("input", (event) => {
  document.querySelector("#global-search").value = event.target.value;
  applyUserFilter();
});

document.querySelector("#status-chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#status-chips .chip").forEach((item) => item.classList.toggle("is-on", item === chip));
  applyUserFilter();
});

document.querySelector("#create-user").addEventListener("click", () => openUserDialog(null));

document.querySelector("#users-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-user]");
  if (!button) return;
  openUserDialog(button.closest("tr"));
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "default") showToast("Макет: сохранение не подключено");
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

applyTheme(storage.get("ef-theme", "dark"));
setCollapsed(storage.get("ef-collapsed", "0") === "1");

if (storage.get("ef-auth", "0") === "1") enterPanel();
else document.title = "EvilFox Panel";
