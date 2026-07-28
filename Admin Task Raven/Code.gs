/**
 * لوحة إدارة الطاقم — Google Apps Script backend
 * Discord-only authentication + task notifications
 */

const PROPS = PropertiesService.getScriptProperties();
const CACHE = CacheService.getScriptCache();
const SESSION_TTL = 21600; // 6 hours

/* ================= Discord Configuration ================= */
function getDiscordConfig_() {
  return {
    clientId: PROPS.getProperty('DISCORD_CLIENT_ID'),
    clientSecret: PROPS.getProperty('DISCORD_CLIENT_SECRET'),
    botToken: PROPS.getProperty('DISCORD_BOT_TOKEN'),
    adminDiscordId: PROPS.getProperty('DISCORD_ADMIN_ID')
  };
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('لوحة إدارة الطاقم')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ================= Discord OAuth ================= */
function getDiscordAuthUrl() {
  const config = getDiscordConfig_();
  if (!config.clientId) throw new Error('DISCORD_CLIENT_ID غير مضبوط');
  const redirectUri = ScriptApp.getService().getUrl();
  const state = Utilities.getUuid();
  CACHE.put('oauth_state_' + state, '1', 300);
  return {
    url: 'https://discord.com/api/v10/oauth2/authorize' +
      '?client_id=' + config.clientId +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code' +
      '&scope=identify' +
      '&state=' + state,
    state: state
  };
}

function discordLogin(code, state) {
  const config = getDiscordConfig_();
  if (!config.clientId || !config.clientSecret) {
    return { ok: false, error: 'Discord OAuth غير مضبوط لدى المدير' };
  }
  if (!CACHE.get('oauth_state_' + state)) {
    return { ok: false, error: 'انتهت صلاحية الطلب. حاول مرة أخرى.' };
  }
  CACHE.remove('oauth_state_' + state);

  const redirectUri = ScriptApp.getService().getUrl();
  const payload = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  };
  const body = Object.keys(payload)
    .map(k => k + '=' + encodeURIComponent(payload[k]))
    .join('&');

  var tokenResp = UrlFetchApp.fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'post',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    payload: body,
    muteHttpExceptions: true
  });
  var tokenData = JSON.parse(tokenResp.getContentText());
  if (!tokenData.access_token) {
    return { ok: false, error: 'فشل الحصول على رمز Discord' };
  }

  var userResp = UrlFetchApp.fetch('https://discord.com/api/v10/users/@me', {
    headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
    muteHttpExceptions: true
  });
  var discordUser = JSON.parse(userResp.getContentText());
  var discordId = discordUser.id;

  ensureInit_();
  var users = getUsers_();
  var matchedUser = users.find(function(u) { return u.discordId === discordId; });

  if (!matchedUser) {
    if (discordId === config.adminDiscordId) {
      var adminUser = users.find(function(u) { return u.type === 'admin'; });
      if (!adminUser) {
        adminUser = {
          id: 'u_admin',
          discordId: discordId,
          type: 'admin',
          displayName: discordUser.global_name || discordUser.username,
          scopeRoles: [],
          scopeMembers: []
        };
        users.push(adminUser);
      } else {
        adminUser.discordId = discordId;
        adminUser.displayName = discordUser.global_name || discordUser.username;
      }
      setUsers_(users);
      matchedUser = adminUser;
    } else {
      return { ok: false, error: 'حساب Discord غير مرتبط بلوحة التحكم. يرجى التواصل مع المدير.' };
    }
  }

  var token = Utilities.getUuid();
  CACHE.put('sess_' + token, matchedUser.id, SESSION_TTL);
  return { ok: true, token: token, user: sanitizeUser_(matchedUser) };
}

function getMyDiscordId(token) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('صلاحيات غير كافية');
  return PROPS.getProperty('DISCORD_ADMIN_ID') || '(غير مضبوط)';
}

/* ================= Initialization ================= */
function defaultRoles_() {
  return [
    { id: 'r_jradmin', name: 'JR ADMIN' },
    { id: 'r_trial', name: 'TRIAL STAFF' },
    { id: 'r_ticketer', name: 'TICKETER' },
    { id: 'r_manager', name: 'MANAGER' }
  ];
}
function defaultMembers_() {
  return [
    { id: 'm_1', name: 'DENJI', username: 'ahmed7_77', roleId: 'r_jradmin', discordId: '' },
    { id: 'm_2', name: '9n6h', username: '9n6h', roleId: 'r_jradmin', discordId: '' },
    { id: 'm_3', name: 'YZN', username: 'j_thyon', roleId: 'r_jradmin', discordId: '' },
    { id: 'm_4', name: 'DERVEX', username: 'dervex_1', roleId: 'r_trial', discordId: '' },
    { id: 'm_5', name: 'X~X', username: 'd_f5', roleId: 'r_ticketer', discordId: '' },
    { id: 'm_6', name: 'Dooma', username: 'dooma20095', roleId: 'r_ticketer', discordId: '' },
    { id: 'm_7', name: 'Hu', username: 'hussin08401', roleId: 'r_ticketer', discordId: '' },
    { id: 'm_8', name: 'FLUXE', username: 'youssefyehia._69728', roleId: 'r_ticketer', discordId: '' },
    { id: 'm_9', name: 'Yousef_MXR', username: 'yousef_mxr', roleId: 'r_ticketer', discordId: '' },
    { id: 'm_10', name: 'Z3bolty', username: 'llmidoll', roleId: 'r_manager', discordId: '' }
  ];
}

