
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "luna_private_office_v1";
const money = value => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL"
});
const pad = value => String(value).padStart(2, "0");
const iso = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = value => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const addDays = (date, amount) => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};
const startOfWeek = date => addDays(date, -((date.getDay() + 6) % 7));
const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1, 12);
const endOfMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const shortDate = value => parseDate(value).toLocaleDateString("pt-BR", {
  day: "2-digit", month: "short"
});
const longDate = value => parseDate(value).toLocaleDateString("pt-BR", {
  day: "numeric", month: "long", year: "numeric"
});
const monthName = date => date.toLocaleDateString("pt-BR", {
  month: "long", year: "numeric"
});
const todayISO = () => iso(new Date());

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const defaultState = {
  clients: [],
  services: [
    { id: makeId(), name: "Tarot Amoroso", price: 80, duration: 60, description: "Uma consulta voltada às questões amorosas.", active: true },
    { id: makeId(), name: "Consulta Geral", price: 100, duration: 60, description: "Uma leitura geral para diferentes questões.", active: true },
    { id: makeId(), name: "Baralho Cigano", price: 90, duration: 45, description: "Leitura com foco nas questões trazidas pela cliente.", active: true }
  ],
  appointments: [],
  events: []
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      services: Array.isArray(parsed.services) ? parsed.services : structuredClone(defaultState.services),
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch (error) {
    console.error("Não foi possível ler os dados salvos:", error);
    return structuredClone(defaultState);
  }
}

let state = loadState();
let agendaDate = todayISO();
let agendaView = "day";
let calendarDate = todayISO();
let calendarView = "month";
let financeDate = todayISO();
let financePeriod = "month";
let toastTimer;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error(error);
    notify("Não foi possível salvar. Verifique o espaço disponível no navegador.");
  }
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setPage(page) {
  const valid = ["dashboard", "agenda", "calendario", "clientes", "servicos", "financeiro", "marketing"];
  if (!valid.includes(page)) return;

  $$(".page").forEach(item => item.classList.toggle("active", item.id === `page-${page}`));
  $$(".nav-item, .mobile-nav button[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const labels = {
    dashboard: "Visão geral", agenda: "Agenda", calendario: "Calendário",
    clientes: "Clientes", servicos: "Atendimentos",
    financeiro: "Financeiro", marketing: "Marketing"
  };
  $("#breadcrumb").textContent = labels[page];
  $("#sidebar").classList.remove("open");
  renderAll();
}

function periodRange(dateValue, period) {
  const date = parseDate(dateValue);
  let start, end;

  if (period === "day") {
    start = new Date(date); end = new Date(date);
  } else if (period === "week") {
    start = startOfWeek(date); end = addDays(start, 6);
  } else if (period === "year") {
    start = new Date(date.getFullYear(), 0, 1, 12);
    end = new Date(date.getFullYear(), 11, 31, 12);
  } else {
    start = startOfMonth(date); end = endOfMonth(date);
  }
  return { start: iso(start), end: iso(end) };
}

function isInRange(date, range) {
  return date >= range.start && date <= range.end;
}

function clientName(id) {
  return state.clients.find(item => item.id === id)?.name || "Cliente não cadastrado";
}
function serviceById(id) {
  return state.services.find(item => item.id === id);
}
function appointmentValue(item) {
  return Number(item.price) || 0;
}
function isCancelled(item) {
  return item.status === "cancelled";
}
function isPaid(item) {
  return item.paid === true && !isCancelled(item);
}
function isPending(item) {
  return !item.paid && !isCancelled(item);
}
function statusLabel(item) {
  if (isCancelled(item)) return "Cancelado";
  if (item.paid) return "Pago";
  if (item.status === "done") return "Concluído";
  if (item.status === "confirmed") return "Confirmado";
  return "Agendado";
}
function statusClass(item) {
  if (isCancelled(item)) return "cancelled";
  if (item.paid) return "paid";
  if (item.status === "done") return "done";
  return "pending";
}

function recordsOn(date) {
  const sessions = state.appointments
    .filter(item => item.date === date && !isCancelled(item))
    .map(item => ({ ...item, kind: "session", label: clientName(item.clientId), detail: serviceById(item.serviceId)?.name || "Atendimento", value: appointmentValue(item) }));

  const events = state.events
    .filter(item => item.date === date)
    .map(item => ({ ...item, kind: "event", label: item.title, detail: item.category || "Evento", value: 0 }));

  return [...sessions, ...events].sort((a, b) => (a.time || "23:59").localeCompare(b.time || "23:59"));
}

function allSessions(range) {
  return state.appointments.filter(item =>
    isInRange(item.date, range) && !isCancelled(item)
  );
}

function receivedIn(range) {
  return allSessions(range).filter(isPaid).reduce((sum, item) => sum + appointmentValue(item), 0);
}

function expectedIn(range) {
  return allSessions(range).filter(isPending).reduce((sum, item) => sum + appointmentValue(item), 0);
}

function emptyState(message = "Nenhum registro por aqui ainda.") {
  return `<div class="empty-state">${escapeHTML(message)}</div>`;
}

