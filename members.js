/**
 * GymOS — Members Module
 * Premium members management UI (table, drawer, modals, filters, pagination)
 */
(function () {
  "use strict";

  const PAGE_SIZE = 10;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^\d{10}$/;
  const AVATAR_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316",
    "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#2563eb",
  ];

  const $ = id => document.getElementById(id);

  // ── State ─────────────────────────────────────────────────────────────────
  let config = {};
  let allMembers = [];
  let plans = [];
  let enrollmentsByMember = new Map();
  let paymentsByMember = new Map();
  let profileCache = new Map();
  let currentPage = 1;
  let selectedMemberId = null;
  let pendingDeleteIdx = null;
  let onMembersUpdate = null;

  // ── Utilities ─────────────────────────────────────────────────────────────
  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function highlightMatch(text, term) {
    const safe = escapeHtml(text || "Unknown");
    if (!term) return safe;
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    return safe.replace(re, '<span class="mem-highlight">$1</span>');
  }

  function memberInitials(name) {
    const parts = String(name || "M").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || "M").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "M";
  }

  function avatarColor(name) {
    let hash = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function formatDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d.getTime())) return escapeHtml(String(val));
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function daysRemaining(endDate) {
    if (!endDate) return null;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  }

  /** Derive display status from enrollment data */
  function membershipStatusMeta(enrollment) {
    if (!enrollment) {
      return { key: "no-membership", label: "No Membership", badgeClass: "mem-badge-none" };
    }
    const s = String(enrollment.status || "").toLowerCase();
    const endDate = enrollment.end_date;
    if (s === "active") {
      const days = daysRemaining(endDate);
      if (days !== null && days < 0) return { key: "expired", label: "Expired", badgeClass: "mem-badge-expired" };
      if (days !== null && days <= 30) return { key: "expiring", label: "Expiring", badgeClass: "mem-badge-expiring" };
      return { key: "active", label: "Active", badgeClass: "mem-badge-active" };
    }
    if (s === "expiring" || s === "expiring soon") return { key: "expiring", label: "Expiring", badgeClass: "mem-badge-expiring" };
    if (s === "expired" || s === "inactive") return { key: "expired", label: "Expired", badgeClass: "mem-badge-expired" };
    return { key: "no-membership", label: "No Membership", badgeClass: "mem-badge-none" };
  }

  function statusBadgeHtml(meta) {
    return `<span class="mem-badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span>`;
  }

  function getEnrollment(memberId) {
    return enrollmentsByMember.get(memberId) || null;
  }

  function getPayment(memberId) {
    return paymentsByMember.get(memberId) || null;
  }

  function enrichMember(member) {
    const id = member.id || member.member_id;
    const enrollment = getEnrollment(id);
    const payment = getPayment(id);
    const status = membershipStatusMeta(enrollment);
    return {
      ...member,
      id,
      enrollment,
      payment,
      status,
      planName: enrollment?.plan_name || enrollment?.planName || "—",
      joinDate: enrollment?.start_date || null,
      expiryDate: enrollment?.end_date || null,
    };
  }

  // ── Form validation ───────────────────────────────────────────────────────
  function setFieldError(input, msg) {
    const field = input.closest(".mem-field");
    if (!field) return;
    field.classList.add("has-error");
    let err = field.querySelector(".mem-error-text");
    if (!err) {
      err = document.createElement("span");
      err.className = "mem-error-text";
      field.appendChild(err);
    }
    err.textContent = msg;
  }

  function clearFieldError(input) {
    const field = input.closest(".mem-field");
    if (!field) return;
    field.classList.remove("has-error");
    field.querySelector(".mem-error-text")?.remove();
  }

  function clearFormErrors(form) {
    form.querySelectorAll(".mem-field.has-error").forEach(f => f.classList.remove("has-error"));
    form.querySelectorAll(".mem-error-text").forEach(e => e.remove());
  }

  function validateRequired(input, label) {
    if (!input?.value.trim()) { setFieldError(input, `${label} is required.`); return false; }
    clearFieldError(input);
    return true;
  }

  function validateEmail(input, required = false) {
    const v = input.value.trim();
    if (!v) {
      if (required) { setFieldError(input, "Email is required."); return false; }
      clearFieldError(input);
      return true;
    }
    if (!EMAIL_REGEX.test(v)) { setFieldError(input, "Enter a valid email."); return false; }
    clearFieldError(input);
    return true;
  }

  function validatePhone(input) {
    const v = input.value.trim();
    if (!v) { setFieldError(input, "Phone is required."); return false; }
    if (!PHONE_REGEX.test(v)) { setFieldError(input, "Phone must be 10 digits."); return false; }
    clearFieldError(input);
    return true;
  }

  function showNotice(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = `mem-notice ${type}`;
    el.hidden = false;
  }

  function clearNotice(el) {
    if (!el) return;
    el.textContent = "";
    el.className = "mem-notice";
    el.hidden = true;
  }

  function setButtonLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.textContent = text;
      btn.disabled = true;
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.origText || btn.textContent;
    }
  }

  function toast(msg, type = "success") {
    if (config.showToast) config.showToast(msg, type);
  }

  // ── Filtering & search ────────────────────────────────────────────────────
  function getSearchTerm() {
    const local = $("memSearchInput")?.value.trim().toLowerCase() || "";
    const global = $("memberSearch")?.value.trim().toLowerCase() || "";
    return local || global;
  }

  function planMatchesFilter(planName, filter) {
    if (filter === "all") return true;
    const name = String(planName || "").toLowerCase();
    if (filter === "silver") return name.includes("silver");
    if (filter === "gold") return name.includes("gold");
    if (filter === "platinum") return name.includes("platinum");
    if (filter === "custom") {
      return !name.includes("silver") && !name.includes("gold") && !name.includes("platinum");
    }
    return true;
  }

  function getFilteredMembers() {
    const term = getSearchTerm();
    const statusFilter = $("memStatusFilter")?.value || "all";
    const planFilter = $("memPlanFilter")?.value || "all";

    return allMembers
      .map((m, i) => enrichMember({ ...m, _idx: i }))
      .filter(m => {
        const haystack = [
          m.name, m.phone, m.email, m.planName,
        ].map(v => String(v || "").toLowerCase()).join(" ");
        if (term && !haystack.includes(term)) return false;
        if (statusFilter !== "all" && m.status.key !== statusFilter) return false;
        if (!planMatchesFilter(m.planName, planFilter)) return false;
        return true;
      });
  }

  // ── Statistics ────────────────────────────────────────────────────────────
  function updateStats() {
    const counts = { active: 0, expiring: 0, expired: 0, "no-membership": 0 };
    allMembers.forEach(m => {
      const meta = membershipStatusMeta(getEnrollment(m.id || m.member_id));
      counts[meta.key] = (counts[meta.key] || 0) + 1;
    });
    const set = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };
    set("memStatActive", counts.active);
    set("memStatExpiring", counts.expiring);
    set("memStatExpired", counts.expired);
    set("memStatNoMembership", counts["no-membership"]);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function iconSvg(type) {
    const icons = {
      view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    };
    return icons[type] || "";
  }

  function renderActionButtons(m) {
    return `<div class="mem-actions">
      <button type="button" class="mem-icon-btn" data-action="view" data-id="${m.id}" data-tooltip="View">${iconSvg("view")}</button>
      <button type="button" class="mem-icon-btn" data-action="edit" data-idx="${m._idx}" data-tooltip="Edit">${iconSvg("edit")}</button>
      <button type="button" class="mem-icon-btn mem-icon-danger" data-action="delete" data-idx="${m._idx}" data-tooltip="Delete">${iconSvg("delete")}</button>
    </div>`;
  }

  function renderTableRow(m, term) {
    const color = avatarColor(m.name);
    const initials = memberInitials(m.name);
    const paymentAmt = m.payment ? formatCurrency(m.payment.amount) : "—";
    const active = selectedMemberId === m.id ? " mem-row-active" : "";
    return `<tr class="mem-row${active}" data-member-id="${m.id}" tabindex="0">
      <td><div class="mem-avatar" style="background:${color}">${escapeHtml(initials)}</div></td>
      <td class="mem-td-name">${highlightMatch(m.name || "Unknown", term)}</td>
      <td>${escapeHtml(m.planName)}</td>
      <td>${statusBadgeHtml(m.status)}</td>
      <td class="mem-td-muted">${escapeHtml(m.phone || "—")}</td>
      <td class="mem-td-muted">${formatDate(m.joinDate)}</td>
      <td class="mem-td-muted">${formatDate(m.expiryDate)}</td>
      <td class="mem-td-muted">${paymentAmt}</td>
      <td>${renderActionButtons(m)}</td>
    </tr>`;
  }

  function renderMobileCard(m, term) {
    const color = avatarColor(m.name);
    const initials = memberInitials(m.name);
    const paymentAmt = m.payment ? formatCurrency(m.payment.amount) : "—";
    return `<article class="mem-card" data-member-id="${m.id}" tabindex="0">
      <div class="mem-card-head">
        <div class="mem-avatar" style="background:${color}">${escapeHtml(initials)}</div>
        <div>
          <div class="mem-card-name">${highlightMatch(m.name || "Unknown", term)}</div>
          ${statusBadgeHtml(m.status)}
        </div>
      </div>
      <dl class="mem-card-meta">
        <dt>Plan</dt><dd>${escapeHtml(m.planName)}</dd>
        <dt>Phone</dt><dd>${escapeHtml(m.phone || "—")}</dd>
        <dt>Expiry</dt><dd>${formatDate(m.expiryDate)}</dd>
        <dt>Payment</dt><dd>${paymentAmt}</dd>
      </dl>
      <div class="mem-card-footer">
        ${renderActionButtons(m)}
      </div>
    </article>`;
  }

  function renderPagination(total, page) {
    const pagination = $("memPagination");
    const info = $("memPaginationInfo");
    const numbers = $("memPageNumbers");
    const prevBtn = $("memPrevBtn");
    const nextBtn = $("memNextBtn");
    if (!pagination) return;

    if (total === 0) {
      pagination.hidden = true;
      return;
    }

    pagination.hidden = false;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    if (info) info.textContent = `Showing ${start}–${end} of ${total} members`;

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (numbers) {
      numbers.innerHTML = "";
      const maxVisible = 5;
      let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);
      if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

      for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mem-page-num" + (i === page ? " active" : "");
        btn.textContent = String(i);
        btn.addEventListener("click", () => { currentPage = i; render(); });
        numbers.appendChild(btn);
      }
    }
  }

  function render() {
    const loader = $("memTableLoader");
    const tableScroll = $("memTableScroll");
    const tableBody = $("memTableBody");
    const cards = $("memCards");
    const empty = $("memEmpty");
    const term = getSearchTerm();
    const filtered = getFilteredMembers();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (loader) loader.hidden = true;

    if (filtered.length === 0) {
      if (tableScroll) tableScroll.hidden = true;
      if (cards) cards.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        const sub = $("memEmptySub");
        if (sub) {
          sub.textContent = term || ($("memStatusFilter")?.value !== "all") || ($("memPlanFilter")?.value !== "all")
            ? "Try adjusting your search or filters."
            : "Add your first member to get started.";
        }
      }
      renderPagination(0, 1);
      return;
    }

    if (empty) empty.hidden = true;

    if (tableBody) {
      tableBody.innerHTML = pageItems.map(m => renderTableRow(m, term)).join("");
      if (tableScroll) tableScroll.hidden = false;
    }

    if (cards) {
      cards.innerHTML = pageItems.map(m => renderMobileCard(m, term)).join("");
    }

    renderPagination(filtered.length, currentPage);
    bindRowEvents();
  }

  function bindRowEvents() {
    const handleRowClick = (memberId, e) => {
      if (e.target.closest(".mem-actions")) return;
      openDrawer(memberId);
    };

    document.querySelectorAll(".mem-row, .mem-card").forEach(row => {
      const id = parseInt(row.dataset.memberId, 10);
      row.addEventListener("click", e => handleRowClick(id, e));
      row.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!e.target.closest(".mem-actions")) openDrawer(id);
        }
      });
    });

    document.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "view") openDrawer(parseInt(btn.dataset.id, 10));
        else if (action === "edit") openEditModal(parseInt(btn.dataset.idx, 10));
        else if (action === "delete") openDeleteModal(parseInt(btn.dataset.idx, 10));
      });
    });
  }

  function showLoading() {
    const loader = $("memTableLoader");
    const tableScroll = $("memTableScroll");
    const cards = $("memCards");
    const empty = $("memEmpty");
    if (loader) loader.hidden = false;
    if (tableScroll) tableScroll.hidden = true;
    if (cards) cards.innerHTML = "";
    if (empty) empty.hidden = true;
    const pag = $("memPagination");
    if (pag) pag.hidden = true;
  }

  // ── Data fetching ─────────────────────────────────────────────────────────
  function indexLatestByMember(rows, idKey) {
    const map = new Map();
    rows.forEach(row => {
      const mid = row.member_id;
      if (mid == null) return;
      const existing = map.get(mid);
      const rowId = row.enrollment_id || row.payment_id || row[idKey] || 0;
      const existId = existing ? (existing.enrollment_id || existing.payment_id || existing[idKey] || 0) : 0;
      if (!existing || rowId > existId) map.set(mid, row);
    });
    return map;
  }

  async function fetchEnrollments() {
    try {
      const res = await fetch(`${config.API_BASE}/enrollments`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const rows = json.data ?? [];
      enrollmentsByMember = indexLatestByMember(rows, "enrollment_id");
    } catch {
      enrollmentsByMember = new Map();
    }
  }

  async function fetchPayments() {
    try {
      const res = await fetch(`${config.API_BASE}/payments`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const rows = json.data ?? [];
      paymentsByMember = indexLatestByMember(rows, "payment_id");
    } catch {
      paymentsByMember = new Map();
    }
  }

  async function fetchMembers(silent = false) {
    const notice = $("membersNotice");
    if (!silent) showLoading();
    clearNotice(notice);

    try {
      const [membersRes] = await Promise.all([
        fetch(`${config.MEMBERS_API}`),
        fetchEnrollments(),
        fetchPayments(),
      ]);

      if (!membersRes.ok) throw new Error("Backend not connected");
      const json = await membersRes.json();
      const rows = json.data ?? (Array.isArray(json) ? json : []);

      allMembers = rows.map(m => ({
        ...m,
        id: m.member_id || m.id,
        gym_id: m.gym_id || config.GYM_ID,
      }));

      profileCache.clear();
      updateStats();
      currentPage = 1;
      render();

      if (onMembersUpdate) onMembersUpdate(allMembers);
      if (!silent) toast("Members loaded successfully.");
    } catch {
      allMembers = [];
      profileCache.clear();
      updateStats();
      render();
      if (onMembersUpdate) onMembersUpdate(allMembers);
      showNotice(notice, "Backend not connected. Please start the server.", "error");
      if (!silent) toast("Backend not connected", "error");
    }
  }

  // ── Drawer ────────────────────────────────────────────────────────────────
  function openDrawer(memberId) {
    selectedMemberId = memberId;
    render();

    const overlay = $("memDrawerOverlay");
    const drawer = $("memDrawer");
    overlay?.classList.add("open");
    drawer?.classList.add("open");
    overlay?.setAttribute("aria-hidden", "false");
    drawer?.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    loadDrawerProfile(memberId);
  }

  function closeDrawer() {
    selectedMemberId = null;
    render();
    const overlay = $("memDrawerOverlay");
    const drawer = $("memDrawer");
    overlay?.classList.remove("open");
    drawer?.classList.remove("open");
    overlay?.setAttribute("aria-hidden", "true");
    drawer?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function drawerDlRow(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
  }

  async function loadDrawerProfile(memberId) {

    const loader = $("memDrawerLoader");
    const content = $("memDrawerContent");
    const error = $("memDrawerError");

    let data = profileCache.get(memberId);

    // If profile is already cached, skip skeleton completely
    if (data) {
        loader.hidden = true;
        error.hidden = true;
        content.hidden = false;
    } else {
        loader.hidden = false;
        content.hidden = true;
        error.hidden = true;
    }

    try {

        if (!data) {
            const res = await fetch(`${config.MEMBERS_API}/${memberId}/profile`);
            const json = await res.json().catch(() => ({}));

            if (!res.ok)
                throw new Error(json.message || "Could not load profile.");

            data = json.data;
            profileCache.set(memberId, data);
        }

        const { member, enrollment, payment } = data;

        const color = avatarColor(member.name);
        const initials = memberInitials(member.name);
        const status = membershipStatusMeta(enrollment);

        $("memDrawerAvatar").textContent = initials;
        $("memDrawerAvatar").style.background = color;

        $("memDrawerName").textContent =
            member.name || "Member";

        $("memDrawerStatusBadge").className =
            `mem-badge ${status.badgeClass}`;

        $("memDrawerStatusBadge").textContent =
            status.label;

        $("memDrawerPlanBadge").textContent =
            enrollment?.plan_name || "No Plan";

        $("memDrawerPersonal").innerHTML = [

            drawerDlRow("Phone", escapeHtml(member.phone || "—")),

            drawerDlRow("Email", escapeHtml(member.email || "—")),

            drawerDlRow("Gender", escapeHtml(member.gender || "—")),

            drawerDlRow("DOB", formatDate(member.date_of_birth)),

            drawerDlRow("Address", escapeHtml(member.address || "—"))

        ].join("");

        if (enrollment) {

            const days = daysRemaining(enrollment.end_date);

            $("memDrawerMembership").innerHTML = [

                drawerDlRow("Plan", escapeHtml(enrollment.plan_name || "—")),

                drawerDlRow("Fee", formatCurrency(enrollment.plan_fee)),

                drawerDlRow("Join Date", formatDate(enrollment.start_date)),

                drawerDlRow("Expiry Date", formatDate(enrollment.end_date)),

                drawerDlRow(
                    "Remaining Days",
                    days == null
                        ? "—"
                        : days < 0
                            ? "0 days"
                            : `${days} day${days === 1 ? "" : "s"}`
                )

            ].join("");

        } else {

            $("memDrawerMembership").innerHTML =
                drawerDlRow("Status", statusBadgeHtml(status));

        }

        if (payment) {

            $("memDrawerPayment").innerHTML = [

                drawerDlRow("Last Amount", formatCurrency(payment.amount)),

                drawerDlRow("Payment Date", formatDate(payment.payment_date)),

                drawerDlRow("Payment Mode", escapeHtml(payment.payment_mode || "—"))

            ].join("");

        } else {

            $("memDrawerPayment").innerHTML =
                drawerDlRow("Status", "No payments recorded");

        }

        // smooth fade
        loader.style.opacity = "0";

        setTimeout(() => {

            loader.hidden = true;

            content.hidden = false;

            content.style.opacity = "0";

            requestAnimationFrame(() => {

                content.style.transition = "opacity .2s ease";
                content.style.opacity = "1";

            });

        }, 180);

    } catch (err) {

        loader.hidden = true;

        error.hidden = false;

        error.textContent =
            err.message || "Could not load profile.";

    }

}
  // ── Modals ────────────────────────────────────────────────────────────────
  function openModal(id) {
    $(id)?.classList.add("open");
  }

  function closeModal(id) {
    $(id)?.classList.remove("open");
  }

  function openAddModal() {
    openModal("memberFormModal");
    const dateInput = $("memberPaymentDate");
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split("T")[0];
    populatePlanDropdown();
    setTimeout(() => $("name")?.focus(), 80);
  }

  function closeAddModal() {
    closeModal("memberFormModal");
    clearNotice($("formNotice"));
    $("memberForm")?.reset();
  }

  function populatePlanDropdown() {
    const sel = $("memberPlanId");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Select plan</option>';
    plans.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.plan_id || p.Plan_ID;
      opt.textContent = `${p.plan_name || p.Plan_Name} (${p.duration || p.Duration}mo — ₹${parseFloat(p.fee || p.Fee || 0).toFixed(0)})`;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function fillAmountFromPlan() {
    const sel = $("memberPlanId");
    const amountInput = $("memberAmount");
    if (!sel || !amountInput) return;
    const plan = plans.find(p => String(p.plan_id || p.Plan_ID) === sel.value);
    if (plan) {
      amountInput.value = parseFloat(plan.fee || plan.Fee || 0).toFixed(2);
      clearFieldError(amountInput);
    } else {
      amountInput.value = "";
    }
  }

  function openEditModal(idx) {
    const m = allMembers[idx];
    if (!m) return;
    $("editMemberIndex").value = String(idx);
    $("editName").value = m.name || "";
    $("editGender").value = m.gender || "";
    $("editPhone").value = m.phone || "";
    $("editEmail").value = m.email || "";
    $("editDob").value = m.date_of_birth || m.dob || "";
    $("editAddress").value = m.address || "";
    openModal("editMemberModal");
    closeDrawer();
  }

  function closeEditModal() {
    closeModal("editMemberModal");
    $("editMemberForm")?.reset();
  }

  function openDeleteModal(idx) {
    const m = allMembers[idx];
    if (!m) return;
    pendingDeleteIdx = idx;
    $("memDeleteName").textContent = m.name || "this member";
    openModal("memDeleteModal");
  }

  function closeDeleteModal() {
    pendingDeleteIdx = null;
    closeModal("memDeleteModal");
  }

  async function confirmDelete() {
    if (pendingDeleteIdx == null) return;
    const member = allMembers[pendingDeleteIdx];
    if (!member) { closeDeleteModal(); return; }

    const btn = $("memDeleteConfirmBtn");
    setButtonLoading(btn, true, "Deleting…");
    let ok = false;

    if (member.id) {
      try {
        const res = await fetch(`${config.MEMBERS_API}/${member.id}`, { method: "DELETE" });
        ok = res.ok;
      } catch { ok = false; }
      profileCache.delete(member.id);
    }

    if (selectedMemberId === member.id) closeDrawer();
    closeDeleteModal();

    await fetchMembers(true);
    setButtonLoading(btn, false, "Delete");
    toast(ok ? "Member deleted successfully." : "Backend unavailable.", ok ? "success" : "error");

    if (config.onPaymentsRefresh) config.onPaymentsRefresh();
    if (config.onEnrollmentsRefresh) config.onEnrollmentsRefresh();
  }

  // ── Form submissions ──────────────────────────────────────────────────────
  async function handleAddSubmit(e) {
    e.preventDefault();
    const form = $("memberForm");
    const notice = $("formNotice");
    clearNotice(notice);
    clearFormErrors(form);

    const fd = new FormData(form);
    const planId = fd.get("memberPlanId")?.toString().trim();
    const amountVal = fd.get("memberAmount")?.toString().trim();
    const amount = parseFloat(amountVal || "0");

    const payload = {
      name: fd.get("name")?.toString().trim(),
      gender: fd.get("gender")?.toString().trim(),
      date_of_birth: fd.get("dob")?.toString().trim(),
      phone: fd.get("phone")?.toString().trim(),
      email: fd.get("email")?.toString().trim() || null,
      address: fd.get("address")?.toString().trim(),
      branch_id: 1,
      gym_id: config.GYM_ID,
      plan_id: planId ? parseInt(planId, 10) : null,
      amount,
      payment_mode: fd.get("memberPaymentMode")?.toString().trim(),
      status: fd.get("memberPaymentStatus")?.toString().trim(),
      payment_date: fd.get("memberPaymentDate")?.toString().trim() || null,
    };

    let valid = true;
    if (!validateRequired($("name"), "Name")) valid = false;
    if (!validateRequired($("gender"), "Gender")) valid = false;
    if (!validateRequired($("dob"), "Date of birth")) valid = false;
    if (!validateRequired($("address"), "Address")) valid = false;
    if (!validatePhone($("phone"))) valid = false;
    if (!validateEmail($("email"))) valid = false;
    if (!validateRequired($("memberPlanId"), "Plan")) valid = false;
    if (!validateRequired($("memberPaymentMode"), "Payment mode")) valid = false;
    if (!validateRequired($("memberPaymentStatus"), "Payment status")) valid = false;
    if (!validateRequired($("memberPaymentDate"), "Payment date")) valid = false;
    if (!amountVal || isNaN(amount) || amount <= 0) {
      setFieldError($("memberAmount"), "Amount must be greater than zero.");
      valid = false;
    }
    if (!valid) { showNotice(notice, "Please fix the highlighted fields.", "error"); return; }

    const submitBtn = $("submitMemberFormBtn");
    setButtonLoading(submitBtn, true, "Registering…");

    try {
      const res = await fetch(`${config.MEMBERS_API}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Registration failed.");

      showNotice(notice, "Member registered successfully.", "success");
      form.reset();
      closeAddModal();
      await fetchMembers(true);
      toast("Member registered with enrollment and payment.");

      if (config.onPaymentsRefresh) await config.onPaymentsRefresh();
      if (config.onEnrollmentsRefresh) await config.onEnrollmentsRefresh();
    } catch (err) {
      showNotice(notice, err.message, "error");
      toast(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false, "Register Member");
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    const form = $("editMemberForm");
    clearFormErrors(form);

    const idx = parseInt($("editMemberIndex").value || "-1", 10);
    const existing = allMembers[idx];
    if (!existing) { closeEditModal(); return; }

    let valid = true;
    if (!validateRequired($("editName"), "Name")) valid = false;
    if (!validateRequired($("editGender"), "Gender")) valid = false;
    if (!validatePhone($("editPhone"))) valid = false;
    if (!validateEmail($("editEmail"))) valid = false;
    if (!valid) { toast("Please fix the highlighted fields.", "error"); return; }

    const updated = {
      ...existing,
      name: $("editName").value.trim(),
      gender: $("editGender").value.trim(),
      phone: $("editPhone").value.trim(),
      email: $("editEmail").value.trim(),
      date_of_birth: $("editDob").value || existing.date_of_birth || "",
      address: $("editAddress").value.trim() || existing.address || "",
    };

    const saveBtn = $("saveEditBtn");
    setButtonLoading(saveBtn, true, "Saving…");
    let ok = false;

    if (existing.id) {
      try {
        const res = await fetch(`${config.MEMBERS_API}/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: updated.name,
            gender: updated.gender,
            phone: updated.phone,
            email: updated.email || null,
            address: updated.address,
            date_of_birth: updated.date_of_birth,
            branch_id: existing.branch_id || 1,
            gym_id: existing.gym_id || config.GYM_ID,
          }),
        });
        ok = res.ok;
      } catch { ok = false; }
      profileCache.delete(existing.id);
    }

    allMembers[idx] = updated;
    updateStats();
    render();
    closeEditModal();
    if (onMembersUpdate) onMembersUpdate(allMembers);

    setButtonLoading(saveBtn, false, "Save Changes");
    toast(ok ? "Member updated successfully." : "Updated locally — backend unavailable.", ok ? "success" : "error");
  }

  // ── Event binding ─────────────────────────────────────────────────────────
  function bindEvents() {
    ["memHeaderAddBtn", "memToolbarAddBtn", "memEmptyAddBtn"].forEach(id => {
      $(id)?.addEventListener("click", openAddModal);
    });

    $("memRefreshBtn")?.addEventListener("click", () => fetchMembers());

    $("memSearchInput")?.addEventListener("input", () => {
      currentPage = 1;
      const global = $("memberSearch");
      if (global) global.value = $("memSearchInput").value;
      render();
    });

    $("memberSearch")?.addEventListener("input", () => {
      currentPage = 1;
      const local = $("memSearchInput");
      if (local) local.value = $("memberSearch").value;
      render();
    });

    $("memStatusFilter")?.addEventListener("change", () => { currentPage = 1; render(); });
    $("memPlanFilter")?.addEventListener("change", () => { currentPage = 1; render(); });

    $("memPrevBtn")?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; render(); } });
    $("memNextBtn")?.addEventListener("click", () => {
      const total = getFilteredMembers().length;
      if (currentPage < Math.ceil(total / PAGE_SIZE)) { currentPage++; render(); }
    });

    // Drawer
    $("memDrawerCloseBtn")?.addEventListener("click", closeDrawer);
    $("memDrawerCloseFooterBtn")?.addEventListener("click", closeDrawer);
    $("memDrawerOverlay")?.addEventListener("click", closeDrawer);
    $("memDrawerEditBtn")?.addEventListener("click", () => {
      const idx = allMembers.findIndex(m => (m.id || m.member_id) === selectedMemberId);
      if (idx >= 0) openEditModal(idx);
    });
    $("memDrawerDeleteBtn")?.addEventListener("click", () => {
      const idx = allMembers.findIndex(m => (m.id || m.member_id) === selectedMemberId);
      if (idx >= 0) openDeleteModal(idx);
    });

    // Add modal
    $("closeMemberFormBtn")?.addEventListener("click", closeAddModal);
    $("cancelMemberFormBtn")?.addEventListener("click", closeAddModal);
    $("memberFormModal")?.addEventListener("click", e => { if (e.target.id === "memberFormModal") closeAddModal(); });
    $("memberForm")?.addEventListener("submit", handleAddSubmit);
    $("memberPlanId")?.addEventListener("change", fillAmountFromPlan);

    // Edit modal
    $("cancelEditBtn")?.addEventListener("click", closeEditModal);
    $("cancelEditMemberBtn")?.addEventListener("click", closeEditModal);
    $("editMemberModal")?.addEventListener("click", e => { if (e.target.id === "editMemberModal") closeEditModal(); });
    $("editMemberForm")?.addEventListener("submit", handleEditSubmit);

    // Delete modal
    $("memDeleteCloseBtn")?.addEventListener("click", closeDeleteModal);
    $("memDeleteCancelBtn")?.addEventListener("click", closeDeleteModal);
    $("memDeleteModal")?.addEventListener("click", e => { if (e.target.id === "memDeleteModal") closeDeleteModal(); });
    $("memDeleteConfirmBtn")?.addEventListener("click", confirmDelete);

    // Escape key
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if ($("memDeleteModal")?.classList.contains("open")) closeDeleteModal();
      else if ($("editMemberModal")?.classList.contains("open")) closeEditModal();
      else if ($("memberFormModal")?.classList.contains("open")) closeAddModal();
      else if ($("memDrawer")?.classList.contains("open")) closeDrawer();
    });
  }

  // ── Mount HTML ────────────────────────────────────────────────────────────
  async function mountHTML() {
    const pageContent = document.querySelector(".page-content");
    if (!pageContent || $("membersPage")) return;

    try {
      const res = await fetch("members.html");
      if (!res.ok) throw new Error("fetch failed");
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      doc.querySelectorAll("section[data-tab-content='members'], body > div, body > aside").forEach(node => {
        if (node.matches("section")) {
          const trainers = pageContent.querySelector("[data-tab-content='trainers']");
          if (trainers) pageContent.insertBefore(node, trainers);
          else pageContent.appendChild(node);
        } else {
          document.body.appendChild(node);
        }
      });
    } catch {
      console.warn("MembersModule: could not load members.html — ensure it is served over HTTP.");
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.MembersModule = {
    async init(options = {}) {
      config = {
        API_BASE: options.API_BASE || "http://localhost:5001",
        MEMBERS_API: options.MEMBERS_API || `${options.API_BASE || "http://localhost:5001"}/members`,
        GYM_ID: options.GYM_ID || 1,
        showToast: options.showToast || (() => {}),
        onPaymentsRefresh: options.onPaymentsRefresh || null,
        onEnrollmentsRefresh: options.onEnrollmentsRefresh || null,
      };

      plans = options.plans || [];
      onMembersUpdate = options.onMembersUpdate || null;

      await mountHTML();
      bindEvents();
    },

    async load() {
      await fetchMembers();
    },

    getMembers() {
      return allMembers;
    },

    setPlans(newPlans) {
      plans = newPlans || [];
      populatePlanDropdown();
    },

    setSearch(term) {
      const input = $("memSearchInput");
      if (input) input.value = term;
      currentPage = 1;
      render();
    },

    refresh: fetchMembers,
  };
})();
