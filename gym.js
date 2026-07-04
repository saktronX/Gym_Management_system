
    // ─── CONFIG ────────────────────────────────────────────────────────────────
    const API_BASE = "http://localhost:5001";
    const MEMBERS_API = `${API_BASE}/members`;
    const TRAINERS_API = `${API_BASE}/trainers`;
    const PAYMENTS_API = `${API_BASE}/payments`;
    const PLANS_API = `${API_BASE}/plans`;
    const ENROLLMENT_API = `${API_BASE}/enrollments`;

    const GYM_ID = 1; // Default Gym_ID for all records

    const AUTH_USERNAME = "admin";
    const AUTH_PASSWORD = "1234";
    const AUTH_KEY = "isLoggedIn";

    // ─── LOCAL STATE ───────────────────────────────────────────────────────────
    // Trainers, payments, enrollments stored locally as fallback
    const TRAINERS_KEY = "gms_trainers";
    const PAYMENTS_KEY = "gms_payments";
    const ENROLLMENTS_KEY = "gms_enrollments";
    const PLANS_KEY = "gms_plans";

    let allMembers = [];
    let trainers = [];
    let payments = [];
    let enrollments = [];
    let plans = [];

    // Fallback plans using snake_case matching membership_plan table
    const FALLBACK_PLANS = [
      { plan_id: 1, plan_name: "Basic", duration: 1, fee: 2000.00, description: "Standard gym access, 1 fitness assessment, locker room." },
      { plan_id: 2, plan_name: "Premium", duration: 3, fee: 5000.00, description: "Unlimited access, group classes, 2 personal sessions." },
      { plan_id: 3, plan_name: "Pro", duration: 6, fee: 9000.00, description: "All Premium features + nutrition guidance + weekly tracking." },
    ];

    // ─── DOM REFS ──────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const appContainer = $("appContainer");
    const loginScreen = $("loginScreen");
    const loginForm = $("loginForm");
    const loginUsername = $("loginUsername");
    const loginPassword = $("loginPassword");
    const loginNotice = $("loginNotice");
    const logoutBtn = $("logoutBtn");
    const memberForm = $("memberForm");
    const fetchMembersBtn = $("fetchMembersBtn");
    const membersList = $("membersList");
    const emptyState = $("emptyState");
    const formNotice = $("formNotice");
    const membersNotice = $("membersNotice");
    const totalMembersCount = $("totalMembersCount");
    const memberSearch = $("memberSearch");
    const trainerForm = $("trainerForm");
    const trainerNotice = $("trainerNotice");
    const trainerList = $("trainerList");
    const trainerEmptyState = $("trainerEmptyState");
    const paymentForm = $("paymentForm");
    const paymentNotice = $("paymentNotice");
    const paymentHistory = $("paymentHistory");
    const paymentEmptyState = $("paymentEmptyState");
    const totalTrainersCount = $("totalTrainersCount");
    const totalRevenueValue = $("totalRevenueValue");
    const toastContainer = $("toastContainer");
    const membersLoader = $("membersLoader");
    const plansGrid = $("plansGrid");
    const enrollmentForm = $("enrollmentForm");
    const enrollmentNotice = $("enrollmentNotice");
    const enrollmentList = $("enrollmentList");
    const enrollmentEmptyState = $("enrollmentEmptyState");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll("[data-tab-content]");
    const editMemberModal = $("editMemberModal");
    const editMemberForm = $("editMemberForm");
    const editMemberIndex = $("editMemberIndex");
    const editName = $("editName");
    const editGender = $("editGender");
    const editPhone = $("editPhone");
    const editEmail = $("editEmail");
    const cancelEditBtn = $("cancelEditBtn");
    const saveEditBtn = $("saveEditBtn");

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_REGEX = /^\d{10}$/;

    // ─── TABS ──────────────────────────────────────────────────────────────────
    function setActiveTab(targetTab) {
      tabButtons.forEach(btn => {
        const active = btn.dataset.tabTarget === targetTab;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      tabContents.forEach(sec => {
        const show = sec.dataset.tabContent === targetTab;
        if (show) {
          sec.style.display = "";
          sec.classList.remove("tab-content-enter");
          void sec.offsetWidth;
          sec.classList.add("tab-content-enter");
        } else {
          sec.style.display = "none";
          sec.classList.remove("tab-content-enter");
        }
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    tabButtons.forEach(btn => btn.addEventListener("click", () => setActiveTab(btn.dataset.tabTarget)));

    // ─── AUTH ──────────────────────────────────────────────────────────────────
    let _isLoggedIn = false;
    const isAuthenticated = () => {
      try { return localStorage.getItem(AUTH_KEY) === "true"; } catch { return _isLoggedIn; }
    };
    const setAuthenticated = v => {
      _isLoggedIn = !!v;
      try { localStorage.setItem(AUTH_KEY, v ? "true" : "false"); } catch { /* blocked */ }
    };

    function showApp() {
      loginScreen.style.display = "none";
      appContainer.style.display = "";
      setActiveTab("dashboard");
    }
    function showLogin() {
      appContainer.style.display = "none";
      loginScreen.style.display = "flex";
      loginUsername.focus();
    }

    loginForm.addEventListener("submit", e => {
      e.preventDefault();
      clearNotice(loginNotice);
      const uv = validateRequiredField(loginUsername, "Username");
      const pv = validateRequiredField(loginPassword, "Password");
      if (!uv || !pv) { showNotice(loginNotice, "Please enter username and password.", "error"); return; }
      if (loginUsername.value.trim() === AUTH_USERNAME && loginPassword.value.trim() === AUTH_PASSWORD) {
        setAuthenticated(true);
        loginForm.reset();
        showApp();
        showToast("Login successful.");
      } else {
        showNotice(loginNotice, "Invalid username or password.", "error");
      }
    });

    logoutBtn.addEventListener("click", () => { setAuthenticated(false); showLogin(); showToast("Logged out successfully."); });

    // ─── TOAST ─────────────────────────────────────────────────────────────────
    function showToast(message, type = "success") {
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 2400);
    }

    // ─── NOTICE / FIELD ERRORS ─────────────────────────────────────────────────
    function showNotice(el, msg, type) { el.textContent = msg; el.className = `notice ${type}`; el.style.display = "block"; }
    function clearNotice(el) { el.textContent = ""; el.className = "notice"; el.style.display = "none"; }

    function setFieldError(input, msg) {
      const field = input.closest(".field");
      if (!field) return;
      field.classList.add("has-error");
      let err = field.querySelector(".error-text");
      if (!err) { err = document.createElement("p"); err.className = "error-text"; field.appendChild(err); }
      err.textContent = msg;
    }
    function clearFieldError(input) {
      const field = input.closest(".field");
      if (!field) return;
      field.classList.remove("has-error");
      field.querySelector(".error-text")?.remove();
    }
    function clearFormErrors(form) {
      form.querySelectorAll(".field.has-error").forEach(f => f.classList.remove("has-error"));
      form.querySelectorAll(".error-text").forEach(e => e.remove());
    }

    function validateRequiredField(input, label) {
      if (!input.value.trim()) { setFieldError(input, `${label} is required.`); return false; }
      clearFieldError(input); return true;
    }
    function validateEmailField(input, required = false) {
      const v = input.value.trim();
      if (!v) { if (required) { setFieldError(input, "Email is required."); return false; } clearFieldError(input); return true; }
      if (!EMAIL_REGEX.test(v)) { setFieldError(input, "Please enter a valid email address."); return false; }
      clearFieldError(input); return true;
    }
    function validatePhoneField(input) {
      const v = input.value.trim();
      if (!v) { setFieldError(input, "Phone is required."); return false; }
      if (!PHONE_REGEX.test(v)) { setFieldError(input, "Phone must be numeric and exactly 10 digits."); return false; }
      clearFieldError(input); return true;
    }

    // ─── LOCAL STORAGE HELPERS ─────────────────────────────────────────────────
    function loadArr(key) {
      try { const r = localStorage.getItem(key); if (!r) return []; const p = JSON.parse(r); return Array.isArray(p) ? p : []; }
      catch { return []; }
    }
    function saveArr(key, arr) {
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* blocked in file:// */ }
    }

    // ─── ESCAPE / HIGHLIGHT ────────────────────────────────────────────────────
    function escapeHtml(v) {
      return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    }
    function highlightMatch(text, term) {
      const safe = escapeHtml(text || "Unknown");
      if (!term) return safe;
      return safe.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), '<span class="highlight">$1</span>');
    }

    // ─── BUTTON LOADING ────────────────────────────────────────────────────────
    function setButtonLoading(btn, loading, text) {
      if (!btn) return;
      if (loading) { btn.dataset.origText = btn.textContent; btn.textContent = text; btn.disabled = true; }
      else { btn.disabled = false; btn.textContent = btn.dataset.origText || btn.textContent; }
    }

    // ─── DASHBOARD STATS ───────────────────────────────────────────────────────
    function updateDashboardStats() {
      totalMembersCount.textContent = String(allMembers.length);
      totalTrainersCount.textContent = String(trainers.length);
      const total = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      totalRevenueValue.textContent = total.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
      });
      // Phase 2 — refresh charts whenever stats update
      initCharts();
      updateRecentPayments();
    }

    // ─── MEMBERSHIP PLANS ──────────────────────────────────────────────────────
    async function fetchPlans() {
      try {
        const res = await fetch(PLANS_API);
        if (!res.ok) throw new Error("Backend plans unavailable");
        const json = await res.json();
        const rows = json.data ?? (Array.isArray(json) ? json : []);
        if (rows.length === 0) throw new Error("Empty plans");
        plans = rows;
      } catch {
        plans = [...FALLBACK_PLANS];
      }
      renderPlans();
      populatePlanDropdowns();
    }

    function renderPlans() {
      const colors = ["basic-plan", "premium-plan", "pro-plan"];
      plansGrid.innerHTML = plans.map((p, i) => `
          <article class="plan-card ${colors[i % colors.length]}">
            <h3>${escapeHtml(p.plan_name || p.Plan_Name)}</h3>
            <p class="plan-price">₹${parseFloat(p.fee || p.Fee || 0).toFixed(2)}</p>
            <p class="plan-duration">Duration: ${escapeHtml(String(p.duration || p.Duration || "—"))} month(s)</p>
            <p style="font-size:0.88rem;color:#475569;margin-top:8px">${escapeHtml(p.description || p.Description || "")}</p>
          </article>
        `).join("");
    }

    function populatePlanDropdowns() {
      // Populate both enrollment plan dropdown and payment plan dropdown
      [$("enrollPlanId"), $("paymentPlanId")].forEach(sel => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select Plan</option>';
        plans.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.plan_id || p.Plan_ID;
          opt.textContent = `${p.plan_name || p.Plan_Name} (${p.duration || p.Duration}mo — ₹${parseFloat(p.fee || p.Fee || 0).toFixed(0)})`;
          sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
      });
    }

    // ─── MEMBER DROPDOWN POPULATE ──────────────────────────────────────────────
    function populateMemberDropdowns() {
      // Both payment and enrollment have member selectors (after DB migration)
      [$("paymentMemberId"), $("enrollMemberId")].forEach(sel => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">Select Member</option>';
        allMembers.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.id || m.member_id;
          opt.textContent = `${m.name} (ID: ${m.id || m.member_id})`;
          sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
      });
    }

    // ─── MEMBERS ───────────────────────────────────────────────────────────────
    async function fetchMembers() {
      clearNotice(membersNotice);
      setButtonLoading(fetchMembersBtn, true, "Fetching...");
      membersLoader.style.display = "flex";
      try {
        const res = await fetch(MEMBERS_API);
        if (!res.ok) throw new Error("Backend not connected");
        const json = await res.json();
        const rows = json.data ?? (Array.isArray(json) ? json : []);
        allMembers = rows.map(m => ({
          ...m,
          id: m.member_id || m.id,
          gym_id: m.gym_id || GYM_ID,
        }));
        updateDashboardStats();
        renderMembers(allMembers);
        populateMemberDropdowns();
        showToast("Members loaded successfully.");
      } catch {
        allMembers = [];
        updateDashboardStats();
        renderMembers(allMembers);
        showNotice(membersNotice, "Backend not connected", "error");
        showToast("Backend not connected", "error");
      } finally {
        setButtonLoading(fetchMembersBtn, false, "Fetching...");
        membersLoader.style.display = "none";
      }
    }

    fetchMembersBtn.addEventListener("click", fetchMembers);

    function renderMembers(members) {
      membersList.innerHTML = "";
      const term = memberSearch.value.trim().toLowerCase();
      const filtered = members
        .map((m, i) => ({ ...m, _idx: i }))
        .filter(m => (m.name || "").toLowerCase().includes(term));

      if (filtered.length === 0) {
        emptyState.style.display = "block";
        emptyState.textContent = term ? "No matching members found." : "No members found.";
        return;
      }
      emptyState.style.display = "none";

      filtered.forEach(m => {
        const card = document.createElement("article");
        card.className = "member-card";
        card.innerHTML = `
            <h3>${highlightMatch(m.name || "Unknown", term)}</h3>
            <p><strong>Gender:</strong> ${escapeHtml(m.gender || "—")}</p>
            <p><strong>Phone:</strong> ${escapeHtml(m.phone || "—")}</p>
            <p><strong>Email:</strong> ${escapeHtml(m.email || "—")}</p>
            <div class="card-actions">
              <button type="button" class="btn-soft" data-member-edit="${m._idx}">Edit</button>
              <button type="button" class="btn-danger-soft" data-member-delete="${m._idx}">Delete</button>
            </div>`;
        membersList.appendChild(card);
      });

      document.querySelectorAll("[data-member-edit]").forEach(btn => {
        btn.addEventListener("click", () => openEditModal(parseInt(btn.dataset.memberEdit)));
      });
      document.querySelectorAll("[data-member-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = parseInt(btn.dataset.memberDelete);
          if (idx < 0 || !allMembers[idx]) return;
          if (!confirm("Delete this member?")) return;
          const member = allMembers[idx];
          let ok = false;
          if (member.id) {
            try {
              const res = await fetch(`${MEMBERS_API}/${member.id}`, { method: "DELETE" });
              ok = res.ok;
            } catch { ok = false; }
          }
          allMembers.splice(idx, 1);
          updateDashboardStats();
          renderMembers(allMembers);
          populateMemberDropdowns();
          showToast(ok ? "Member deleted successfully." : "Backend unavailable — removed locally.", ok ? "success" : "error");
        });
      });
    }

    memberSearch.addEventListener("input", () => renderMembers(allMembers));

    memberForm.addEventListener("submit", async e => {
      e.preventDefault();
      clearNotice(formNotice);
      clearFormErrors(memberForm);
      const submitBtn = memberForm.querySelector('button[type="submit"]');
      const fd = new FormData(memberForm);

      // Payload matches member table snake_case column names
      const payload = {
        name: fd.get("name")?.toString().trim(),
        gender: fd.get("gender")?.toString().trim(),
        date_of_birth: fd.get("dob")?.toString().trim(),
        phone: fd.get("phone")?.toString().trim(),
        email: fd.get("email")?.toString().trim() || null,
        address: fd.get("address")?.toString().trim(),
        branch_id: 1,
        gym_id: GYM_ID,
      };

      let valid = true;
      if (!validateRequiredField($("name"), "Name")) valid = false;
      if (!validateRequiredField($("gender"), "Gender")) valid = false;
      if (!validateRequiredField($("dob"), "DOB")) valid = false;
      if (!validateRequiredField($("address"), "Address")) valid = false;
      if (!validatePhoneField($("phone"))) valid = false;
      if (!validateEmailField($("email"), false)) valid = false;
      if (!valid) { showNotice(formNotice, "Please fix the highlighted fields.", "error"); return; }

      try {
        setButtonLoading(submitBtn, true, "Adding...");
        const res = await fetch(MEMBERS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || "Failed");
        showNotice(formNotice, "Member added successfully.", "success");
        memberForm.reset();
        await fetchMembers();
        showToast("Member added successfully.");
      } catch (err) {
        showNotice(formNotice, `Could not add member: ${err.message}`, "error");
        showToast(`Could not add member: ${err.message}`, "error");
      } finally {
        setButtonLoading(submitBtn, false, "Adding...");
      }
    });

    // ─── EDIT MEMBER MODAL ─────────────────────────────────────────────────────
    function openEditModal(idx) {
      const m = allMembers[idx]; if (!m) return;
      editMemberIndex.value = String(idx);
      editName.value = m.name || ""; editGender.value = m.gender || "";
      editPhone.value = m.phone || ""; editEmail.value = m.email || "";
      editMemberModal.classList.add("show");
    }
    function closeEditModal() { editMemberModal.classList.remove("show"); editMemberForm.reset(); }

    editMemberForm.addEventListener("submit", async e => {
      e.preventDefault();
      clearFormErrors(editMemberForm);
      const idx = parseInt(editMemberIndex.value || "-1");
      const existing = allMembers[idx]; if (!existing) { closeEditModal(); return; }

      let valid = true;
      if (!validateRequiredField(editName, "Name")) valid = false;
      if (!validateRequiredField(editGender, "Gender")) valid = false;
      if (!validatePhoneField(editPhone)) valid = false;
      if (!validateEmailField(editEmail, false)) valid = false;
      if (!valid) { showToast("Please fix the highlighted fields.", "error"); return; }

      const updated = {
        ...existing,
        name: editName.value.trim(), gender: editGender.value.trim(),
        phone: editPhone.value.trim(), email: editEmail.value.trim(),
      };

      setButtonLoading(saveEditBtn, true, "Saving...");
      let ok = false;
      if (existing.id) {
        try {
          const res = await fetch(`${MEMBERS_API}/${existing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: updated.name,
              gender: updated.gender,
              phone: updated.phone,
              email: updated.email || null,
              address: updated.address || existing.address || "",
              date_of_birth: updated.date_of_birth || existing.date_of_birth || "",
              branch_id: existing.branch_id || 1,
              gym_id: existing.gym_id || GYM_ID,
            }),
          });
          ok = res.ok;
        } catch { ok = false; }
      }
      allMembers[idx] = updated;
      renderMembers(allMembers);
      populateMemberDropdowns();
      closeEditModal();
      setButtonLoading(saveEditBtn, false, "Saving...");
      showToast(ok ? "Member updated successfully." : "Backend unavailable — updated locally.", ok ? "success" : "error");
    });

    cancelEditBtn.addEventListener("click", closeEditModal);
    editMemberModal.addEventListener("click", e => { if (e.target === editMemberModal) closeEditModal(); });

    // ─── TRAINERS ──────────────────────────────────────────────────────────────
    async function fetchTrainers() {
      try {
        const res = await fetch(TRAINERS_API);
        if (!res.ok) throw new Error("Backend unavailable");
        const json = await res.json();
        const rows = json.data ?? (Array.isArray(json) ? json : []);
        trainers = rows.map(t => ({ ...t, id: t.trainer_id || t.id, trainer_id: t.trainer_id || t.id }));
        renderTrainers();
        updateDashboardStats();
      } catch { /* keep existing */ }
    }

    async function fetchPayments() {
      try {
        const res = await fetch(PAYMENTS_API);
        if (!res.ok) throw new Error("Backend unavailable");
        const json = await res.json();
        const rows = json.data ?? (Array.isArray(json) ? json : []);
        payments = rows.map(p => ({
          ...p,
          id: p.payment_id || p.id,
          payment_id: p.payment_id || p.id,
          memberName: p.memberName || `Member #${p.member_id}`,
          planName: p.planName || `Plan #${p.plan_id}`,
        }));
        renderPayments();
        updateDashboardStats();
      } catch { /* keep existing */ }
    }
    trainerForm.addEventListener("submit", async e => {
      e.preventDefault();
      clearNotice(trainerNotice);
      clearFormErrors(trainerForm);
      const fd = new FormData(trainerForm);
      const payload = {
        name: fd.get("trainerName")?.toString().trim(),
        specialization: fd.get("specialization")?.toString().trim() || null,
        phone: fd.get("trainerPhone")?.toString().trim(),
        email: fd.get("trainerEmail")?.toString().trim(),
        experience: parseInt(fd.get("trainerExperience")?.toString().trim() || "0", 10),
        gym_id: GYM_ID,
      };
      let valid = true;
      if (!validateRequiredField($("trainerName"), "Name")) valid = false;
      if (!validatePhoneField($("trainerPhone"))) valid = false;
      if (!validateEmailField($("trainerEmail"), true)) valid = false;
      if (!valid) { showNotice(trainerNotice, "Please fix the highlighted fields.", "error"); return; }
      const submitBtn = trainerForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Adding...");
      try {
        const res = await fetch(TRAINERS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || "Failed to save trainer.");
        showNotice(trainerNotice, "Trainer added successfully.", "success");
        trainerForm.reset();
        await fetchTrainers();
        showToast("Trainer saved to database.");
      } catch (err) {
        showNotice(trainerNotice, `Error: ${err.message}`, "error");
        showToast(`Could not add trainer: ${err.message}`, "error");
      } finally {
        setButtonLoading(submitBtn, false, "Adding...");
      }
    });

    function renderTrainers() {
      trainerList.innerHTML = "";
      updateDashboardStats();
      if (trainers.length === 0) { trainerEmptyState.style.display = "block"; return; }
      trainerEmptyState.style.display = "none";
      trainers.forEach((t, i) => {
        const card = document.createElement("article");
        card.className = "trainer-card";
        card.innerHTML = `
            <div class="item-head">
              <h3>${escapeHtml(t.name)}</h3>
              <button type="button" class="icon-delete" data-trainer-delete="${i}">Delete</button>
            </div>
            <p><strong>Specialization:</strong> ${escapeHtml(t.specialization || "—")}</p>
            <p><strong>Phone:</strong> ${escapeHtml(String(t.phone || "—"))}</p>
            <p><strong>Email:</strong> ${escapeHtml(t.email || "—")}</p>
            <p><strong>Experience:</strong> ${escapeHtml(String(t.experience ?? "—"))} yr(s)</p>`;
        trainerList.appendChild(card);
      });
      document.querySelectorAll("[data-trainer-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const i = parseInt(btn.dataset.trainerDelete);
          if (!confirm("Delete this trainer?")) return;
          const t = trainers[i];
          const tid = t.trainer_id || t.id;
          if (tid) {
            try {
              const res = await fetch(`${TRAINERS_API}/${tid}`, { method: "DELETE" });
              if (!res.ok) { showToast("Failed to delete trainer from database.", "error"); return; }
            } catch { showToast("Backend unavailable — could not delete.", "error"); return; }
          }
          trainers.splice(i, 1);
          saveArr(TRAINERS_KEY, trainers);
          renderTrainers();
          showToast("Trainer deleted.");
        });
      });
    }

    // ─── PAYMENTS ──────────────────────────────────────────────────────────────
    // DB: payment(payment_id, amount, payment_mode, status, member_id, plan_id, payment_date)
    paymentForm.addEventListener("submit", async e => {
      e.preventDefault();
      clearNotice(paymentNotice);
      clearFormErrors(paymentForm);
      const fd = new FormData(paymentForm);

      const memberId = fd.get("paymentMemberId")?.toString().trim();
      const planId = fd.get("paymentPlanId")?.toString().trim();
      const amountVal = fd.get("paymentAmount")?.toString().trim();
      const mode = fd.get("paymentMode")?.toString().trim();
      const payDate = fd.get("paymentDate")?.toString().trim() || null;
      const status = fd.get("paymentStatus")?.toString().trim();
      const amount = parseFloat(amountVal || "0");

      const memberIdSel = $("paymentMemberId");
      const planIdSel = $("paymentPlanId");
      const amountInput = $("paymentAmount");
      const modeSel = $("paymentMode");
      const statusSel = $("paymentStatus");

      let valid = true;
      if (!validateRequiredField(memberIdSel, "Member")) valid = false;
      if (!validateRequiredField(planIdSel, "Plan")) valid = false;
      if (!validateRequiredField(modeSel, "Payment Mode")) valid = false;
      if (!validateRequiredField(statusSel, "Status")) valid = false;
      if (!amountVal) { setFieldError(amountInput, "Amount is required."); valid = false; }
      else if (isNaN(amount) || amount <= 0) { setFieldError(amountInput, "Amount must be greater than zero."); valid = false; }
      else clearFieldError(amountInput);
      if (!valid) { showNotice(paymentNotice, "Please fix the highlighted fields.", "error"); return; }

      // Payload matches actual payment table columns exactly (after migration)
      const payload = {
        amount: amount,
        payment_mode: mode,
        status: status,
        member_id: parseInt(memberId, 10),
        plan_id: parseInt(planId, 10),
        payment_date: payDate || null,
      };

      const submitBtn = paymentForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Adding...");

      try {
        const res = await fetch(PAYMENTS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed to save payment."); }
        showNotice(paymentNotice, "Payment added successfully.", "success");
        paymentForm.reset();
        await fetchPayments();
        showToast("Payment added successfully.");
        updateDashboardStats();
      } catch (err) {
        showNotice(paymentNotice, `Backend unavailable — ${err.message}`, "error");
        showToast(`Backend unavailable — ${err.message}`, "error");
      } finally {
        setButtonLoading(submitBtn, false, "Adding...");
      }
    });

    function renderPayments() {
      paymentHistory.innerHTML = "";
      updateDashboardStats();
      if (payments.length === 0) { paymentEmptyState.style.display = "block"; return; }
      paymentEmptyState.style.display = "none";
      payments.forEach((p, i) => {
        const ps = p.status || p.Status || "";
        const statusClass = ps === "Completed" ? "badge-completed" : ps === "Pending" ? "badge-pending" : "badge-inactive";
        const item = document.createElement("li");
        item.className = "payment-item";
        item.innerHTML = `
            <div class="item-head">
              <strong>${escapeHtml(p.memberName || `Member #${p.member_id}`)}</strong>
              <button type="button" class="icon-delete" data-payment-delete="${i}">Delete</button>
            </div>
            <span>₹${parseFloat(p.amount || 0).toFixed(2)} via ${escapeHtml(p.payment_mode || "—")}</span>
            &nbsp;·&nbsp;<span class="badge ${statusClass}">${escapeHtml(ps || "—")}</span>
            ${p.planName ? `<br><small style="color:#475569">Plan: ${escapeHtml(p.planName)}</small>` : ""}
            <br><small style="color:#94a3b8">Date: ${escapeHtml(p.payment_date || "—")}</small>`;
        paymentHistory.appendChild(item);
      });
      document.querySelectorAll("[data-payment-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const i = parseInt(btn.dataset.paymentDelete);
          if (!confirm("Delete this payment?")) return;
          const p = payments[i];
          const pid = p.payment_id || p.id;
          if (!pid) { showToast("Cannot delete — no ID.", "error"); return; }
          try {
            const res = await fetch(`${PAYMENTS_API}/${pid}`, { method: "DELETE" });
            if (!res.ok) { showToast("Failed to delete payment.", "error"); return; }
          } catch { showToast("Backend unavailable — could not delete.", "error"); return; }
          await fetchPayments();
          showToast("Payment deleted.");
        });
      });
    }

    // ─── ENROLLMENT ────────────────────────────────────────────────────────────
    async function fetchEnrollments() {
      try {
        const res = await fetch(ENROLLMENT_API);
        if (!res.ok) throw new Error("Backend unavailable");
        const json = await res.json();
        const rows = json.data ?? (Array.isArray(json) ? json : []);
        enrollments = rows.map(en => ({
          ...en,
          id: en.enrollment_id || en.id,
          enrollment_id: en.enrollment_id || en.id,
          memberName: en.memberName || (en.member_id ? `Member #${en.member_id}` : "—"),
          planName: en.planName || `Plan #${en.plan_id}`,
        }));
        renderEnrollments();
      } catch { /* keep existing */ }
    }

    enrollmentForm.addEventListener("submit", async e => {
      e.preventDefault();
      clearNotice(enrollmentNotice);
      clearFormErrors(enrollmentForm);
      const fd = new FormData(enrollmentForm);

      // After migration: enrollment(enrollment_id, member_id, plan_id, start_date, end_date, status)
      const memberId = fd.get("enrollMemberId")?.toString().trim();
      const planId = fd.get("enrollPlanId")?.toString().trim();
      const startDate = fd.get("enrollStartDate")?.toString().trim();
      const endDate = fd.get("enrollEndDate")?.toString().trim();
      const status = fd.get("enrollStatus")?.toString().trim();

      let valid = true;
      if (!validateRequiredField($("enrollMemberId"), "Member")) valid = false;
      if (!validateRequiredField($("enrollPlanId"), "Plan")) valid = false;
      if (!validateRequiredField($("enrollStartDate"), "Start Date")) valid = false;
      if (!validateRequiredField($("enrollEndDate"), "End Date")) valid = false;
      if (!validateRequiredField($("enrollStatus"), "Status")) valid = false;
      if (!valid) { showNotice(enrollmentNotice, "Please fix the highlighted fields.", "error"); return; }

      if (new Date(endDate) <= new Date(startDate)) {
        setFieldError($("enrollEndDate"), "End date must be after start date.");
        showNotice(enrollmentNotice, "End date must be after start date.", "error");
        return;
      }

      const payload = {
        member_id: parseInt(memberId, 10),
        plan_id: parseInt(planId, 10),
        start_date: startDate,
        end_date: endDate,
        status: status,
      };

      const submitBtn = enrollmentForm.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true, "Enrolling...");

      try {
        const res = await fetch(ENROLLMENT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Failed to save enrollment."); }
        showNotice(enrollmentNotice, "Member enrolled successfully.", "success");
        enrollmentForm.reset();
        await fetchEnrollments();
        showToast("Member enrolled successfully.");
      } catch (err) {
        showNotice(enrollmentNotice, `Backend unavailable — ${err.message}`, "error");
        showToast(`Backend unavailable — ${err.message}`, "error");
      } finally {
        setButtonLoading(submitBtn, false, "Enrolling...");
      }
    });

    function renderEnrollments() {
      enrollmentList.innerHTML = "";
      if (enrollments.length === 0) { enrollmentEmptyState.style.display = "block"; return; }
      enrollmentEmptyState.style.display = "none";
      enrollments.forEach((en, i) => {
        const s = en.status || en.Status || "";
        const statusClass = s === "Active" ? "badge-active" : s === "Expired" ? "badge-inactive" : "badge-pending";
        const card = document.createElement("article");
        card.className = "enrollment-card";
        card.innerHTML = `
            <div class="item-head">
              <h3>${escapeHtml(en.planName || `Plan #${en.plan_id || en.Plan_ID}`)}</h3>
              <button type="button" class="icon-delete" data-enroll-delete="${i}">Delete</button>
            </div>
            <p><strong>Period:</strong> ${escapeHtml(en.start_date || en.Start_Date)} → ${escapeHtml(en.end_date || en.End_Date)}</p>
            <p><strong>Status:</strong> <span class="badge ${statusClass}">${escapeHtml(s)}</span></p>`;
        enrollmentList.appendChild(card);
      });
      document.querySelectorAll("[data-enroll-delete]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const i = parseInt(btn.dataset.enrollDelete);
          if (!confirm("Delete this enrollment?")) return;
          const en = enrollments[i];
          const eid = en.enrollment_id || en.id;
          if (!eid) { showToast("Cannot delete — no ID.", "error"); return; }
          try {
            const res = await fetch(`${ENROLLMENT_API}/${eid}`, { method: "DELETE" });
            if (!res.ok) { showToast("Failed to delete enrollment.", "error"); return; }
          } catch { showToast("Backend unavailable — could not delete.", "error"); return; }
          await fetchEnrollments();
          showToast("Enrollment deleted.");
        });
      });
    }

    // ─── INIT ──────────────────────────────────────────────────────────────────
    function init() {
      // Show fallback plans immediately so dropdowns aren't empty
      plans = [...FALLBACK_PLANS];
      renderPlans();
      populatePlanDropdowns();
      updateDashboardStats();

      if (isAuthenticated()) {
        showApp();
        // All data comes from the database — no localStorage pre-seeding
        fetchMembers();
        fetchTrainers();
        fetchPayments();
        fetchEnrollments();
        fetchPlans();
      } else {
        showLogin();
      }
    }

    init();


    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — CHART.JS INTEGRATION
    // ═══════════════════════════════════════════════════════════════════════════

    let revenueChartInstance = null;
    let enrollmentChartInstance = null;

    function initCharts() {
      if (typeof Chart === 'undefined') return;

      // ── Revenue Line Chart ────────────────────────────────────────────────
      const revenueCtx = document.getElementById('revenueChart');
      if (revenueCtx) {
        // Group payments by month (e.g. "Jun '25")
        const monthMap = {};
        payments.forEach(p => {
          const raw = p.payment_date || p.created_at || null;
          const key = raw
            ? new Date(raw).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
            : 'Unknown';
          monthMap[key] = (monthMap[key] || 0) + (parseFloat(p.amount) || 0);
        });

        const labels = Object.keys(monthMap);
        const data   = Object.values(monthMap);

        if (revenueChartInstance) revenueChartInstance.destroy();
        revenueChartInstance = new Chart(revenueCtx, {
          type: 'line',
          data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
              label: 'Revenue (₹)',
              data:   data.length ? data : [0],
              borderColor:     '#2563EB',
              backgroundColor: 'rgba(37,99,235,0.08)',
              borderWidth: 2.5,
              fill: true,
              tension: 0.42,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: '#2563EB',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => ' ₹' + ctx.parsed.y.toLocaleString('en-IN'),
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { size: 11 }, color: '#9CA3AF' },
                border: { display: false },
              },
              y: {
                grid: { color: '#F3F4F6', drawBorder: false },
                ticks: {
                  font: { size: 11 }, color: '#9CA3AF',
                  callback: v => '₹' + Number(v).toLocaleString('en-IN'),
                },
                border: { display: false },
              }
            }
          }
        });
      }

      // ── Enrollment Doughnut ───────────────────────────────────────────────
      const enrollCtx = document.getElementById('enrollmentChart');
      if (enrollCtx) {
        const counts = { Active: 0, Inactive: 0, Expired: 0 };
        enrollments.forEach(e => {
          const s = e.status || e.Status || '';
          if (Object.prototype.hasOwnProperty.call(counts, s)) counts[s]++;
          else counts['Inactive']++;
        });

        const total = counts.Active + counts.Inactive + counts.Expired;

        if (enrollmentChartInstance) enrollmentChartInstance.destroy();
        enrollmentChartInstance = new Chart(enrollCtx, {
          type: 'doughnut',
          data: {
            labels: ['Active', 'Inactive', 'Expired'],
            datasets: [{
              data: total > 0
                ? [counts.Active, counts.Inactive, counts.Expired]
                : [1, 0, 0],
              backgroundColor: total > 0
                ? ['#22C55E', '#EF4444', '#F97316']
                : ['#E5E7EB', '#E5E7EB', '#E5E7EB'],
              borderWidth: 0,
              hoverOffset: 8,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: { size: 11 }, boxWidth: 10, padding: 16, color: '#6B7280' }
              },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    if (total === 0) return ' No data';
                    return ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }

    // ── Recent Payments panel (dashboard) ─────────────────────────────────
    function updateRecentPayments() {
      const panel = document.getElementById('recentPaymentsList');
      if (!panel) return;

      const recent = payments.slice().reverse().slice(0, 6);

      if (recent.length === 0) {
        panel.innerHTML = '<div class="empty" style="padding:32px 16px">No payments yet — go to Payments to record one.</div>';
        return;
      }

      const colors = ['#2563EB','#22C55E','#F97316','#8B5CF6','#EF4444','#0EA5E9'];
      panel.innerHTML = recent.map((p, i) => {
        const name  = escapeHtml(p.memberName || `Member #${p.member_id}`);
        const initials = name.replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase() || 'M';
        const amount  = parseFloat(p.amount || 0).toLocaleString('en-IN', { style:'currency', currency:'INR', minimumFractionDigits:2 });
        const ps = p.status || p.Status || '';
        const badgeClass = ps === 'Completed' ? 'badge-completed' : ps === 'Pending' ? 'badge-pending' : 'badge-inactive';
        const color = colors[i % colors.length];
        return `
          <div class="recent-item">
            <div class="avatar" style="background:${color}">${initials}</div>
            <div class="recent-info">
              <div class="recent-name">${name}</div>
              <div class="recent-sub">${escapeHtml(p.payment_mode || '—')} &nbsp;·&nbsp; <span class="badge ${badgeClass}">${escapeHtml(ps || '—')}</span></div>
            </div>
            <div class="recent-amount">${amount}</div>
          </div>`;
      }).join('');
    }
  