function scheduleItem(record) {
  const isSession = record.kind === "session";
  const title = isSession ? record.label : record.title;
  const detail = isSession
    ? `${record.detail} · ${record.duration || serviceById(record.serviceId)?.duration || 0} min`
    : `${record.category || "Evento"}${record.duration ? ` · ${record.duration} min` : ""}`;

  return `
    <div class="schedule-item">
      <div class="schedule-time">${escapeHTML(record.time || "Sem horário")}
        <small>${isSession ? escapeHTML(statusLabel(record)) : "Evento"}</small>
      </div>
      <div class="schedule-line ${isSession ? "session" : ""}"></div>
      <div class="schedule-info">
        <strong>${escapeHTML(title)}</strong>
        <small>${escapeHTML(detail)}</small>
      </div>
      <div class="schedule-value">${isSession ? money(record.value) : ""}</div>
    </div>`;
}

function agendaRecord(record) {
  const isSession = record.kind === "session";
  const title = isSession ? record.label : record.title;
  const detail = isSession
    ? `${record.detail} · ${record.duration || serviceById(record.serviceId)?.duration || 0} min`
    : `${record.category || "Evento"}${record.duration ? ` · ${record.duration} min` : ""}`;
  const status = isSession
    ? `<span class="status ${statusClass(record)}">${escapeHTML(statusLabel(record))}</span>`
    : `<span class="status">Evento</span>`;

  return `
    <div class="agenda-record">
      <div class="record-time">${escapeHTML(record.time || "—")}
        <small>${isSession ? money(record.value) : "Compromisso"}</small>
      </div>
      <div class="record-accent ${isSession ? "session" : ""}"></div>
      <div class="record-main">
        <strong>${escapeHTML(title)}</strong>
        <small>${escapeHTML(detail)}</small>
      </div>
      <div class="record-actions">
        ${status}
        <button class="icon-button" data-edit-kind="${record.kind}" data-id="${escapeHTML(record.id)}" aria-label="Editar">⋯</button>
      </div>
    </div>`;
}

function renderDashboard() {
  const todayRange = periodRange(todayISO(), "day");
  const monthRange = periodRange(todayISO(), "month");
  const allToday = allSessions(todayRange);
  const paidToday = allToday.filter(isPaid);
  const paidMonth = allSessions(monthRange).filter(isPaid);

  $("#dashTodayMoney").textContent = money(receivedIn(todayRange));
  $("#dashTodayCount").textContent = `${paidToday.length} pagamentos recebidos`;
  $("#dashMonthMoney").textContent = money(receivedIn(monthRange));
  $("#dashMonthCount").textContent = `${paidMonth.length} atendimentos pagos`;
  $("#dashPendingMoney").textContent = money(state.appointments.filter(isPending).reduce((sum, item) => sum + appointmentValue(item), 0));
  $("#dashClients").textContent = state.clients.length;
  $("#dashFinanceTotal").textContent = money(receivedIn(monthRange));
  $("#dashProgress").style.width = paidMonth.length ? "100%" : "0%";
  $("#dashFinanceNote").textContent = `${paidMonth.length} atendimentos pagos neste mês.`;
  $("#dashEvents").textContent = state.events.filter(item => item.date === todayISO()).length;
  $("#dashSessions").textContent = allToday.length;

  const todayRecords = recordsOn(todayISO());
  $("#dashboardSchedule").innerHTML = todayRecords.length
    ? todayRecords.map(scheduleItem).join("")
    : emptyState("Sua agenda está livre hoje. Um bom momento para planejar conteúdo.");

  $("#headerDate").textContent = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric"
  });
  $("#welcomeDate").textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function shiftDate(value, view, direction) {
  const date = parseDate(value);
  if (view === "day") date.setDate(date.getDate() + direction);
  if (view === "week") date.setDate(date.getDate() + 7 * direction);
  if (view === "month") date.setMonth(date.getMonth() + direction);
  if (view === "year") date.setFullYear(date.getFullYear() + direction);
  return iso(date);
}

function agendaRange() {
  return periodRange(agendaDate, agendaView);
}

function agendaTitle() {
  const date = parseDate(agendaDate);
  if (agendaView === "day") return longDate(agendaDate);
  if (agendaView === "week") {
    const range = agendaRange();
    return `${shortDate(range.start)} – ${longDate(range.end)}`;
  }
  if (agendaView === "month") return monthName(date);
  return String(date.getFullYear());
}