function ensureInit_() {
  if (PROPS.getProperty('initialized') === '1') return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (PROPS.getProperty('initialized') !== '1') {
      PROPS.setProperty('roles', JSON.stringify(defaultRoles_()));
      PROPS.setProperty('members', JSON.stringify(defaultMembers_()));
      PROPS.setProperty('users', JSON.stringify([]));
      PROPS.setProperty('tasks', JSON.stringify([]));
      PROPS.setProperty('initialized', '1');
    }
  } finally {
    lock.releaseLock();
  }
}

function getRoles_() { ensureInit_(); return JSON.parse(PROPS.getProperty('roles') || '[]'); }
function getMembers_() { ensureInit_(); return JSON.parse(PROPS.getProperty('members') || '[]'); }
function getUsers_() { ensureInit_(); return JSON.parse(PROPS.getProperty('users') || '[]'); }
function getTasks_() { ensureInit_(); return JSON.parse(PROPS.getProperty('tasks') || '[]'); }

function setRoles_(v) { PROPS.setProperty('roles', JSON.stringify(v)); }
function setMembers_(v) { PROPS.setProperty('members', JSON.stringify(v)); }
function setUsers_(v) { PROPS.setProperty('users', JSON.stringify(v)); }
function setTasks_(v) { PROPS.setProperty('tasks', JSON.stringify(v)); }

function uid_(prefix) {
  return prefix + '_' + Utilities.getUuid().slice(0, 8);
}

function sanitizeUser_(u) {
  return {
    id: u.id, discordId: u.discordId, type: u.type,
    displayName: u.displayName, scopeRoles: u.scopeRoles, scopeMembers: u.scopeMembers
  };
}

/* ================= Sessions ================= */
function requireUser_(token) {
  if (!token) throw new Error('SESSION_EXPIRED');
  var userId = CACHE.get('sess_' + token);
  if (!userId) throw new Error('SESSION_EXPIRED');
  var users = getUsers_();
  var user = users.find(function(u) { return u.id === userId; });
  if (!user) throw new Error('SESSION_EXPIRED');
  return user;
}

function logout(token) {
  if (token) CACHE.remove('sess_' + token);
  return { ok: true };
}

function canManageMember_(user, memberId) {
  if (user.type === 'admin') return true;
  var members = getMembers_();
  var m = members.find(function(x) { return x.id === memberId; });
  if (!m) return false;
  return user.scopeRoles.indexOf(m.roleId) !== -1 || user.scopeMembers.indexOf(m.id) !== -1;
}

function getBootstrap(token) {
  var user = requireUser_(token);
  var result = {
    user: sanitizeUser_(user),
    roles: getRoles_(),
    members: getMembers_(),
    tasks: getTasks_()
  };
  if (user.type === 'admin') {
    result.supervisors = getUsers_().filter(function(u) { return u.type === 'supervisor'; }).map(sanitizeUser_);
  }
  return result;
}

/* ================= Discord Notifications ================= */
function sendDiscordNotification_(memberId, title, assignedBy) {
  var config = getDiscordConfig_();
  if (!config.botToken) return;
  var members = getMembers_();
  var member = members.find(function(m) { return m.id === memberId; });
  if (!member || !member.discordId) return;

  try {
    var dmResp = UrlFetchApp.fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'post',
      headers: {
        'Authorization': 'Bot ' + config.botToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ recipient_id: member.discordId }),
      muteHttpExceptions: true
    });
    var dmChannel = JSON.parse(dmResp.getContentText());
    if (!dmChannel.id) return;

    UrlFetchApp.fetch('https://discord.com/api/v10/channels/' + dmChannel.id + '/messages', {
      method: 'post',
      headers: {
        'Authorization': 'Bot ' + config.botToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        content: '**\u{1F4CB} تسك جديد**\nتم إضافة تسك إليك بواسطة `' + assignedBy + '`:\n> ' + title
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('Discord notify fail: ' + e.message);
  }
}

/* ================= Roles & Members Management (ADMIN ONLY) ================= */
function addRole(token, name) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('صلاحيات غير كافية');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var roles = getRoles_();
    var newRole = { id: uid_('r'), name: name };
    roles.push(newRole);
    setRoles_(roles);
    return newRole;
  } finally {
    lock.releaseLock();
  }
}

