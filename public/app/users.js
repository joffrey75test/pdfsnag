import { createInvite, listMembers, loadSession, me, saveSession } from "/app/lib/users-api.js";

const ui = {
  jwtToken: document.getElementById("jwtToken"),
  companyId: document.getElementById("companyId"),
  connectBtn: document.getElementById("connectBtn"),
  refreshMembersBtn: document.getElementById("refreshMembersBtn"),
  membersList: document.getElementById("membersList"),
  inviteForm: document.getElementById("inviteForm"),
  inviteEmail: document.getElementById("inviteEmail"),
  inviteRole: document.getElementById("inviteRole"),
  inviteExpiresDays: document.getElementById("inviteExpiresDays"),
  inviteResult: document.getElementById("inviteResult"),
  status: document.getElementById("status"),
};

let session = loadSession();

function setStatus(text) {
  ui.status.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function syncFormFromSession() {
  ui.jwtToken.value = session.jwtToken;
  ui.companyId.value = session.companyId;
}

function renderMembers(members) {
  if (!Array.isArray(members) || members.length === 0) {
    ui.membersList.innerHTML = '<div class="item"><small>Aucun membre</small></div>';
    return;
  }

  ui.membersList.innerHTML = members
    .map(
      (m) => `
      <div class="item">
        <strong>${escapeHtml(m.full_name || m.email || m.user_id)}</strong><br/>
        <small>User: ${escapeHtml(m.user_id)} | Role: ${escapeHtml(m.role)} | Status: ${escapeHtml(m.status)}</small>
      </div>
    `
    )
    .join("");
}

async function refreshMembers() {
  if (!session.companyId) throw new Error("companyId manquant");
  const payload = await listMembers(session, session.companyId);
  renderMembers(payload.members || []);
}

ui.connectBtn.addEventListener("click", async () => {
  session = {
    jwtToken: ui.jwtToken.value.trim(),
    companyId: ui.companyId.value.trim(),
  };
  saveSession(session);

  try {
    const mePayload = await me(session);

    if (!session.companyId && Array.isArray(mePayload.company_memberships) && mePayload.company_memberships[0]?.company_id) {
      session.companyId = mePayload.company_memberships[0].company_id;
      ui.companyId.value = session.companyId;
      saveSession(session);
    }

    await refreshMembers();
    setStatus("Connecté.");
  } catch (error) {
    setStatus(`Erreur connexion: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.refreshMembersBtn.addEventListener("click", async () => {
  try {
    await refreshMembers();
    setStatus("Membres rafraichis.");
  } catch (error) {
    setStatus(`Erreur membres: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

ui.inviteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = await createInvite(session, {
      companyId: ui.companyId.value.trim(),
      email: ui.inviteEmail.value.trim(),
      role: ui.inviteRole.value,
      expiresDays: Number(ui.inviteExpiresDays.value || 7),
    });

    ui.inviteResult.textContent = JSON.stringify(payload, null, 2);
    setStatus("Invitation créée.");
  } catch (error) {
    setStatus(`Erreur invitation: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

syncFormFromSession();
if (session.jwtToken) {
  me(session)
    .then((mePayload) => {
      if (!session.companyId && Array.isArray(mePayload.company_memberships) && mePayload.company_memberships[0]?.company_id) {
        session.companyId = mePayload.company_memberships[0].company_id;
        saveSession(session);
        ui.companyId.value = session.companyId;
      }
      return refreshMembers();
    })
    .then(() => setStatus("Session restaurée."))
    .catch(() => setStatus("Renseigne JWT + Company puis Connecter."));
}