function renderAgenda() {
  $("#agendaDate").textContent = longDate(agendaDate);
  $("#agendaDatePicker").value = agendaDate;
  $("#agendaPeriodTitle").textContent = agendaTitle();

  $$("#agendaViews button").forEach(button => button.classList.toggle("selected", button.dataset.view === agendaView));

  const range = agendaRange();
  const dates = [];
  if (agendaView === "day") dates.push(agendaDate);
  if (agendaView === "week") {
    const start = parseDate(range.start);
    for (let i = 0; i < 7; i++) dates.push(iso(addDays(start, i)));
  }
  if (agendaView === "month") {
    const start = parseDate(range.start);
    const end = parseDate(range.end);
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(iso(d));
  }
  if (agendaView === "year") {
    for (let month = 0; month < 12; month++) {
      const end = new Date(parseDate(agendaDate).getFullYear(), month + 1, 0, 12);
      for (let day = 1; day <= end.getDate(); day++) dates.push(iso(new Date(end.getFullYear(), month, day, 12)));
    }
  }

  let records = [];
  const parts = [];
  dates.forEach(date => {
    const dayRecords = recordsOn(date);
    records.push(...dayRecords);
    if (!dayRecords.length && agendaView === "day") {
      parts.push(`<div class="agenda-day-heading">${escapeHTML(longDate(date))}</div>${emptyState("Nenhum compromisso para esta data.")}`);
    } else if (dayRecords.length) {
      parts.push(`<div class="agenda-day-heading">${escapeHTML(longDate(date))}</div>${dayRecords.map(agendaRecord).join("")}`);
    }
  });

  $("#agendaCount").textContent = `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
  $("#agendaResults").innerHTML = parts.length ? parts.join("") : emptyState("Nenhum compromisso neste período.");
}

function calendarRecordsForMonth(year, month) {
  const prefix = `${year}-${pad(month + 1)}-`;
  return [...state.appointments.filter(item => item.date.startsWith(prefix) && !isCancelled(item)),
    ...state.events.filter(item => item.date.startsWith(prefix))];
}

function calendarDayCell(date, month) {
  const dateISO = iso(date);
  const inMonth = date.getMonth() === month;
  const records = recordsOn(dateISO);
  return `<div class="calendar-cell ${inMonth ? "" : "other-month"} ${dateISO === todayISO() ? "is-today" : ""}" data-calendar-date="${dateISO}">
    <div class="calendar-day-number">${date.getDate()}</div>
    ${records.slice(0, 2).map(record => `<span class="calendar-chip ${record.kind === "event" ? "event" : ""} ${record.status === "cancelled" ? "cancelled" : ""}">${escapeHTML(record.time || "")} ${escapeHTML(record.kind === "session" ? record.label : record.title)}</span>`).join("")}
    ${records.length > 2 ? `<div class="calendar-more">+${records.length - 2} mais</div>` : ""}
  </div>`;
}

function renderMonthCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = startOfMonth(date);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  let html = `<div class="calendar-grid">${weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join("")}`;

  for (let i = 0; i < 42; i++) html += calendarDayCell(addDays(gridStart, i), month);
  return html + "</div>";
}

function renderWeekCalendar(date) {
  const start = startOfWeek(date);
  const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  let html = `<div class="table-wrap"><div class="calendar-grid week-grid">`;

  for (let i = 0; i < 7; i++) {
    const current = addDays(start, i);
    const currentISO = iso(current);
    const records = recordsOn(currentISO);
    html += `<div class="week-day-column">
      <div class="week-day-head">${weekdays[i]}<strong>${current.getDate()}</strong></div>
      <div class="week-day-body">
        ${records.map(record => `<button class="week-event ${record.kind === "event" ? "event" : ""}" data-calendar-date="${currentISO}">${escapeHTML(record.time || "")}<br>${escapeHTML(record.kind === "session" ? record.label : record.title)}</button>`).join("")}
        <button class="week-event event" data-add-date="${currentISO}">＋ Adicionar</button>
      </div>
    </div>`;
  }
  return html + "</div></div>";
}

function renderYearCalendar(date) {
  const year = date.getFullYear();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  let html = `<div class="year-grid">`;

  for (let month = 0; month < 12; month++) {
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const records = calendarRecordsForMonth(year, month);
    let days = "";
    for (let i = 0; i < offset; i++) days += "<span></span>";
    for (let day = 1; day <= total; day++) {
      const key = iso(new Date(year, month, day, 12));
      const hasRecord = records.some(item => item.date === key);
      days += `<span class="${hasRecord ? "has-record" : ""}">${day}</span>`;
    }
    html += `<button class="year-month" data-month="${month}">
      <h3>${monthNames[month]}</h3><div class="year-month-grid">${days}</div>
    </button>`;
  }
  return html + "</div>";
}

function renderDayCalendar(date) {
  const records = recordsOn(iso(date));
  return records.length ? records.map(agendaRecord).join("") : emptyState("Nenhum compromisso para este dia.");
}

function renderCalendar() {
  const date = parseDate(calendarDate);
  $("#calDatePicker").value = calendarDate;
  $("#calendarTitle").textContent = calendarView === "day"
    ? longDate(calendarDate)
    : calendarView === "week"
      ? `${shortDate(iso(startOfWeek(date)))} – ${longDate(iso(addDays(startOfWeek(date), 6)))}`
      : calendarView === "year" ? String(date.getFullYear()) : monthName(date);

  $$("#calendarViews button").forEach(button => button.classList.toggle("selected", button.dataset.view === calendarView));

  let html;
  if (calendarView === "month") html = renderMonthCalendar(date);
  else if (calendarView === "week") html = renderWeekCalendar(date);
  else if (calendarView === "year") html = renderYearCalendar(date);
  else html = renderDayCalendar(date);

  $("#calendarContent").innerHTML = html;
}

function renderClients() {
  const query = ($("#clientSearch").value || "").trim().toLowerCase();
  const clients = state.clients.filter(client =>
    `${client.name} ${client.phone || ""} ${client.email || ""}`.toLowerCase().includes(query)
  );
  $("#clientCount").textContent = `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`;

  $("#clientsTable").innerHTML = clients.length ? clients.map(client => {
    const sessions = state.appointments.filter(item => item.clientId === client.id && !isCancelled(item));
    const total = sessions.filter(isPaid).reduce((sum, item) => sum + appointmentValue(item), 0);
    return `<tr>
      <td><div class="table-person"><div class="avatar">${escapeHTML((client.name || "?").charAt(0).toUpperCase())}</div><div><strong>${escapeHTML(client.name)}</strong><small>${sessions.length} atendimentos registrados</small></div></div></td>
      <td>${escapeHTML(client.phone || "—")}</td>
      <td>${sessions.length}</td>
      <td>${money(total)}</td>
      <td><button class="icon-button" data-edit-kind="client" data-id="${escapeHTML(client.id)}" aria-label="Editar cliente">⋯</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="5">${emptyState(query ? "Nenhum cliente encontrado." : "Cadastre sua primeira cliente para começar.")}</td></tr>`;
}

function renderServices() {
  $("#servicesGrid").innerHTML = state.services.length ? state.services.map(service => `
    <article class="service-card">
      <div class="service-icon">✧</div>
      <h3>${escapeHTML(service.name)}</h3>
      <p>${escapeHTML(service.description || "Serviço de atendimento.")}</p>
      <div class="service-price">${money(service.price)}</div>
      <div class="service-meta">${Number(service.duration) || 0} minutos · ${service.active ? "Disponível" : "Inativo"}</div>
      <div class="service-card-footer">
        <span class="status ${service.active ? "paid" : "cancelled"}">${service.active ? "Ativo" : "Inativo"}</span>
        <div class="service-card-actions"><button data-edit-kind="service" data-id="${escapeHTML(service.id)}">Editar</button><button data-delete-kind="service" data-id="${escapeHTML(service.id)}">Excluir</button></div>
      </div>
    </article>`).join("") : emptyState("Nenhum serviço cadastrado.");
}

function renderFinance() {
  const range = periodRange(financeDate, financePeriod);
  const all = state.appointments.filter(item => isInRange(item.date, range));
  const sessions = all.filter(item => !isCancelled(item));
  const paid = sessions.filter(isPaid);
  const pending = sessions.filter(isPending);
  const total = paid.reduce((sum, item) => sum + appointmentValue(item), 0);

  $("#finReceived").textContent = money(total);
  $("#finExpected").textContent = money(pending.reduce((sum, item) => sum + appointmentValue(item), 0));
  $("#finPaidCount").textContent = paid.length;
  $("#finPaidCount2").textContent = paid.length;
  $("#finPendingCount").textContent = pending.length;
  $("#finCancelled").textContent = all.filter(isCancelled).length;
  $("#finAverage").textContent = money(paid.length ? total / paid.length : 0);
  $("#finPeriodLabel").textContent = financePeriod === "week"
    ? `${shortDate(range.start)} a ${longDate(range.end)}`
    : financePeriod === "year" ? `Ano ${parseDate(financeDate).getFullYear()}` : monthName(parseDate(financeDate));

  const yearRange = periodRange(financeDate, "year");
  $("#finYearTotal").textContent = money(receivedIn(yearRange));

  let chartData = [];
  if (financePeriod === "week") {
    const start = parseDate(range.start);
    chartData = Array.from({ length: 7 }, (_, i) => {
      const date = iso(addDays(start, i));
      return { label: addDays(start, i).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), value: receivedIn({ start: date, end: date }) };
    });
  } else if (financePeriod === "month") {
    const date = parseDate(financeDate);
    const days = endOfMonth(date).getDate();
    chartData = Array.from({ length: days }, (_, i) => {
      const key = iso(new Date(date.getFullYear(), date.getMonth(), i + 1, 12));
      return { label: String(i + 1), value: receivedIn({ start: key, end: key }) };
    });
  } else {
    const year = parseDate(financeDate).getFullYear();
    chartData = Array.from({ length: 12 }, (_, i) => {
      const start = iso(new Date(year, i, 1, 12));
      const end = iso(new Date(year, i + 1, 0, 12));
      return { label: new Date(year, i, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), value: receivedIn({ start, end }) };
    });
  }

  const max = Math.max(...chartData.map(item => item.value), 1);
  $("#financeChart").innerHTML = chartData.map(item => `
    <div class="chart-row">
      <span class="chart-label">${escapeHTML(item.label)}</span>
      <div class="chart-track"><div class="chart-bar" style="width:${item.value ? Math.max(1, item.value / max * 100) : 0}%"></div></div>
      <span class="chart-value">${money(item.value)}</span>
    </div>`).join("");

  const periodSessions = all.slice().sort((a, b) =>
    b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "")
  );

  $("#financeTable").innerHTML = periodSessions.length ? periodSessions.map(item => `
    <tr>
      <td>${shortDate(item.date)}</td>
      <td>${escapeHTML(clientName(item.clientId))}</td>
      <td>${escapeHTML(serviceById(item.serviceId)?.name || "Serviço removido")}</td>
      <td><span class="status ${statusClass(item)}">${escapeHTML(statusLabel(item))}</span></td>
      <td>${money(item.price)}</td>
    </tr>`).join("") : `<tr><td colspan="5">${emptyState("Nenhum atendimento neste período.")}</td></tr>`;
}

function renderMarketing() {
  const items = state.events.filter(item =>
    /marketing|conteúdo|conteudo|instagram|campanha|divulgação|divulgacao/i.test(`${item.category} ${item.title}`)
  ).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

  $("#marketingResults").innerHTML = items.length
    ? items.map(item => agendaRecord({ ...item, kind: "event", label: item.title, value: 0 })).join("")
    : emptyState("Seus eventos de marketing aparecerão aqui. Cadastre campanhas, conteúdos e publicações na agenda.");
}

function renderAll() {
  renderDashboard();
  renderAgenda();
  renderCalendar();
  renderClients();
  renderServices();
  renderFinance();
  renderMarketing();
}

function openModal(title, content) {
  $("#modalTitle").textContent = title;
  $("#modalContent").innerHTML = content;
  $("#modalBackdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modalBackdrop").classList.remove("open");
  document.body.style.overflow = "";
}

function clientOptions(selected = "") {
  return `<option value="">Selecione uma cliente</option>` + state.clients.map(client =>
    `<option value="${escapeHTML(client.id)}" ${client.id === selected ? "selected" : ""}>${escapeHTML(client.name)}</option>`
  ).join("");
}

function serviceOptions(selected = "") {
  return `<option value="">Selecione um serviço</option>` + state.services.filter(item => item.active || item.id === selected).map(service =>
    `<option value="${escapeHTML(service.id)}" ${service.id === selected ? "selected" : ""}>${escapeHTML(service.name)} · ${money(service.price)}</option>`
  ).join("");
}

function openAppointmentForm(id = "", presetDate = "") {
  const item = state.appointments.find(entry => entry.id === id);
  if (!state.clients.length) {
    notify("Cadastre uma cliente antes de criar um atendimento.");
    openClientForm();
    return;
  }
  if (!state.services.some(service => service.active)) {
    notify("Cadastre um serviço ativo antes de criar um atendimento.");
    openServiceForm();
    return;
  }

  const current = item || {
    clientId: "", serviceId: "", date: presetDate || agendaDate || todayISO(),
    time: "14:00", duration: 60, price: "", status: "scheduled",
    paid: false, paymentMethod: "Pix", notes: ""
  };

  openModal(item ? "Editar atendimento" : "Novo atendimento", `
    <form id="appointmentForm">
      <div class="form-grid">
        <div class="form-field full"><label for="appointmentClient">Cliente *</label><select id="appointmentClient" required>${clientOptions(current.clientId)}</select></div>
        <div class="form-field full"><label for="appointmentService">Tipo de atendimento *</label><select id="appointmentService" required>${serviceOptions(current.serviceId)}</select></div>
        <div class="form-field"><label for="appointmentDate">Data *</label><input id="appointmentDate" type="date" value="${escapeHTML(current.date)}" required></div>
        <div class="form-field"><label for="appointmentTime">Horário *</label><input id="appointmentTime" type="time" value="${escapeHTML(current.time)}" required></div>
        <div class="form-field"><label for="appointmentDuration">Duração (minutos)</label><input id="appointmentDuration" type="number" min="1" value="${Number(current.duration) || 60}" required></div>
        <div class="form-field"><label for="appointmentPrice">Valor (R$) *</label><input id="appointmentPrice" type="number" min="0" step="0.01" value="${escapeHTML(current.price)}" required></div>
        <div class="form-field"><label for="appointmentStatus">Status</label><select id="appointmentStatus">
          <option value="scheduled" ${current.status === "scheduled" ? "selected" : ""}>Agendado</option>
          <option value="confirmed" ${current.status === "confirmed" ? "selected" : ""}>Confirmado</option>
          <option value="done" ${current.status === "done" ? "selected" : ""}>Concluído</option>
          <option value="cancelled" ${current.status === "cancelled" ? "selected" : ""}>Cancelado</option>
        </select></div>
        <div class="form-field"><label for="appointmentPayment">Forma de pagamento</label><select id="appointmentPayment">
          ${["Pix", "Dinheiro", "Cartão", "Transferência", "Outro"].map(method => `<option ${current.paymentMethod === method ? "selected" : ""}>${method}</option>`).join("")}
        </select></div>
        <div class="form-field full"><label class="checkbox-field"><input type="checkbox" id="appointmentPaid" ${current.paid ? "checked" : ""}> Pagamento recebido</label></div>
        <div class="form-field full"><label for="appointmentNotes">Observações (opcional)</label><textarea id="appointmentNotes">${escapeHTML(current.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        ${item ? `<button class="button button-outline" type="button" id="deleteAppointment">Excluir</button>` : ""}
        <button class="button button-outline" type="button" data-close>Cancelar</button>
        <button class="button button-primary" type="submit">Salvar atendimento</button>
      </div>
    </form>
  `);

  $("#appointmentService").addEventListener("change", () => {
    const service = serviceById($("#appointmentService").value);
    if (!service) return;
    $("#appointmentPrice").value = service.price;
    $("#appointmentDuration").value = service.duration;
  });

  $("#appointmentForm").addEventListener("submit", event => {
    event.preventDefault();
    const service = serviceById($("#appointmentService").value);
    const record = {
      id: item?.id || makeId(),
      clientId: $("#appointmentClient").value,
      serviceId: $("#appointmentService").value,
      date: $("#appointmentDate").value,
      time: $("#appointmentTime").value,
      duration: Number($("#appointmentDuration").value),
      price: Number($("#appointmentPrice").value),
      status: $("#appointmentStatus").value,
      paid: $("#appointmentPaid").checked,
      paymentMethod: $("#appointmentPayment").value,
      notes: $("#appointmentNotes").value.trim()
    };
    if (!record.clientId || !record.serviceId || !record.date || !record.time ||
        !Number.isFinite(record.price) || record.price < 0 ||
        !Number.isFinite(record.duration) || record.duration <= 0) {
      notify("Confira os campos obrigatórios.");
      return;
    }
    if (record.status === "cancelled") record.paid = false;
    if (item) state.appointments = state.appointments.map(entry => entry.id === item.id ? record : entry);
    else state.appointments.push(record);
    saveState();
    closeModal();
    renderAll();
    notify(item ? "Atendimento atualizado." : "Atendimento cadastrado.");
  });

  $("#deleteAppointment")?.addEventListener("click", () => {
    if (!confirm("Excluir este atendimento permanentemente?")) return;
    state.appointments = state.appointments.filter(entry => entry.id !== item.id);
    saveState(); closeModal(); renderAll(); notify("Atendimento excluído.");
  });
}

function openEventForm(id = "", presetDate = "") {
  const item = state.events.find(entry => entry.id === id);
  const current = item || {
    title: "", category: "Conteúdo", date: presetDate || agendaDate || todayISO(),
    time: "09:00", duration: 60, notes: ""
  };

  openModal(item ? "Editar evento" : "Novo evento", `
    <form id="eventForm">
      <div class="form-grid">
        <div class="form-field full"><label for="eventTitle">Nome do evento *</label><input id="eventTitle" value="${escapeHTML(current.title)}" placeholder="Ex.: Criar conteúdo para Instagram" required></div>
        <div class="form-field"><label for="eventCategory">Categoria</label><select id="eventCategory">
          ${["Conteúdo", "Marketing", "Reunião", "Pessoal", "Planejamento", "Outro"].map(category => `<option ${current.category === category ? "selected" : ""}>${category}</option>`).join("")}
        </select></div>
        <div class="form-field"><label for="eventDuration">Duração (minutos)</label><input id="eventDuration" type="number" min="0" value="${Number(current.duration) || 0}"></div>
        <div class="form-field"><label for="eventDate">Data *</label><input id="eventDate" type="date" value="${escapeHTML(current.date)}" required></div>
        <div class="form-field"><label for="eventTime">Horário</label><input id="eventTime" type="time" value="${escapeHTML(current.time || "")}"></div>
        <div class="form-field full"><label for="eventNotes">Observações</label><textarea id="eventNotes">${escapeHTML(current.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        ${item ? `<button class="button button-outline" type="button" id="deleteEvent">Excluir</button>` : ""}
        <button class="button button-outline" type="button" data-close>Cancelar</button>
        <button class="button button-primary" type="submit">Salvar evento</button>
      </div>
    </form>
  `);

  $("#eventForm").addEventListener("submit", event => {
    event.preventDefault();
    const record = {
      id: item?.id || makeId(),
      title: $("#eventTitle").value.trim(),
      category: $("#eventCategory").value,
      date: $("#eventDate").value,
      time: $("#eventTime").value,
      duration: Number($("#eventDuration").value) || 0,
      notes: $("#eventNotes").value.trim()
    };
    if (!record.title || !record.date) return notify("Informe o nome e a data do evento.");
    if (item) state.events = state.events.map(entry => entry.id === item.id ? record : entry);
    else state.events.push(record);
    saveState(); closeModal(); renderAll(); notify("Evento salvo.");
  });

  $("#deleteEvent")?.addEventListener("click", () => {
    if (!confirm("Excluir este evento?")) return;
    state.events = state.events.filter(entry => entry.id !== item.id);
    saveState(); closeModal(); renderAll(); notify("Evento excluído.");
  });
}

function openClientForm(id = "") {
  const item = state.clients.find(entry => entry.id === id);
  const current = item || { name: "", phone: "", email: "", notes: "" };

  openModal(item ? "Editar cliente" : "Nova cliente", `
    <form id="clientForm">
      <div class="form-grid">
        <div class="form-field full"><label for="clientName">Nome completo *</label><input id="clientName" value="${escapeHTML(current.name)}" required></div>
        <div class="form-field full"><label for="clientPhone">WhatsApp / telefone</label><input id="clientPhone" type="tel" value="${escapeHTML(current.phone || "")}" placeholder="(00) 00000-0000"></div>
        <div class="form-field full"><label for="clientEmail">E-mail (opcional)</label><input id="clientEmail" type="email" value="${escapeHTML(current.email || "")}"></div>
        <div class="form-field full"><label for="clientNotes">Observações</label><textarea id="clientNotes">${escapeHTML(current.notes || "")}</textarea></div>
      </div>
      <div class="form-actions">
        ${item ? `<button class="button button-outline" type="button" id="deleteClient">Excluir</button>` : ""}
        <button class="button button-outline" type="button" data-close>Cancelar</button>
        <button class="button button-primary" type="submit">Salvar cliente</button>
      </div>
    </form>
  `);

  $("#clientForm").addEventListener("submit", event => {
    event.preventDefault();
    const record = {
      id: item?.id || makeId(),
      name: $("#clientName").value.trim(),
      phone: $("#clientPhone").value.trim(),
      email: $("#clientEmail").value.trim(),
      notes: $("#clientNotes").value.trim()
    };
    if (!record.name) return notify("Informe o nome da cliente.");
    if (item) state.clients = state.clients.map(entry => entry.id === item.id ? record : entry);
    else state.clients.push(record);
    saveState(); closeModal(); renderAll(); notify("Cliente salva.");
  });

  $("#deleteClient")?.addEventListener("click", () => {
    const hasHistory = state.appointments.some(entry => entry.clientId === item.id);
    if (hasHistory) return notify("Esta cliente tem histórico. Preserve o cadastro para não perder a identificação dos atendimentos.");
    if (!confirm("Excluir esta cliente?")) return;
    state.clients = state.clients.filter(entry => entry.id !== item.id);
    saveState(); closeModal(); renderAll(); notify("Cliente excluída.");
  });
}

function openServiceForm(id = "") {
  const item = state.services.find(entry => entry.id === id);
  const current = item || { name: "", price: 80, duration: 60, description: "", active: true };

  openModal(item ? "Editar serviço" : "Novo serviço", `
    <form id="serviceForm">
      <div class="form-grid">
        <div class="form-field full"><label for="serviceName">Nome do serviço *</label><input id="serviceName" value="${escapeHTML(current.name)}" required></div>
        <div class="form-field"><label for="servicePrice">Preço (R$) *</label><input id="servicePrice" type="number" min="0" step="0.01" value="${escapeHTML(current.price)}" required></div>
        <div class="form-field"><label for="serviceDuration">Duração (minutos) *</label><input id="serviceDuration" type="number" min="1" value="${escapeHTML(current.duration)}" required></div>
        <div class="form-field full"><label for="serviceDescription">Descrição</label><textarea id="serviceDescription">${escapeHTML(current.description || "")}</textarea></div>
        <div class="form-field full"><label class="checkbox-field"><input id="serviceActive" type="checkbox" ${current.active ? "checked" : ""}> Serviço disponível para novos agendamentos</label></div>
      </div>
      <div class="form-actions">
        ${item ? `<button class="button button-outline" type="button" id="deleteService">Excluir</button>` : ""}
        <button class="button button-outline" type="button" data-close>Cancelar</button>
        <button class="button button-primary" type="submit">Salvar serviço</button>
      </div>
    </form>
  `);

  $("#serviceForm").addEventListener("submit", event => {
    event.preventDefault();
    const record = {
      id: item?.id || makeId(),
      name: $("#serviceName").value.trim(),
      price: Number($("#servicePrice").value),
      duration: Number($("#serviceDuration").value),
      description: $("#serviceDescription").value.trim(),
      active: $("#serviceActive").checked
    };
    if (!record.name || record.price < 0 || !Number.isFinite(record.price) || record.duration <= 0) {
      return notify("Confira o nome, preço e duração.");
    }
    if (item) state.services = state.services.map(entry => entry.id === item.id ? record : entry);
    else state.services.push(record);
    saveState(); closeModal(); renderAll(); notify("Serviço salvo.");
  });

  $("#deleteService")?.addEventListener("click", () => {
    const used = state.appointments.some(entry => entry.serviceId === item.id);
    if (used) return notify("Este serviço já tem atendimentos registrados. Desative-o em vez de excluir.");
    if (!confirm("Excluir este serviço?")) return;
    state.services = state.services.filter(entry => entry.id !== item.id);
    saveState(); closeModal(); renderAll(); notify("Serviço excluído.");
  });
}

function openQuickMenu() {
  openModal("Novo registro", `
    <div class="quick-options">
      <button class="quick-option" data-create="appointment"><strong>＋ Atendimento</strong><span>Agende uma consulta com uma cliente.</span></button>
      <button class="quick-option" data-create="event"><strong>✧ Evento</strong><span>Organize tarefas, campanhas e compromissos.</span></button>
      <button class="quick-option" data-create="client"><strong>♙ Cliente</strong><span>Adicione alguém à sua base de clientes.</span></button>
      <button class="quick-option" data-create="service"><strong>☾ Serviço</strong><span>Cadastre um tipo de atendimento e seu preço.</span></button>
    </div>
  `);
}

function bindViewControls(id, callback) {
  $$(id + " button").forEach(button => button.addEventListener("click", () => {
    callback(button.dataset.view || button.dataset.period);
    renderAll();
  }));
}

$$(".nav-item, .mobile-nav button[data-page]").forEach(button =>
  button.addEventListener("click", () => setPage(button.dataset.page))
);
$$("[data-go]").forEach(button => button.addEventListener("click", () => setPage(button.dataset.go)));

$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#quickAdd").addEventListener("click", openQuickMenu);
$("#mobileAdd").addEventListener("click", openQuickMenu);
$("#addFromAgenda").addEventListener("click", openQuickMenu);
$("#calendarAdd").addEventListener("click", () => openEventForm("", calendarDate));
$("#addClient").addEventListener("click", () => openClientForm());
$("#addService").addEventListener("click", () => openServiceForm());
$("#addMarketing").addEventListener("click", () => openEventForm("", agendaDate));
$("#closeModal").addEventListener("click", closeModal);
$("#modalBackdrop").addEventListener("click", event => {
  if (event.target === $("#modalBackdrop")) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

$("#agendaPrev").addEventListener("click", () => { agendaDate = shiftDate(agendaDate, agendaView, -1); renderAgenda(); });
$("#agendaNext").addEventListener("click", () => { agendaDate = shiftDate(agendaDate, agendaView, 1); renderAgenda(); });
$("#agendaToday").addEventListener("click", () => { agendaDate = todayISO(); renderAgenda(); });
$("#agendaDatePicker").addEventListener("change", event => { if (event.target.value) { agendaDate = event.target.value; renderAgenda(); } });
bindViewControls("#agendaViews", view => { agendaView = view; });

$("#calPrev").addEventListener("click", () => { calendarDate = shiftDate(calendarDate, calendarView, -1); renderCalendar(); });
$("#calNext").addEventListener("click", () => { calendarDate = shiftDate(calendarDate, calendarView, 1); renderCalendar(); });
$("#calToday").addEventListener("click", () => { calendarDate = todayISO(); renderCalendar(); });
$("#calDatePicker").addEventListener("change", event => { if (event.target.value) { calendarDate = event.target.value; renderCalendar(); } });
bindViewControls("#calendarViews", view => { calendarView = view; });

$("#financeDate").value = financeDate;
$("#financeDate").addEventListener("change", event => {
  if (event.target.value) financeDate = event.target.value;
  renderFinance();
});
bindViewControls("#financeViews", period => { financePeriod = period; });

$("#clientSearch").addEventListener("input", renderClients);

document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) return closeModal();

  const create = event.target.closest("[data-create]");
  if (create) {
    const type = create.dataset.create;
    closeModal();
    if (type === "appointment") openAppointmentForm();
    if (type === "event") openEventForm();
    if (type === "client") openClientForm();
    if (type === "service") openServiceForm();
    return;
  }

  const edit = event.target.closest("[data-edit-kind]");
  if (edit) {
    const { editKind, id } = edit.dataset;
    if (editKind === "session") openAppointmentForm(id);
    if (editKind === "event") openEventForm(id);
    if (editKind === "client") openClientForm(id);
    if (editKind === "service") openServiceForm(id);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-kind]");
  if (deleteButton) {
    const { deleteKind, id } = deleteButton.dataset;
    if (deleteKind === "service") {
      const item = state.services.find(entry => entry.id === id);
      if (!item) return;
      const used = state.appointments.some(entry => entry.serviceId === id);
      if (used) return notify("Este serviço tem histórico. Desative-o para preservar os registros.");
      if (!confirm("Excluir este serviço?")) return;
      state.services = state.services.filter(entry => entry.id !== id);
      saveState(); renderAll(); notify("Serviço excluído.");
    }
    return;
  }

  const monthButton = event.target.closest("[data-month]");
  if (monthButton) {
    calendarDate = iso(new Date(parseDate(calendarDate).getFullYear(), Number(monthButton.dataset.month), 1, 12));
    calendarView = "month";
    renderCalendar();
    return;
  }

  const addDate = event.target.closest("[data-add-date]");
  if (addDate) {
    openQuickMenu();
    $("#modalContent").dataset.presetDate = addDate.dataset.addDate;
    return;
  }

  const dateCell = event.target.closest("[data-calendar-date]");
  if (dateCell) {
    const date = dateCell.dataset.calendarDate;
    calendarDate = date;
    if (calendarView === "month" || calendarView === "year") calendarView = "day";
    renderCalendar();
  }
});

$("#modalContent").addEventListener("click", event => {
  const create = event.target.closest("[data-create]");
  if (!create) return;
  const type = create.dataset.create;
  const presetDate = $("#modalContent").dataset.presetDate || "";
  closeModal();
  if (type === "appointment") openAppointmentForm("", presetDate);
  if (type === "event") openEventForm("", presetDate);
  if (type === "client") openClientForm();
  if (type === "service") openServiceForm();
});

renderAll();