function addMember(token, name, username, roleId, discordId) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('صلاحيات غير كافية');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var members = getMembers_();
    var newMember = { id: uid_('m'), name: name, username: username, roleId: roleId, discordId: discordId || '' };
    members.push(newMember);
    setMembers_(members);
    return newMember;
  } finally {
    lock.releaseLock();
  }
}

function updateMember(token, payload) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('صلاحيات غير كافية');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var members = getMembers_();
    var m = members.find(function(x) { return x.id === payload.id; });
    if (!m) throw new Error('العضو غير موجود');

    m.name = payload.name;
    m.username = payload.username;
    m.roleId = payload.roleId;
    if (payload.discordId !== undefined) m.discordId = payload.discordId;

    setMembers_(members);
    return m;
  } finally {
    lock.releaseLock();
  }
}

function deleteMember(token, memberId) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('صلاحيات غير كافية');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var members = getMembers_();
    members = members.filter(function(x) { return x.id !== memberId; });
    setMembers_(members);

    var tasks = getTasks_();
    tasks = tasks.filter(function(t) { return t.memberId !== memberId; });
    setTasks_(tasks);

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Tasks ================= */
function addTask(token, memberId, title) {
  var user = requireUser_(token);
  title = (title || '').trim();
  if (!title) throw new Error('العنوان فارغ');
  if (!canManageMember_(user, memberId)) throw new Error('لا تملك صلاحية على هذا العضو');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tasks = getTasks_();
    var task = { id: uid_('t'), memberId: memberId, title: title, done: false, createdBy: user.displayName || user.discordId };
    tasks.push(task);
    setTasks_(tasks);
    sendDiscordNotification_(memberId, title, user.displayName || user.discordId);
    return task;
  } finally {
    lock.releaseLock();
  }
}

function toggleTask(token, taskId) {
  var user = requireUser_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tasks = getTasks_();
    var t = tasks.find(function(x) { return x.id === taskId; });
    if (!t) throw new Error('التسك غير موجود');
    if (!canManageMember_(user, t.memberId)) throw new Error('لا تملك صلاحية على هذا العضو');
    t.done = !t.done;
    setTasks_(tasks);
    return t;
  } finally {
    lock.releaseLock();
  }
}

function deleteTask(token, taskId) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('حذف المهام مسموح للمدير العام فقط');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tasks = getTasks_();
    setTasks_(tasks.filter(function(x) { return x.id !== taskId; }));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Supervisors ================= */
function createSupervisor(token, payload) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('هذا الإجراء للمدير العام فقط');

  var discordId = (payload.discordId || '').trim();
  var displayName = (payload.displayName || '').trim();
  if (!discordId || !displayName) throw new Error('اكمل كل الحقول (Discord ID واسم المشرف)');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = getUsers_();
    if (users.some(function(u) { return u.discordId === discordId; })) throw new Error('Discord ID مستخدم بالفعل');
    var newUser = {
      id: uid_('u'), discordId: discordId, type: 'supervisor',
      displayName: displayName,
      scopeRoles: Array.isArray(payload.scopeRoles) ? payload.scopeRoles : [],
      scopeMembers: Array.isArray(payload.scopeMembers) ? payload.scopeMembers : []
    };
    users.push(newUser);
    setUsers_(users);
    return sanitizeUser_(newUser);
  } finally {
    lock.releaseLock();
  }
}

function updateSupervisor(token, payload) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('هذا الإجراء للمدير العام فقط');

  var id = payload.id;
  var displayName = (payload.displayName || '').trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = getUsers_();
    var target = users.find(function(u) { return u.id === id && u.type === 'supervisor'; });
    if (!target) throw new Error('حساب المشرف غير موجود');

    target.displayName = displayName;
    target.scopeRoles = Array.isArray(payload.scopeRoles) ? payload.scopeRoles : [];
    target.scopeMembers = Array.isArray(payload.scopeMembers) ? payload.scopeMembers : [];

    if (payload.discordId && payload.discordId.trim()) {
      target.discordId = payload.discordId.trim();
    }

    setUsers_(users);
    return sanitizeUser_(target);
  } finally {
    lock.releaseLock();
  }
}

function deleteSupervisor(token, supervisorId) {
  var user = requireUser_(token);
  if (user.type !== 'admin') throw new Error('هذا الإجراء للمدير العام فقط');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = getUsers_();
    setUsers_(users.filter(function(u) { return u.id !== supervisorId; }));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
