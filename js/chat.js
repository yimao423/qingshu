/* === 聊天功能 === */

var _chatCurrentPartnerId = null;
var _chatProactiveTimer = null;
var _proactiveChatId = '';
var _proactiveNextTime = 0;

function openChatRoom(chatId) {
  // chatId 格式: partner_xxx
  if (!chatId || !chatId.startsWith('partner_')) return;
  var partnerId = chatId.replace('partner_', '');
  _chatCurrentPartnerId = partnerId;
  window._chatCurrentPartnerId = partnerId; // 供气泡商城指派读取（BubbleMaker）
  
  // 获取角色信息
  var partners = Storage.getPartnerProfiles();
  var partner = null;
  for (var i = 0; i < partners.length; i++) {
    if (partners[i].id === partnerId) { partner = partners[i]; break; }
  }
  if (!partner) return;
  
  // 确保聊天记录存在
  ensureChatExists(chatId, partner);
  
  // 设置标题
  var titleEl = document.getElementById('chat-room-title');
  if (titleEl) titleEl.textContent = partner.nickname;
  
  // 设置顶栏在线状态与情绪状态（内置随机展示，允许在角色编辑中自定义）
  setChatRoomStatus(partner);
  
  // 存储当前聊天 ID
  document.getElementById('page-chat-room').dataset.chatId = chatId;
  
  // 切换会话时重置语音模式（恢复文本输入栏）
  if (_voiceMode) toggleVoiceMode();
  // 切换会话时停止正在播放的语音
  stopVoicePlayback();
  
  // 渲染消息
  renderChatMessages(chatId);
  
  // 关闭面板
  closeStickerPanel();
  closePlusMenu();
  closeChatMenu();
  closeChatSearch();
  
  // 清空输入框
  var input = document.getElementById('chat-input');
  if (input) { input.value = ''; }
  onChatInputChange();
  
  // 切换聊天时清理引用与操作菜单
  cancelQuoteReply();
  closeMsgActionMenu();
  
  // 绑定返回按钮：仅返回上一页；主动发送为全站生效，不随离开聊天室停止（保证到点必发）
  var backBtn = document.querySelector('.chat-room-back');
  if (backBtn) {
    backBtn.onclick = function() {
      Navigation.goBack();
    };
  }

  // 绑定三点菜单按钮
  var actionBtn = document.querySelector('.chat-room-action');
  if (actionBtn) {
    actionBtn.onclick = function(e) {
      e.stopPropagation();
      toggleChatMenu();
    };
  }

  // 应用聊天背景（自定义图片：localStorage 存标记时从 IndexedDB 恢复，保证永久保存）
  var chatBgVal = Storage.getChatBgCustom(chatId);
  if (chatBgVal === '__idb__') {
    if (window.ChatBgDB) {
      ChatBgDB.get(chatId).then(function(img) {
        if (img && img.indexOf('data:') === 0) {
          applyChatBackground(img);
        } else {
          applyChatBackground('default');
          Storage.setChatBgCustom(chatId, 'default');
        }
      }).catch(function() {
        applyChatBackground('default');
        Storage.setChatBgCustom(chatId, 'default');
      });
    } else {
      applyChatBackground('default');
      Storage.setChatBgCustom(chatId, 'default');
    }
  } else {
    applyChatBackground(chatBgVal);
    // 若 localStorage 中背景仍是默认值，尝试从 IndexedDB 兜底恢复图片背景
    if (window.ChatBgDB && (chatBgVal === 'default' || !chatBgVal)) {
      ChatBgDB.get(chatId).then(function(img) {
        if (img && img.indexOf('data:') === 0) applyChatBackground(img);
      }).catch(function() {});
    }
  }
  
  // 启动主动发送（如果开启）
  if (Storage.getProactiveSend()) {
    startProactiveTimer(chatId);
  }
  
  // 启动"允许对方主动拨打"（如果开启）
  startSimulateCallTimer(chatId);
  
  // 导航到聊天室
  Navigation.navigateTo('chat-room');
  // 页面切换完成后滚动到最新消息（页面未显示时 scrollTop 无效，需延迟）
  setTimeout(scrollChatToBottom, 50);
  setTimeout(scrollChatToBottom, 300);
}

function ensureChatExists(chatId, partner) {
  var chats = Storage.getChats();
  var exists = false;
  for (var i = 0; i < chats.length; i++) {
    if (chats[i].id === chatId) { exists = true; break; }
  }
  if (!exists) {
    chats.push({
      id: chatId,
      name: partner.nickname,
      avatar: partner.avatar,
      avatarColor: partner.avatarColor,
      avatarImage: partner.avatarImage || '',
      avatarShape: partner.avatarShape || 'circle',
      lastMsg: '',
      lastTime: 0,
      unread: 0
    });
    Storage.setChats(chats);
  }
}

/* ==== 群聊功能 ==== */
function isGroupChatId(chatId) {
  return !!chatId && String(chatId).indexOf('group_') === 0;
}

function getGroupByChatId(chatId) {
  var groups = Storage.getGroupChats();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === chatId) return groups[i];
  }
  return null;
}

function getGroupMembers(group) {
  var partners = Storage.getPartnerProfiles();
  var ids = (group && group.memberIds) || [];
  return partners.filter(function(p) { return ids.indexOf(p.id) !== -1; });
}

function _buildGroupAvatarHtml(group) {
  var members = getGroupMembers(group);
  // 自定义群头像：优先展示用户上传的群头像（形状跟随圆形/方形设置）
  if (group && group.avatarImage) {
    var shapeRadius = (group.avatarShape === 'square') ? '10px' : '50%';
    return '<div class="group-avatar-stack"><div class="ga-item ga-item-single" style="background:' + (group.avatarColor || '#A090B0') + ';background-image:url(' + group.avatarImage + ');background-size:cover;background-position:center;border-radius:' + shapeRadius + '"></div></div>';
  }
  var html = '<div class="group-avatar-stack">';
  var shown = members.slice(0, 2);
  if (members.length === 1) {
    // 单成员：头像居中撑满容器，与单聊头像视觉一致
    var m0 = members[0];
    var text0 = (m0.avatar || m0.nickname || '?').charAt(0);
    var color0 = m0.avatarColor || '#A090B0';
    if (m0.avatarImage) {
      html += '<div class="ga-item ga-item-single" style="background:' + color0 + ';background-image:url(' + m0.avatarImage + ');background-size:cover;background-position:center"></div>';
    } else {
      html += '<div class="ga-item ga-item-single" style="background:' + color0 + '">' + Core.escapeHtml(text0) + '</div>';
    }
  } else {
    shown.forEach(function(m) {
      var text = (m.avatar || m.nickname || '?').charAt(0);
      var color = m.avatarColor || '#A090B0';
      if (m.avatarImage) {
        html += '<div class="ga-item" style="background:' + color + ';background-image:url(' + m.avatarImage + ');background-size:cover;background-position:center"></div>';
      } else {
        html += '<div class="ga-item" style="background:' + color + '">' + Core.escapeHtml(text) + '</div>';
      }
    });
    if (members.length > 2) {
      html += '<div class="ga-more">+' + (members.length - 2) + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function _buildGroupAvatarItemHtml(m) {
  var text = (m.avatar || m.nickname || '?').charAt(0);
  var color = m.avatarColor || '#A090B0';
  if (m.avatarImage) {
    return '<div class="gc-avatar" style="background:' + color + ';background-image:url(' + m.avatarImage + ');background-size:cover;background-position:center"></div>';
  }
  return '<div class="gc-avatar" style="background:' + color + '">' + Core.escapeHtml(text) + '</div>';
}

function _buildGroupName(members) {
  var names = members.map(function(m) { return m.nickname || '角色'; });
  var name = names.join('、');
  if (name.length > 12) name = name.slice(0, 11) + '…';
  return name;
}

function ensureGroupChatExists(group) {
  var chats = Storage.getChats();
  var exists = false;
  for (var i = 0; i < chats.length; i++) {
    if (chats[i].id === group.id) { exists = true; break; }
  }
  if (!exists) {
    chats.push({
      id: group.id,
      name: group.name,
      isGroup: true,
      memberIds: (group.memberIds || []).slice(),
      lastMsg: '',
      lastTime: 0,
      unread: 0
    });
    Storage.setChats(chats);
  }
}

function openGroupRoom(groupId) {
  if (!groupId || !isGroupChatId(groupId)) return;
  var group = getGroupByChatId(groupId);
  if (!group) return;
  
  // 确保聊天记录存在
  ensureGroupChatExists(group);
  
  // 设置标题
  var titleEl = document.getElementById('chat-room-title');
  if (titleEl) titleEl.textContent = group.name || '群聊';
  
  // 设置顶栏状态：群聊成员
  var statusEl = document.getElementById('chat-room-status');
  var members = getGroupMembers(group);
  if (statusEl) {
    statusEl.innerHTML = '<span class="chat-room-status-dot" style="background:#58C878"></span>'
      + '<span>群聊(' + members.length + '人)</span>';
  }
  
  // 存储当前聊天 ID
  document.getElementById('page-chat-room').dataset.chatId = groupId;
  
  // 切换会话时重置语音模式（恢复文本输入栏）
  if (_voiceMode) toggleVoiceMode();
  // 切换会话时停止正在播放的语音
  stopVoicePlayback();
  
  // 渲染消息
  renderChatMessages(groupId);
  
  // 关闭面板
  closeStickerPanel();
  closePlusMenu();
  closeChatMenu();
  closeChatSearch();
  
  // 清空输入框
  var input = document.getElementById('chat-input');
  if (input) { input.value = ''; }
  onChatInputChange();
  
  // 切换聊天时清理引用与操作菜单
  cancelQuoteReply();
  closeMsgActionMenu();
  
  // 绑定返回按钮
  var backBtn = document.querySelector('.chat-room-back');
  if (backBtn) {
    backBtn.onclick = function() {
      Navigation.goBack();
    };
  }
  
  // 绑定三点菜单按钮
  var actionBtn = document.querySelector('.chat-room-action');
  if (actionBtn) {
    actionBtn.onclick = function(e) {
      e.stopPropagation();
      toggleChatMenu();
    };
  }
  
  // 应用聊天背景
  var chatBgVal = Storage.getChatBgCustom(groupId);
  applyChatBackground(chatBgVal === '__idb__' ? 'default' : chatBgVal);
  
  // 启动主动发送（如果开启）
  if (Storage.getProactiveSend()) {
    startProactiveTimer(groupId);
  }
  
  // 群聊不模拟来电（来电只适用于单聊角色）
  stopSimulateCallTimer();
  
  // 导航到聊天室
  Navigation.navigateTo('chat-room');
  // 页面切换完成后滚动到最新消息（页面未显示时 scrollTop 无效，需延迟）
  setTimeout(scrollChatToBottom, 50);
  setTimeout(scrollChatToBottom, 300);
}

/* ==== 聊天列表顶栏：加号菜单 ==== */
function toggleChatListPlusMenu() {
  closeGlobalSearch();
  var menu = document.getElementById('chat-list-plus-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function hideChatListPlusMenu() {
  var menu = document.getElementById('chat-list-plus-menu');
  if (menu) menu.style.display = 'none';
}
function goAddPartner() {
  Navigation.navigateTo('account-settings');
}

/* ==== 聊天列表顶栏：全局搜索 ==== */
var _globalSearchOpen = false;
function toggleGlobalSearch() {
  hideChatListPlusMenu();
  var panel = document.getElementById('global-search-panel');
  if (!panel) return;
  _globalSearchOpen = !_globalSearchOpen;
  panel.style.display = _globalSearchOpen ? 'block' : 'none';
  if (_globalSearchOpen) {
    var input = document.getElementById('global-search-input');
    if (input) { input.value = ''; input.focus(); }
    var results = document.getElementById('global-search-results');
    if (results) results.innerHTML = '<div class="global-search-empty">输入关键词，搜索所有聊天记录</div>';
  }
}
function closeGlobalSearch() {
  _globalSearchOpen = false;
  var panel = document.getElementById('global-search-panel');
  if (panel) panel.style.display = 'none';
  var input = document.getElementById('global-search-input');
  if (input) input.value = '';
  var results = document.getElementById('global-search-results');
  if (results) results.innerHTML = '';
}

function _msgSearchText(msg) {
  if (!msg) return '';
  if (msg.isCall) return msg.text || '';
  if (msg.isRecall) return msg.text || '';
  if (msg.msgType === 'sticker') return '[表情]';
  if (msg.msgType === 'image') return '[图片]';
  if (msg.msgType === 'redpacket') return '[红包] ' + (msg.greeting || '');
  if (msg.msgType === 'voice') return '[语音] ' + (msg.voiceText || '');
  return msg.text || '';
}

function doGlobalSearch() {
  var input = document.getElementById('global-search-input');
  var resultsEl = document.getElementById('global-search-results');
  if (!input || !resultsEl) return;
  var query = input.value.trim().toLowerCase();
  resultsEl.innerHTML = '';
  if (!query) {
    resultsEl.innerHTML = '<div class="global-search-empty">输入关键词，搜索所有聊天记录</div>';
    return;
  }
  
  var partners = Storage.getPartnerProfiles();
  var groupChats = Storage.getGroupChats();
  var total = 0;
  var html = '';
  
  function addChatGroup(chatId, displayName, isGroup) {
    var messages = Storage.getMessages(chatId);
    var hits = [];
    messages.forEach(function(msg) {
      var text = _msgSearchText(msg).toLowerCase();
      if (text.indexOf(query) !== -1) {
        hits.push(msg);
      }
    });
    if (!hits.length) return;
    total += hits.length;
    html += '<div class="gs-group">'
      + '<div class="gs-group-title"><i class="fas ' + (isGroup ? 'fa-users' : 'fa-comment-dots') + '"></i>' + Core.escapeHtml(displayName) + '<span class="gs-count">' + hits.length + '条</span></div>';
    hits.slice(-3).reverse().forEach(function(msg) {
      var isSelf = msg.type === 'self';
      var who = '我';
      if (!isSelf) {
        if (isGroup && msg.fromId) {
          var pp = null;
          for (var i = 0; i < partners.length; i++) { if (partners[i].id === msg.fromId) { pp = partners[i]; break; } }
          who = pp ? (pp.nickname || '角色') : '成员';
        } else {
          who = displayName;
        }
      }
      var textPreview = _msgSearchText(msg);
      var safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var hl = textPreview.replace(new RegExp('(' + safeQuery + ')', 'gi'), '<mark>$1</mark>');
      html += '<div class="gs-item" onclick="globalSearchOpenChat(\'' + chatId + '\',' + msg.id + ')">'
        + '<div class="gs-item-top"><span class="gs-from">' + Core.escapeHtml(who) + '</span><span>' + Core.formatTime(msg.time) + '</span></div>'
        + '<div class="gs-item-text">' + hl + '</div>'
        + '</div>';
    });
    html += '</div>';
  }
  
  // 单聊
  partners.forEach(function(p) {
    addChatGroup('partner_' + p.id, p.nickname, false);
  });
  // 群聊
  groupChats.forEach(function(g) {
    addChatGroup(g.id, g.name || '群聊', true);
  });
  
  if (!total) {
    resultsEl.innerHTML = '<div class="global-search-empty">未找到与「' + Core.escapeHtml(query) + '」相关的聊天记录</div>';
    return;
  }
  resultsEl.innerHTML = html;
}

function globalSearchOpenChat(chatId, msgId) {
  closeGlobalSearch();
  if (isGroupChatId(chatId)) {
    openGroupRoom(chatId);
  } else {
    openChatRoom(chatId);
  }
  // 定位到目标消息
  scrollToMessage(msgId);
}

/* 定位消息（渲染后滚动到指定消息并高亮） */
var _pendingScrollMsgId = null;
function scrollToMessage(msgId) {
  _pendingScrollMsgId = String(msgId);
}

/* ==== 创建群聊 ==== */
var _groupSelectedIds = [];
function showCreateGroupPanel() {
  var overlay = document.getElementById('group-create-overlay');
  var listEl = document.getElementById('group-create-list');
  if (!overlay || !listEl) return;
  _groupCreateAvatarImage = '';
  _groupCreateAvatarColor = '#B8DCF0';
  _groupCreateAvatarShape = 'circle';
  var nameInput = document.getElementById('group-create-name-input');
  if (nameInput) nameInput.value = '';
  var avEl = document.getElementById('group-create-avatar-preview');
  if (avEl) {
    avEl.style.backgroundImage = '';
    avEl.style.backgroundColor = _groupCreateAvatarColor;
    avEl.style.borderRadius = '50%';
    avEl.textContent = '群';
  }
  var shapeOpts = document.getElementById('group-create-shape-options');
  if (shapeOpts) {
    var items = shapeOpts.querySelectorAll('.group-shape-opt');
    for (var si = 0; si < items.length; si++) {
      items[si].classList.toggle('active', items[si].getAttribute('data-shape') === _groupCreateAvatarShape);
    }
  }
  var partners = Storage.getPartnerProfiles();
  _groupSelectedIds = [];
  if (partners.length < 2) {
    listEl.innerHTML = '<div class="group-create-empty">至少需要 2 个角色才能发起群聊，<br>请先通过「添加角色」创建更多角色</div>';
  } else {
    var html = '';
    partners.forEach(function(p) {
      html += '<div class="group-check-item" data-id="' + p.id + '" onclick="toggleGroupSelect(this)">'
        + _buildGroupAvatarItemHtml(p)
        + '<div class="gc-name">' + Core.escapeHtml(p.nickname || '角色') + '</div>'
        + '<div class="gc-check"><i class="fas fa-check"></i></div>'
        + '</div>';
    });
    listEl.innerHTML = html;
  }
  overlay.style.display = 'flex';
}

function toggleGroupSelect(el) {
  if (!el) return;
  var id = el.getAttribute('data-id');
  if (!id) return;
  var idx = _groupSelectedIds.indexOf(id);
  if (idx !== -1) {
    _groupSelectedIds.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    _groupSelectedIds.push(id);
    el.classList.add('selected');
  }
}

function hideCreateGroupPanel() {
  var overlay = document.getElementById('group-create-overlay');
  if (overlay) overlay.style.display = 'none';
  _groupSelectedIds = [];
}

/* 创建群聊：头像形状选择 */
function setGroupCreateShape(shape) {
  _groupCreateAvatarShape = (shape === 'square') ? 'square' : 'circle';
  var shapeOpts = document.getElementById('group-create-shape-options');
  if (shapeOpts) {
    var items = shapeOpts.querySelectorAll('.group-shape-opt');
    for (var si = 0; si < items.length; si++) {
      items[si].classList.toggle('active', items[si].getAttribute('data-shape') === _groupCreateAvatarShape);
    }
  }
  var avEl = document.getElementById('group-create-avatar-preview');
  if (avEl) avEl.style.borderRadius = (_groupCreateAvatarShape === 'square') ? '10px' : '50%';
}

function confirmCreateGroup() {
  if (_groupSelectedIds.length < 2) {
    Core.toast('请至少选择 2 个角色');
    return;
  }
  var partners = Storage.getPartnerProfiles();
  var members = partners.filter(function(p) { return _groupSelectedIds.indexOf(p.id) !== -1; });
  var groupId = 'group_' + Date.now();
  var memberIds = members.map(function(m) { return m.id; });
  var nameInput = document.getElementById('group-create-name-input');
  var customName = nameInput ? nameInput.value.trim() : '';
  var groupName = customName || _buildGroupName(members);
  var group = { id: groupId, name: groupName, memberIds: memberIds, createdAt: Date.now(), avatarImage: _groupCreateAvatarImage || '', avatarColor: _groupCreateAvatarColor || '#B8DCF0', avatarShape: _groupCreateAvatarShape || 'circle' };
  var groups = Storage.getGroupChats();
  groups.push(group);
  Storage.setGroupChats(groups);
  
  // 写入 chats 便于列表展示与更新
  var chats = Storage.getChats();
  chats.push({ id: groupId, name: groupName, isGroup: true, memberIds: memberIds.slice(), avatarImage: _groupCreateAvatarImage || '', avatarColor: _groupCreateAvatarColor || '#B8DCF0', avatarShape: _groupCreateAvatarShape || 'circle', lastMsg: '', lastTime: 0, unread: 0 });
  Storage.setChats(chats);
  
  hideCreateGroupPanel();
  Navigation._renderChatList();
  openGroupRoom(groupId);
  Core.toast('群聊已创建');
}

/* ==== 群聊设置（自定义群名/头像） ==== */
var _groupCreateAvatarImage = '';
var _groupCreateAvatarColor = '#B8DCF0';
var _groupCreateAvatarShape = 'circle';
var _groupEditAvatarImage = '';
var _groupEditAvatarColor = '#B8DCF0';
var _groupEditAvatarShape = 'circle';
var _groupEditingId = '';

function handleGroupCreateAvatar(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    compressImageData(e.target.result, 200, 0.85, true).then(function(compressed) {
      _groupCreateAvatarImage = compressed;
      var avEl = document.getElementById('group-create-avatar-preview');
      if (avEl) {
        avEl.style.backgroundImage = 'url(' + compressed + ')';
        avEl.style.backgroundSize = 'cover';
        avEl.style.backgroundPosition = 'center';
        avEl.textContent = '';
      }
    });
  };
  reader.readAsDataURL(file);
}

function openGroupSettings() {
  closeChatMenu();
  var chatId = _currentChatId();
  if (!isGroupChatId(chatId)) return;
  var group = getGroupByChatId(chatId);
  if (!group) return;
  _groupEditingId = group.id;
  _groupEditAvatarImage = group.avatarImage || '';
  _groupEditAvatarColor = group.avatarColor || '#B8DCF0';
  _groupEditAvatarShape = group.avatarShape || 'circle';
  var html = '<div class="group-setting-overlay" id="group-setting-overlay" onclick="if(event.target===this)closeGroupSettings()">'
    + '<div class="group-setting-panel">'
    + '<div class="group-setting-title"><i class="fas fa-users-gear"></i> 群聊设置</div>'
    + '<div class="group-create-info">'
    + '<div class="group-create-avatar" id="group-edit-avatar-preview" onclick="document.getElementById(\'group-edit-avatar-file\').click()">群</div>'
    + '<input type="file" id="group-edit-avatar-file" accept="image/*" style="display:none" onchange="handleGroupEditAvatar(this)">'
    + '<input type="text" class="group-create-name-input" id="group-edit-name-input" placeholder="输入群聊名称" maxlength="20" value="' + Core.escapeHtml(group.name || '') + '">'
    + '</div>'
    + '<div class="group-create-shape-row">'
    + '<span class="group-create-shape-label">头像形状</span>'
    + '<div class="group-shape-options" id="group-edit-shape-options">'
    + '<div class="group-shape-opt" data-shape="circle" onclick="setGroupEditShape(\'circle\')"><span class="shape-dot circle"></span>圆形</div>'
    + '<div class="group-shape-opt" data-shape="square" onclick="setGroupEditShape(\'square\')"><span class="shape-dot square"></span>方形</div>'
    + '</div>'
    + '</div>'
    + '<div class="group-create-sub" style="text-align:left;margin:0">群成员 ' + ((group.memberIds || []).length) + ' 人</div>'
    + '<div class="group-setting-actions">'
    + '<button class="glass-btn" onclick="closeGroupSettings()">取消</button>'
    + '<button class="glass-btn" onclick="saveGroupSettings()">保存</button>'
    + '<button class="glass-btn" style="color:#ff4757" onclick="deleteGroup()">删除群聊</button>'
    + '</div>'
    + '</div></div>';
  var page = document.getElementById('page-chat-room');
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  page.appendChild(tmp.firstChild);
  _updateGroupEditAvatarPreview();
  // 同步形状选项高亮
  var shapeOpts = document.getElementById('group-edit-shape-options');
  if (shapeOpts) {
    var items = shapeOpts.querySelectorAll('.group-shape-opt');
    for (var si = 0; si < items.length; si++) {
      items[si].classList.toggle('active', items[si].getAttribute('data-shape') === _groupEditAvatarShape);
    }
  }
}

function handleGroupEditAvatar(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    compressImageData(e.target.result, 200, 0.85, true).then(function(compressed) {
      _groupEditAvatarImage = compressed;
      _updateGroupEditAvatarPreview();
    });
  };
  reader.readAsDataURL(file);
}

function _updateGroupEditAvatarPreview() {
  var avEl = document.getElementById('group-edit-avatar-preview');
  if (!avEl) return;
  var shapeRadius = (_groupEditAvatarShape === 'square') ? '10px' : '50%';
  avEl.style.borderRadius = shapeRadius;
  if (_groupEditAvatarImage) {
    avEl.style.backgroundImage = 'url(' + _groupEditAvatarImage + ')';
    avEl.style.backgroundSize = 'cover';
    avEl.style.backgroundPosition = 'center';
    avEl.textContent = '';
  } else {
    avEl.style.backgroundImage = '';
    avEl.style.backgroundColor = _groupEditAvatarColor;
    avEl.textContent = '群';
  }
}

/* 群聊头像形状选择（圆形/方形） */
function setGroupEditShape(shape) {
  _groupEditAvatarShape = (shape === 'square') ? 'square' : 'circle';
  var opts = document.getElementById('group-edit-shape-options');
  if (opts) {
    var items = opts.querySelectorAll('.group-shape-opt');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('active', items[i].getAttribute('data-shape') === _groupEditAvatarShape);
    }
  }
  _updateGroupEditAvatarPreview();
}

function closeGroupSettings() {
  var el = document.getElementById('group-setting-overlay');
  if (el) el.remove();
}

function saveGroupSettings() {
  var nameInput = document.getElementById('group-edit-name-input');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) { Core.toast('请输入群聊名称'); return; }
  var groups = Storage.getGroupChats();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === _groupEditingId) {
      groups[i].name = name;
      if (_groupEditAvatarImage) { groups[i].avatarImage = _groupEditAvatarImage; }
      groups[i].avatarColor = _groupEditAvatarColor || groups[i].avatarColor;
      groups[i].avatarShape = _groupEditAvatarShape || 'circle';
      break;
    }
  }
  Storage.setGroupChats(groups);
  // 同步聊天列表名称
  var chats = Storage.getChats();
  for (var ci = 0; ci < chats.length; ci++) {
    if (chats[ci].id === _groupEditingId) { chats[ci].name = name; break; }
  }
  Storage.setChats(chats);
  closeGroupSettings();
  var titleEl = document.getElementById('chat-room-title');
  if (titleEl) titleEl.textContent = name;
  Navigation._renderChatList();
  renderChatMessages(_groupEditingId);
  Core.toast('群聊信息已更新');
}

/* ==== 删除群聊 ==== */
function deleteGroup() {
  var chatId = _currentChatId();
  if (!isGroupChatId(chatId)) return;
  Core.confirm('删除群聊', '确定删除该群聊及所有聊天记录？此操作不可撤销。', function() {
    // 1. 从 groupChats 中删除
    var groups = Storage.getGroupChats();
    var idx = -1;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === chatId) { idx = i; break; }
    }
    if (idx >= 0) groups.splice(idx, 1);
    Storage.setGroupChats(groups);
    // 2. 从 chats 中删除
    var chats = Storage.getChats();
    var cidx = -1;
    for (var j = 0; j < chats.length; j++) {
      if (chats[j].id === chatId) { cidx = j; break; }
    }
    if (cidx >= 0) chats.splice(cidx, 1);
    Storage.setChats(chats);
    // 3. 清理聊天记录
    Storage.clearChatMessages(chatId);
    // 4. 关闭设置面板、返回聊天列表
    closeGroupSettings();
    Core.toast('群聊已删除');
    Navigation._renderChatList();
    Navigation.navigateTo('chat-list');
  });
}

/* ==== 群公告 ==== */
function openGroupAnnouncement() {
  closeChatMenu();
  var chatId = _currentChatId();
  if (!isGroupChatId(chatId)) return;
  var group = getGroupByChatId(chatId);
  if (!group) return;
  _groupEditingId = group.id;
  var html = '<div class="group-announce-overlay" id="group-announce-overlay" onclick="if(event.target===this)closeGroupAnnouncement()">'
    + '<div class="group-announce-panel">'
    + '<div class="group-announce-title"><i class="fas fa-bullhorn"></i> 群公告</div>'
    + '<div class="group-create-sub" style="margin:0">发布后将在聊天界面居中显示</div>'
    + '<textarea class="group-announce-textarea" id="group-announce-input" placeholder="输入群公告内容…" maxlength="200">' + Core.escapeHtml(group.announcement || '') + '</textarea>'
    + '<div class="group-announce-actions">'
    + '<button class="glass-btn" onclick="closeGroupAnnouncement()">取消</button>'
    + '<button class="glass-btn" onclick="publishGroupAnnouncement()">发布</button>'
    + '</div>'
    + '</div></div>';
  var page = document.getElementById('page-chat-room');
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  page.appendChild(tmp.firstChild);
}

function closeGroupAnnouncement() {
  var el = document.getElementById('group-announce-overlay');
  if (el) el.remove();
}

function publishGroupAnnouncement() {
  var input = document.getElementById('group-announce-input');
  var text = input ? input.value.trim() : '';
  if (!text) { Core.toast('公告内容不能为空'); return; }
  var groups = Storage.getGroupChats();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === _groupEditingId) {
      groups[i].announcement = text;
      groups[i].announcementTime = Date.now();
      break;
    }
  }
  Storage.setGroupChats(groups);
  closeGroupAnnouncement();
  renderChatMessages(_groupEditingId);
  Core.toast('群公告已发布');
}

/* ==== 群聊自动回复 ==== */
function scheduleGroupAutoReply(chatId) {
  var group = getGroupByChatId(chatId);
  if (!group) return;
  var members = getGroupMembers(group);
  if (!members.length) return;
  // 随机 1~3 个成员先后回复，模拟群聊氛围
  var replyCount = Math.min(members.length, 1 + Math.floor(Math.random() * Math.min(3, members.length)));
  var shuffled = members.slice().sort(function() { return Math.random() - 0.5; });
  var chosen = shuffled.slice(0, replyCount);
  var minDelay = Storage.getReplyMinDelay();
  var maxDelay = Storage.getReplyMaxDelay();
  var delay = (minDelay + Math.random() * Math.max(0, maxDelay - minDelay)) * 1000;
  if (delay < 800) delay = 800 + Math.random() * 1500;
  chosen.forEach(function(member, idx) {
    setTimeout(function() {
      if (Storage.getTypingIndicator()) {
        showTypingIndicator(member.nickname || '成员');
        setTimeout(function() { doGroupAutoReply(chatId, member); }, 1400 + Math.random() * 2000);
      } else {
        doGroupAutoReply(chatId, member);
      }
    }, delay + idx * (1500 + Math.random() * 2500));
  });
}

function doGroupAutoReply(chatId, member) {
  hideTypingIndicator();
  if (!member) return;

  // 群聊红包：随机角色领取「我方发出」的未领红包（第一个成员领取后其余成员不再重复领）
  var groupRpClaimed = false;
  var claimCheckMsgs = Storage.getMessages(chatId);
  for (var ci = claimCheckMsgs.length - 1; ci >= 0; ci--) {
    var gRpMsg = claimCheckMsgs[ci];
    if (gRpMsg.msgType === 'redpacket' && gRpMsg.type === 'self' && !gRpMsg.claimed && !gRpMsg.returned) {
      var gAutoSaved = RedPacketStorage.load(chatId, gRpMsg.id) || {};
      gRpMsg.claimed = true;
      gRpMsg.amount = gRpMsg.totalAmount;
      gRpMsg.claimedBy = member.id;
      Storage.setMessages(chatId, claimCheckMsgs);
      gAutoSaved.id = gRpMsg.id;
      gAutoSaved.greeting = gRpMsg.greeting;
      gAutoSaved.rpType = gRpMsg.rpType;
      gAutoSaved.totalAmount = gRpMsg.totalAmount;
      gAutoSaved.count = gRpMsg.count;
      gAutoSaved.claimed = true;
      gAutoSaved.amount = gRpMsg.totalAmount;
      gAutoSaved.otherAmount = gRpMsg.totalAmount;
      gAutoSaved.otherClaimTime = Date.now();
      gAutoSaved.claimedBy = member.id;
      gAutoSaved.time = gRpMsg.time;
      RedPacketStorage.save(chatId, gRpMsg.id, gAutoSaved);
      _safeRenderChat(chatId);
      groupRpClaimed = true;
      break;
    }
  }

  var cards = Storage.getCards();
  var emojis = Storage.getEmojis();
  var kaomojis = Storage.getKaomojis();
  var mainCards = cards.filter(function(c) { return c.category !== '格言'; });
  var replyParts = [];
  if (mainCards.length > 0) {
    replyParts.push(mainCards[Math.floor(Math.random() * mainCards.length)].text);
  }
  if (emojis.length > 0 && Math.random() < 0.3) {
    replyParts.splice(Math.floor(Math.random() * (replyParts.length + 1)), 0, emojis[Math.floor(Math.random() * emojis.length)].char);
  }
  if (kaomojis.length > 0 && Math.random() < 0.2) {
    replyParts.splice(Math.floor(Math.random() * (replyParts.length + 1)), 0, kaomojis[Math.floor(Math.random() * kaomojis.length)].text);
  }
  var reply = replyParts.length > 0 ? replyParts.join('') : '嗯嗯';
  // 刚领取红包时，用感谢语替换普通回复（恋爱向）
  if (groupRpClaimed) {
    var thanks = ['谢谢宝贝，最爱你了～', '宝贝的红包，甜到心里啦！', '收到啦，亲亲抱抱～', '爱你哟，宝贝最好啦！', '宝贝破费啦，么么哒！', '有宝贝宠着，太幸福啦～'];
    reply = thanks[Math.floor(Math.random() * thanks.length)];
  }
  
  var msgs = Storage.getMessages(chatId);
  msgs.push({ id: Date.now(), type: 'other', fromId: member.id, text: reply, time: Date.now(), msgType: 'text' });
  Storage.setMessages(chatId, msgs);

  // 聊天特效：群聊成员发送字卡内容命中关键词同样触发（复用同一套关键词→特效映射）
  var fx = matchChatEffect(reply);
  if (fx) {
    setTimeout(function() { triggerChatEffect(fx); }, 350);
  }

  updateLastMsg(chatId, (member.nickname || '成员') + '：' + reply);
  _safeRenderChat(chatId);
  App.playSound('receive');
  showBackgroundPush((member.nickname || '成员') + '：' + reply);
}

/* 红包 icon（内联 SVG，替换原「開」字与「微信红包」标题） */
var RED_PACKET_ICON_SVG = '<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true" style="display:block">'
  + '<rect x="9" y="19" width="46" height="36" rx="6" fill="#E60012"/>'
  + '<rect x="9" y="19" width="46" height="11" rx="5.5" fill="#FF2D2D"/>'
  + '<path d="M9 25 Q32 38 55 25" stroke="#FFD34D" stroke-width="4" fill="none" stroke-linecap="round"/>'
  + '<circle cx="32" cy="24.5" r="6.5" fill="#FFD34D"/>'
  + '<text x="32" y="49" text-anchor="middle" font-size="13" font-weight="bold" fill="#FFD34D" font-family="Arial, sans-serif">¥</text>'
  + '</svg>';

/* 金色红包简笔画 icon（纯金色线条描边，用于红包气泡左侧、紧贴祝福语） */
var GOLD_RED_PACKET_ICON_SVG = '<svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" style="display:block" fill="none" stroke="#F5C542" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">'
  + '<rect x="9" y="19" width="46" height="35" rx="7"/>'
  + '<path d="M9 25 Q32 39 55 25"/>'
  + '<text x="32" y="48" text-anchor="middle" font-size="15" font-weight="bold" fill="#F5C542" stroke="none" font-family="Arial, sans-serif">¥</text>'
  + '</svg>';

/* 金额显示格式化：小于 1 亿显示完整具体数字（整数尾 0 必须保留）；超过 1 亿显示 X亿+XXXX */
function formatRpAmountDisplay(n) {
  n = Number(n) || 0;
  // 超过 1 亿：X亿+XXXX（XXXX 为亿后万位部分，补零至 4 位；全为 0 时不显示 +）
  if (n >= 100000000) {
    var yi = Math.floor(n / 100000000);
    var rest = Math.floor((n % 100000000) / 10000);
    if (rest > 0) {
      var restStr = String(rest);
      while (restStr.length < 4) { restStr = '0' + restStr; }
      return yi + '亿+' + restStr;
    }
    return yi + '亿';
  }
  function trim(v) {
    v = Math.round(v * 100) / 100;
    var s = String(v);
    // 仅去掉小数部分末尾多余的 0；整数部分（如 10000）的 0 必须保留
    if (s.indexOf('.') >= 0) {
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
  }
  if (n >= 10000) return trim(n);
  return n.toFixed(2);
}

/* ============================================================
   消息操作菜单：撤回 / 收藏 / 引用 / 删除（点击消息气泡弹出）
   ============================================================ */
var _activeMsgMenu = null;
var _pendingQuote = null;

/* ============================================================
   顶栏在线状态 / 情绪状态（内置随机展示，允许在角色编辑中自定义）
   ============================================================ */
var CHAT_ONLINE_STATUSES = [
  { text: '在线', dot: '#58C878' },
  { text: '离线', dot: '#B0B0B0' },
  { text: '离开', dot: '#E0A84C' },
  { text: '忙碌', dot: '#E86858' },
  { text: '勿扰', dot: '#D068A0' },
  { text: '隐身', dot: '#A8A0C8' }
];
var CHAT_MOOD_STATUSES = [
  '开心', '想你', '元气满满', '安静', '温柔', '有点困', '发呆中',
  '傲娇', '小确幸', '期待见面', '心情不错', '专心摸鱼', '懒洋洋', '美滋滋'
];

/* 设置聊天室顶栏的在线状态与情绪状态：
   角色在「账号设置-编辑角色」里手动指定则显示指定值，否则从内置列表随机展示 */
function setChatRoomStatus(partner) {
  var statusEl = document.getElementById('chat-room-status');
  if (!statusEl) return;
  var onlineText = (partner && partner.onlineStatus) || '';
  var moodText = (partner && partner.moodStatus) || '';
  if (!onlineText) {
    onlineText = CHAT_ONLINE_STATUSES[Math.floor(Math.random() * CHAT_ONLINE_STATUSES.length)].text;
  }
  if (!moodText) {
    moodText = CHAT_MOOD_STATUSES[Math.floor(Math.random() * CHAT_MOOD_STATUSES.length)];
  }
  var dotColor = '#58C878';
  CHAT_ONLINE_STATUSES.forEach(function(s) { if (s.text === onlineText) dotColor = s.dot; });
  statusEl.innerHTML = '<span class="chat-room-status-dot" style="background:' + dotColor + '"></span>'
    + '<span>' + Core.escapeHtml(onlineText) + '</span>'
    + '<span class="chat-room-status-sep">·</span>'
    + '<span>' + Core.escapeHtml(moodText) + '</span>';
}

function bindChatTapMenu(container) {
  if (!container || container.dataset.tapBound) return;
  container.dataset.tapBound = '1';

  // 点击消息气泡弹出操作菜单（红包气泡走领取/退回面板，不在此列）
  container.addEventListener('click', function(e) {
    // 点击引用条：跳转到被引用的原始消息
    var qRef = e.target.closest ? e.target.closest('.msg-quote-ref') : null;
    if (qRef) {
      e.preventDefault();
      e.stopPropagation();
      scrollToQuoteMessage(qRef.getAttribute('data-quote-id'), qRef.textContent || '');
      return;
    }
    var el = e.target.closest ? e.target.closest('.message-bubble, .message-sticker-direct, .message-image, .decision-card') : null;
    if (!el) return;
    // 红包气泡有自己的领取/退回面板
    if (el.classList.contains('redpacket-bubble')) return;
    // 语音气泡点击为播放语音，不弹操作菜单
    if (el.classList.contains('voice-bubble')) return;
    var row = el.closest('.message-row');
    if (!row || !row.dataset.msgId) return;
    e.preventDefault();
    e.stopPropagation();
    showMsgActionMenu(row.dataset.msgId, el);
  });

  // 双击图片查看大图（单击已用于弹出操作菜单）
  container.addEventListener('dblclick', function(e) {
    var img = e.target.closest ? e.target.closest('.message-image') : null;
    if (!img || !img.src) return;
    e.stopPropagation();
    viewChatImage(img.src);
  });

  // 滚动时关闭菜单
  container.addEventListener('scroll', function() { closeMsgActionMenu(); }, { passive: true });
}

function showMsgActionMenu(msgId, anchorEl) {
  closeMsgActionMenu();
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId) return;
  var messages = Storage.getMessages(chatId);
  var msg = null;
  for (var i = 0; i < messages.length; i++) {
    if (String(messages[i].id) === String(msgId)) { msg = messages[i]; break; }
  }
  if (!msg) return;

  var rect = anchorEl.getBoundingClientRect();
  var menu = document.createElement('div');
  menu.className = 'msg-action-menu';
  menu.dataset.msgId = msgId;
  // 表情包不支持收藏，不显示收藏按键
  var favoriteItem = (msg.msgType === 'sticker')
    ? ''
    : '<div class="msg-action-item" data-act="favorite" title="收藏"><i class="fas fa-star"></i><span>收藏</span></div>';
  menu.innerHTML =
      '<div class="msg-action-item" data-act="recall" title="撤回"><i class="fas fa-rotate-left"></i><span>撤回</span></div>'
    + favoriteItem
    + '<div class="msg-action-item" data-act="quote" title="引用"><i class="fas fa-reply"></i><span>引用</span></div>'
    + '<div class="msg-action-item" data-act="delete" title="删除"><i class="fas fa-trash-can"></i><span>删除</span></div>';

  document.body.appendChild(menu);
  var mw = menu.offsetWidth;
  var mh = menu.offsetHeight;
  var left = rect.left + rect.width / 2 - mw / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - mw - 10));
  var top = rect.top - mh - 14;
  if (top < 12) {
    top = rect.bottom + 14;
    menu.classList.add('below');
  }
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  _activeMsgMenu = menu;

  menu.addEventListener('click', function(ev) {
    var item = ev.target.closest('.msg-action-item');
    if (!item || !_activeMsgMenu) return;
    var act = item.dataset.act;
    closeMsgActionMenu();
    if (act === 'recall') doRecallMessage(chatId, msgId);
    else if (act === 'favorite') doFavoriteMessage(chatId, msgId);
    else if (act === 'quote') doQuoteMessage(chatId, msgId);
    else if (act === 'delete') doDeleteMessage(chatId, msgId);
  });
}

function closeMsgActionMenu() {
  if (_activeMsgMenu) {
    _activeMsgMenu.remove();
    _activeMsgMenu = null;
  }
}

document.addEventListener('click', function() { closeMsgActionMenu(); });

function doRecallMessage(chatId, msgId) {
  var messages = Storage.getMessages(chatId);
  var idx = -1;
  for (var i = 0; i < messages.length; i++) {
    if (String(messages[i].id) === String(msgId)) { idx = i; break; }
  }
  if (idx === -1) return;
  var recalled = messages[idx];
  if (recalled.isRecall) return;
  var isSelf = recalled.type === 'self';
  var partnerName = _getCurrentPartnerName();
  // 群聊：撤回发言人为具体成员
  if (!isSelf && isGroupChatId(chatId) && recalled.fromId) {
    var rg = getGroupByChatId(chatId);
    var rgm = rg ? getGroupMembers(rg) : [];
    for (var ri = 0; ri < rgm.length; ri++) {
      if (rgm[ri].id === recalled.fromId) { partnerName = rgm[ri].nickname || '成员'; break; }
    }
  }
  messages[idx] = {
    id: recalled.id,
    type: isSelf ? 'self' : 'other',
    fromId: recalled.fromId || '',
    text: isSelf ? '你撤回了一条消息' : (partnerName + '撤回了一条消息'),
    time: Date.now(),
    msgType: 'text',
    isRecall: true,
    recallName: isSelf ? '' : partnerName,
    recalledContent: _captureRecallContent(recalled)
  };
  Storage.setMessages(chatId, messages);
  renderChatMessages(chatId);
}

/* 保存撤回前的消息内容（用于「显示撤回内容」开关） */
function _captureRecallContent(msg) {
  var c = { msgType: msg.msgType || 'text' };
  if (c.msgType === 'text') {
    c.text = msg.text || '';
    c.quote = msg.quote || null;
  } else if (c.msgType === 'decision') {
    // 决策卡：完整保存问题、选项、作答结果，撤回后「显示撤回内容」可完整还原
    c.text = msg.text || '';
    c.decision = msg.decision ? JSON.parse(JSON.stringify(msg.decision)) : null;
  } else if (c.msgType === 'redpacket') {
    c.greeting = msg.greeting || '';
    c.claimed = !!msg.claimed;
    c.amount = msg.amount;
    c.rpType = msg.rpType;
    c.totalAmount = msg.totalAmount;
    c.count = msg.count;
  } else if (c.msgType === 'sticker') {
    c.stickerData = msg.stickerData || '';
  } else if (c.msgType === 'doodle') {
    c.stickerData = msg.stickerData || '';
  } else if (c.msgType === 'image') {
    c.imageData = msg.imageData || '';
  } else if (c.msgType === 'voice') {
    c.duration = msg.duration || 3;
    c.audioUrl = msg.audioUrl || '';
    c.audioData = msg.audioData || '';
    c.audioMime = msg.audioMime || '';
    c.voiceText = msg.voiceText || '';
  }
  return c;
}

/* 获取当前聊天对象的角色名 */
function _getCurrentPartnerName() {
  if (!_chatCurrentPartnerId) return '对方';
  var partners = Storage.getPartnerProfiles();
  for (var i = 0; i < partners.length; i++) {
    if (partners[i].id === _chatCurrentPartnerId) return partners[i].nickname || '对方';
  }
  return '对方';
}

function doDeleteMessage(chatId, msgId) {
  var messages = Storage.getMessages(chatId).filter(function(m) {
    return String(m.id) !== String(msgId);
  });
  Storage.setMessages(chatId, messages);
  renderChatMessages(chatId);
  Core.toast('消息已删除');
}

/* 构建结构化收藏对象：含消息类别、发送方、时间与内容数据 */
function _buildFavorite(msg, chatId) {
  var category = 'other';
  var label = '其他';
  var text = '';
  var stickerData = '';
  var imageData = '';
  var decisionData = null;
  // 红包、表情包不支持收藏
  if (msg.msgType === 'redpacket' || msg.msgType === 'sticker') return null;
  if (msg.msgType === 'text') { category = 'text'; label = '文本'; text = msg.text || ''; }
  else if (msg.msgType === 'doodle') { category = 'doodle'; label = '涂鸦'; text = '[涂鸦]'; stickerData = msg.stickerData || ''; }
  else if (msg.msgType === 'image') { category = 'image'; label = '图片'; text = '[图片]'; imageData = msg.imageData || ''; }
  else if (msg.isPat) { category = 'pat'; label = '拍一拍'; text = msg.text || ''; }
  else if (msg.isBlackNotice) { category = 'blacknotice'; label = '黑屋通知'; text = msg.text || ''; }
  else if (msg.msgType === 'decision') {
    category = 'decision'; label = '决策卡'; text = msg.text || '';
    // 保存完整决策数据（问题、选项、对方勾选结果），供收藏页还原展示
    decisionData = {
      question: (msg.decision && msg.decision.question) || '',
      options: (msg.decision && msg.decision.options) || [],
      result: (msg.decision && msg.decision.result) || {},
      answers: (msg.decision && msg.decision.answers) || []
    };
  }
  if (!text && !stickerData && !imageData) return null;
  // 发送方：单聊按我方/对方，群聊按发言人昵称
  var from = '对方';
  if (msg.type === 'self') {
    var myProfile = Storage.getMyProfile();
    from = (myProfile && (myProfile.name || myProfile.nickname)) || '我';
  } else if (isGroupChatId(chatId)) {
    var group = getGroupByChatId(chatId);
    var members = getGroupMembers(group);
    var fromP = msg.fromId ? members.filter(function(m) { return m.id === msg.fromId; })[0] : null;
    from = fromP ? (fromP.nickname || '成员') : '成员';
  } else {
    // 单聊对方：显示对方具体名字
    var partnerId = chatId.indexOf('partner_') === 0 ? chatId.substring('partner_'.length) : '';
    var partners = Storage.getPartnerProfiles();
    for (var pi = 0; pi < partners.length; pi++) {
      if (partners[pi].id === partnerId) { from = partners[pi].nickname || partners[pi].name || '对方'; break; }
    }
  }
  return {
    id: String(msg.id),
    category: category,
    label: label,
    text: text,
    from: from,
    time: msg.time || Date.now(),
    stickerData: stickerData,
    imageData: imageData,
    decisionData: decisionData
  };
}

function doFavoriteMessage(chatId, msgId) {
  var messages = Storage.getMessages(chatId);
  var msg = null;
  for (var i = 0; i < messages.length; i++) {
    if (String(messages[i].id) === String(msgId)) { msg = messages[i]; break; }
  }
  if (!msg) return;
  var fav = _buildFavorite(msg, chatId);
  if (!fav) { Core.toast('该消息无法收藏'); return; }
  var favorites = Storage.getFavorites();
  var exists = favorites.filter(function(f) { return String(f.id) === String(fav.id); })[0];
  if (exists) { Core.toast('已在收藏中'); return; }
  favorites.unshift(fav);
  Storage.setFavorites(favorites);
  Core.toast('已收藏');
}

function doQuoteMessage(chatId, msgId) {
  var messages = Storage.getMessages(chatId);
  var msg = null;
  for (var i = 0; i < messages.length; i++) {
    if (String(messages[i].id) === String(msgId)) { msg = messages[i]; break; }
  }
  if (!msg) return;
  var text = '';
  var stickerData = '';
  var imageData = '';
  if (msg.msgType === 'text') text = msg.text || '';
  else if (msg.msgType === 'decision') text = '[帮我抉择] ' + ((msg.decision && msg.decision.question) || '');
  else if (msg.msgType === 'redpacket') text = '[红包] ' + (msg.greeting || '');
  else if (msg.msgType === 'sticker') { text = '[表情]'; stickerData = msg.stickerData || ''; }
  else if (msg.msgType === 'doodle') { text = '[涂鸦]'; stickerData = msg.stickerData || ''; }
  else if (msg.msgType === 'image') { text = '[图片]'; imageData = msg.imageData || ''; }
  if (!text) return;
  // 记录被引用消息 ID 与表情/图片数据，便于渲染图片与点击跳转
  _pendingQuote = {
    text: text,
    from: msg.type === 'self' ? '我' : '对方',
    msgId: msg.id,
    stickerData: stickerData,
    imageData: imageData
  };
  var bar = document.getElementById('chat-quote-bar');
  var barText = document.getElementById('chat-quote-text');
  if (bar && barText) {
    barText.innerHTML = '<span class="chat-quote-label">' + Core.escapeHtml(_pendingQuote.from + '：') + '</span>' + _quoteContentHtml(_pendingQuote);
    bar.style.display = 'flex';
  }
  var input = document.getElementById('chat-input');
  if (input) input.focus();
}

/* 引用内容 HTML：表情包/图片直接渲染图片，其余渲染文本 */
function _cleanBreakChars(text) {
  /* 清理消息文本中会导致意外断行的零宽/控制字符：
     移除零宽空格(ZWSP)、零宽非连接符、方向标记、BOM、字词连接符；
     保留零宽连接符(ZWJ)以兼容 emoji 组合显示 */
  return String(text || '')
    .replace(/[\u200b\u200c\u200e\u200f]/g, '')
    .replace(/\ufeff/g, '')
    .replace(/\u2060/g, '');
}

function _quoteContentHtml(quote) {
  if (!quote) return '';
  if (quote.stickerData) {
    return '<img src="' + quote.stickerData + '" class="msg-quote-img" alt="表情">';
  }
  if (quote.imageData) {
    return '<img src="' + quote.imageData + '" class="msg-quote-img" alt="图片">';
  }
  return Core.escapeHtml(_cleanBreakChars(quote.text || ''));
}

/* 点击引用条：滚动定位到被引用消息并高亮闪烁 */
function scrollToQuoteMessage(msgId, quoteText) {
  var container = document.getElementById('chat-messages');
  if (!container) {
    if (Core && Core.toast) Core.toast('被引用的消息已不存在');
    return;
  }
  var rows = container.querySelectorAll('.message-row');
  var target = null;
  // 优先按消息 ID 精确匹配（遍历 DOM，避免选择器对特殊字符/类型不敏感导致误判）
  if (msgId) {
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].getAttribute('data-msg-id')) === String(msgId)) {
        target = rows[i];
        break;
      }
    }
  }
  // 历史/自动回复产生的引用可能未携带 ID：按引用文本回退查找最近一条文本一致的消息
  if (!target && quoteText) {
    var qText = String(quoteText).replace(/\s+/g, '');
    for (var j = rows.length - 1; j >= 0; j--) {
      var bubble = rows[j].querySelector('.message-bubble');
      if (!bubble) continue;
      var bubbleText = bubble.textContent || '';
      // 去掉气泡内引用块的文本，只比对消息本体
      var qr = bubble.querySelector('.msg-quote-ref');
      if (qr) bubbleText = bubbleText.replace(qr.textContent || '', '');
      if (bubbleText.replace(/\s+/g, '') === qText) {
        target = rows[j];
        break;
      }
    }
  }
  if (!target) {
    if (Core && Core.toast) Core.toast('被引用的消息已不存在');
    return;
  }
  if (target.scrollIntoView) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  target.classList.remove('msg-quote-highlight');
  // 等平滑滚动基本结束后再触发高亮动画，避免滚动途中强制重排导致气泡“消失再出现”
  setTimeout(function() {
    void target.offsetWidth;
    target.classList.add('msg-quote-highlight');
    setTimeout(function() {
      target.classList.remove('msg-quote-highlight');
    }, 1600);
  }, 420);
}

function cancelQuoteReply() {
  _pendingQuote = null;
  var bar = document.getElementById('chat-quote-bar');
  if (bar) bar.style.display = 'none';
}

function renderChatMessages(chatId) {
  var container = document.getElementById('chat-messages');
  if (!container) return;
  
  var messages = Storage.getMessages(chatId);
  var myProfile = Storage.getMyProfile();
  var isGroup = isGroupChatId(chatId);
  
  // 小黑屋名单（单聊与群聊通用；被关入的成员发消息会附带「已被打入冷宫」标签）
  var blackRoomIds = [];
  var _br = Storage.get('blackRoom_' + chatId, []);
  blackRoomIds = Array.isArray(_br) ? _br : [];
  
  // 获取当前聊天对象资料（用于渲染头像）
  var chatPartner = null;
  if (_chatCurrentPartnerId && !isGroup) {
    var allPartners = Storage.getPartnerProfiles();
    for (var pi = 0; pi < allPartners.length; pi++) {
      if (allPartners[pi].id === _chatCurrentPartnerId) { chatPartner = allPartners[pi]; break; }
    }
  }
  // 群聊成员映射（发言人头像/昵称）
  var groupPartnerMap = {};
  if (isGroup) {
    var groupObj = getGroupByChatId(chatId);
    var gMembers = groupObj ? getGroupMembers(groupObj) : [];
    gMembers.forEach(function(m) { groupPartnerMap[m.id] = m; });
  }
  var selfAvatarHtml = _buildMessageAvatar(myProfile);
  var otherAvatarHtml = _buildMessageAvatar(chatPartner);

  // sync persisted red packet state
  messages.forEach(function(msg) {
    if (msg.msgType === 'redpacket') {
      var saved = RedPacketStorage.load(chatId, msg.id);
      if (saved) {
        msg.claimed = saved.claimed;
        msg.returned = saved.returned;
        msg.amount = saved.amount;
        msg.selfAmount = saved.selfAmount || 0;
        msg.otherAmount = saved.otherAmount || 0;
        msg.totalAmount = saved.totalAmount || msg.totalAmount;
        msg.count = saved.count || msg.count;
        msg.rpType = saved.rpType || msg.rpType;
        msg.greeting = saved.greeting || msg.greeting;
      }
    }
  });
  
  var html = '';
  var lastDate = '';
  
  // 群聊公告：置顶居中气泡
  if (isGroup) {
    var gObj = getGroupByChatId(chatId);
    if (gObj && gObj.announcement) {
      html += '<div class="group-announcement-bubble"><div class="group-announcement-inner">'
        + '<div class="group-announcement-label"><i class="fas fa-bullhorn"></i> 群公告</div>'
        + '<div class="group-announcement-text">' + Core.escapeHtml(gObj.announcement) + '</div>'
        + (gObj.announcementTime ? '<div class="group-announcement-meta">发布于 ' + Core.formatTime(gObj.announcementTime) + '</div>' : '')
        + '</div></div>';
    }
  }
  
  messages.forEach(function(msg) {
    var msgDate = Core.formatDate(msg.time);
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      html += '<div class="chat-date-divider">' + msgDate + '</div>';
    }
    
    var isSelf = msg.type === 'self';
    
    // 群聊：按发言人取头像与昵称
    var rowSelfAvatar = selfAvatarHtml;
    var rowOtherAvatar = otherAvatarHtml;
    var senderName = '';
    var senderStatusHtml = '';
    var rowGroupCls = '';
    if (isGroup && !isSelf) {
      rowGroupCls = ' in-group';
      var fromP = msg.fromId ? groupPartnerMap[msg.fromId] : null;
      if (fromP) {
        rowOtherAvatar = _buildMessageAvatar(fromP);
        senderName = fromP.nickname || '成员';
        senderStatusHtml = _groupMemberStatusHtml(fromP);
      } else {
        senderName = '成员';
      }
    }
    
    if (msg.isPat) {
      // 拍一拍（居中气泡，粉红色系，方形圆角5，类似撤回/黑屋通知）
      // 符号按发送方区分：我方发送用「我方符号」，对方发送用「对方符号」（可在聊天设置-功能设置中自定义）
      var patSym = _patSymbolForMsg(msg);
      // 默认爱心保持原 SVG 图标；自定义符号以文字渲染
      var patIconHtml = (patSym === '♥' && window.PAT_ICON_SVG)
        ? PAT_ICON_SVG
        : Core.escapeHtml(patSym);
      html += '<div class="message-pat">'
        + '<span class="pat-icon">' + patIconHtml + '</span>'
        + Core.escapeHtml(msg.text || '')
        + '<span class="pat-icon">' + patIconHtml + '</span>'
        + '</div>';
    } else if (msg.isBlackNotice) {
      // 黑屋通知（居中气泡，粉红色系，方形圆角5）
      // 前置铃铛禁入小图标
      var bnText = msg.text || '';
      var bnMatch = /^\[黑屋通知·([^\]]*)\]\s*/.exec(bnText);
      var bnTarget = bnMatch ? bnMatch[1] : '';
      var bnBody = bnMatch ? bnText.slice(bnMatch[0].length) : bnText;
      html += '<div class="message-black-notice">'
        + '<span class="black-notice-heart">' + BLACK_NOTICE_ICON_SVG + '</span>'
        + (bnTarget ? '<span class="black-notice-target">' + Core.escapeHtml(bnTarget) + '</span>：' : '')
        + Core.escapeHtml(bnBody)
        + '</div>';
    } else if (msg.isPunish) {
      // 惩罚通知（居中气泡，红色系，方形圆角5，类似撤回/黑屋通知）
      var pnText = msg.text || '';
      var pnMatch = /^\[惩罚·([^\]]*)\]\s*/.exec(pnText);
      var pnTarget = pnMatch ? pnMatch[1] : '';
      var pnBody = pnMatch ? pnText.slice(pnMatch[0].length) : pnText;
      html += '<div class="message-punish">'
        + '<span class="punish-icon">' + PUNISH_ICON_SVG + '</span>'
        + (pnTarget ? '<span class="punish-target">' + Core.escapeHtml(pnTarget) + '</span>：' : '')
        + Core.escapeHtml(pnBody)
        + '</div>';
    } else if (msg.isCall) {
      // 通话事件（居中气泡，类似撤回提示）；未接/拒接为粉红色，已接通为浅色默认样式
      var callCls = '';
      if (msg.callStatus === 'missed' || msg.callStatus === 'rejected') {
        callCls = ' call-warn';
      }
      html += '<div class="message-recall message-call' + callCls + '">' + Core.escapeHtml(msg.text || '') + '</div>';
    } else if (msg.isRecall) {
      // 撤回提示（居中气泡）
      var showRecallContent = Storage.getShowRecallContent();
      var recallText = (msg.text || (msg.type === 'self' ? '你撤回了一条消息' : ((msg.recallName || '对方') + '撤回了一条消息'))).replace(/【来自手机的消息】/g, '');
      // 被撤回成员是否在黑屋（群聊按 fromId；单聊非自己消息且黑屋名单非空即视为黑屋成员）
      var recallIsBlack = false;
      if (!isSelf) {
        if (isGroup) {
          recallIsBlack = !!(msg.fromId && blackRoomIds.indexOf(msg.fromId) !== -1);
        } else {
          recallIsBlack = blackRoomIds.length > 0;
        }
      }
      // 开启「显示撤回内容」时：撤回消息保留原气泡，并在气泡后标注「已撤回」（自己与对方撤回均显示）
      // 若被撤回成员在黑屋：黑屋标签置于「已撤回」标签之前
      if (showRecallContent && msg.recalledContent) {
        var recallSuffix = '';
        if (recallIsBlack) {
          // 黑屋成员：两个标签水平并排，「已撤回」位于「已被打入冷宫」右侧
          recallSuffix = '<span class="msg-recall-tags">'
            + '<span class="msg-black-room-tag">已被打入冷宫</span>'
            + '<span class="msg-recalled-tag">已撤回</span>'
            + '</span>';
        } else {
          recallSuffix = '<span class="msg-recalled-tag">已撤回</span>';
        }
        html += _buildNormalMessageHtml(_rebuildRecalledMsg(msg), isSelf, rowSelfAvatar, rowOtherAvatar, recallSuffix, senderName, senderStatusHtml, rowGroupCls);
      }
      html += '<div class="message-recall">' + Core.escapeHtml(recallText) + '</div>';
    } else {
      // 被关入小黑屋的成员发消息，气泡后附带「已被打入冷宫」标签（群聊按 fromId，单聊非自己消息且名单非空）
      var blackSuffix = '';
      var senderBlack = false;
      if (!isSelf) {
        if (isGroup) {
          senderBlack = !!(msg.fromId && blackRoomIds.indexOf(msg.fromId) !== -1);
        } else {
          senderBlack = blackRoomIds.length > 0;
        }
      }
      if (senderBlack) {
        blackSuffix = '<span class="msg-black-room-tag">已被打入冷宫</span>';
      }
      html += _buildNormalMessageHtml(msg, isSelf, rowSelfAvatar, rowOtherAvatar, blackSuffix, senderName, senderStatusHtml, rowGroupCls);
    }
  });
  
  container.innerHTML = html;
  // 定位到指定消息（全局搜索跳转）并高亮
  if (_pendingScrollMsgId) {
    var targetRow = container.querySelector('.message-row[data-msg-id="' + _pendingScrollMsgId + '"]');
    if (targetRow) {
      var rect = targetRow.getBoundingClientRect();
      var cRect = container.getBoundingClientRect();
      container.scrollTop = container.scrollTop + (rect.top - cRect.top) - container.clientHeight / 2;
      targetRow.classList.add('msg-highlight');
      setTimeout(function() { targetRow.classList.remove('msg-highlight'); }, 2200);
    }
    _pendingScrollMsgId = null;
  } else {
    container.scrollTop = container.scrollHeight;
  }
  bindChatTapMenu(container);
  
  // 为尚未安排已读回执的自我消息补调度（含页面刷新后的恢复）
  reschedulePendingReads(chatId);
}

/* 构建普通消息 HTML（文本/表情/图片/红包；suffixHtml 追加在气泡后面，senderName 为群聊发言人昵称） */
/* 群聊成员在线/情绪状态（角色自定义优先，未设置则随机并缓存） */
var _groupMemberStatusCache = {};
function _groupMemberStatusOf(member) {
  if (!member) return { online: '', mood: '' };
  var id = member.id;
  if (!_groupMemberStatusCache[id]) {
    var online = member.onlineStatus || CHAT_ONLINE_STATUSES[Math.floor(Math.random() * CHAT_ONLINE_STATUSES.length)].text;
    var mood = member.moodStatus || CHAT_MOOD_STATUSES[Math.floor(Math.random() * CHAT_MOOD_STATUSES.length)];
    _groupMemberStatusCache[id] = { online: online, mood: mood };
  }
  return _groupMemberStatusCache[id];
}
function _groupMemberStatusHtml(member) {
  var st = _groupMemberStatusOf(member);
  if (!st) return '';
  var parts = [];
  if (st.online) parts.push('<span class="group-sender-online">' + Core.escapeHtml(st.online) + '</span>');
  if (st.mood) parts.push('<span class="group-sender-mood">' + Core.escapeHtml(st.mood) + '</span>');
  if (!parts.length) return '';
  return '<span class="group-sender-status">' + parts.join('<span class="group-sender-sep">·</span>') + '</span>';
}

function _buildNormalMessageHtml(msg, isSelf, selfAvatarHtml, otherAvatarHtml, suffixHtml, senderName, senderStatusHtml, rowGroupCls) {
  var html = '';
  // 气泡美化扩展（仅文本气泡应用；图片/贴纸/红包/语音保持原样）
  var bubExt = (window.BubbleMaker && BubbleMaker.buildBubbleExt)
    ? BubbleMaker.buildBubbleExt(msg, isSelf)
    : { extraCls: '', deco: '', ears: '' };
  var senderHtml = '';
  if (senderName) {
    senderHtml = '<div class="message-sender-name">' + Core.escapeHtml(senderName)
      + (senderStatusHtml || '') + '</div>';
  }
  if (msg.msgType === 'sticker') {
    html += '<div class="message-row sticker-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<img src="' + msg.stickerData + '" class="message-sticker-direct" alt="表情">'
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  } else if (msg.msgType === 'doodle') {
    html += '<div class="message-row sticker-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<img src="' + msg.stickerData + '" class="message-sticker-direct" alt="涂鸦">'
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  } else if (msg.msgType === 'image') {
    html += '<div class="message-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<img src="' + msg.imageData + '" class="message-image" alt="图片">'
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  } else if (msg.msgType === 'redpacket') {
    var isClaimed = msg.claimed;
    var isReturned = msg.returned;
    var bubbleCls = 'redpacket-bubble';
    if (isClaimed) bubbleCls += ' claimed';
    else if (isReturned) bubbleCls += ' returned';
    var clickHandler = (isClaimed || isReturned) ? 'showClaimedDetail(' + msg.id + ')' : 'showRedPacketAction(' + msg.id + ')';
    var greetingText = msg.greeting || '恭喜发财，大吉大利';
    var gLen = greetingText.length;
    var gFont = gLen <= 6 ? '0.95rem' : (gLen <= 9 ? '0.88rem' : (gLen <= 13 ? '0.8rem' : (gLen <= 18 ? '0.72rem' : (gLen <= 24 ? '0.64rem' : (gLen <= 28 ? '0.56rem' : '0.5rem')))));
    var rpAmount = msg.totalAmount || msg.amount || 0;
    // 金额直接显示完整具体数字，不做单位缩写
    var amtText = '¥' + formatRpAmountDisplay(rpAmount);
    var amtFont = amtText.length > 9 ? '0.8rem' : (amtText.length > 7 ? '0.9rem' : '1.08rem');
    html += '<div class="message-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<div class="' + bubbleCls + '" onclick="' + clickHandler + '">'
          + (isReturned ? '<div class="rp-status">已退回</div>' : '')
          + '<div class="rp-content">'
          + '<div class="rp-medallion">' + GOLD_RED_PACKET_ICON_SVG + '</div>'
          + '<div class="rp-texts">'
          + '<div class="rp-line-top">'
          + '<div class="rp-amount" style="font-size:' + amtFont + '">' + amtText + '</div>'
          + '</div>'
          + '<div class="rp-greeting" style="font-size:' + gFont + '">' + Core.escapeHtml(greetingText) + '</div>'
          + '</div>'
          + '</div>'
          + '</div>'
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  } else if (msg.msgType === 'voice') {
    var voiceDur = msg.duration || 3;
    var voiceSrc = msg.audioData || msg.audioUrl || '';
    var voiceText = msg.voiceText || '';
    html += '<div class="message-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<div class="message-bubble voice-bubble" onclick="playVoiceMsg(this)" data-dur="' + voiceDur + '"' + (voiceSrc ? ' data-audio="' + voiceSrc + '"' : '') + '>'
          + '<i class="fas fa-volume-up voice-icon"></i>'
          + '<span class="voice-wave"><span></span><span></span><span></span><span></span><span></span></span>'
          + '<span class="voice-duration">' + voiceDur + '"</span>'
          + '</div>'
          + (voiceText
              ? '<span class="voice-trans-btn" onclick="toggleVoiceText(this)">转文字</span>'
                + '<div class="voice-text-box" style="display:none">' + Core.escapeHtml(voiceText) + '</div>'
              : '')
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  } else {
    var quoteHtml = '';
    if (msg.quote && (msg.quote.text || msg.quote.stickerData || msg.quote.imageData)) {
      var qIdAttr = msg.quote.msgId ? ' data-quote-id="' + msg.quote.msgId + '"' : '';
      quoteHtml = '<span class="msg-quote-ref"' + qIdAttr + '>' + _quoteContentHtml(msg.quote) + '</span>';
    }
    html += '<div class="message-row ' + (isSelf ? 'self' : 'other' + rowGroupCls) + '" data-msg-id="' + msg.id + '">'
          + (isSelf ? selfAvatarHtml : otherAvatarHtml)
          + '<div class="message-body">'
          + senderHtml
          + '<div class="message-bubble' + bubExt.extraCls + '">' + bubExt.ears + quoteHtml + Core.escapeHtml(_cleanBreakChars(msg.text || '')) + bubExt.deco + '</div>'
          + suffixHtml
          + '<div class="message-meta">' + _buildReadStatusHtml(msg) + '<div class="message-time">' + Core.formatTime(msg.time) + '</div></div>'
          + '</div>'
          + '</div>';
  }
  return html;
}

/* 构建已读状态 HTML（仅我方发送的消息显示；图形 ✓/✓✓、文字 已读/未读、心形 ♡/❤） */
function _buildReadStatusHtml(msg) {
  if (!msg || msg.type !== 'self' || msg.isRecall || msg.isCall) return '';
  if (!Storage.getReadReceipt()) return '';
  var read = !!msg.read;
  var mode = Storage.getReadReceiptMode();
  if (mode === 'text') {
    return '<span class="msg-read-status msg-read-text ' + (read ? 'read' : 'unread') + '">' + (read ? '已读' : '未读') + '</span>';
  }
  return '<span class="msg-read-status msg-read-icon ' + (read ? 'read' : 'unread') + '">' + (read ? '<span class="tick">✓✓</span>' : '✓') + '</span>';
}

/* 从撤回消息中重建原消息（用于「显示撤回内容」） */
function _rebuildRecalledMsg(msg) {
  var c = msg.recalledContent || {};
  return {
    id: msg.id,
    type: msg.type,
    fromId: msg.fromId || '',
    time: msg.time,
    msgType: c.msgType || 'text',
    text: c.text || '',
    quote: c.quote || null,
    decision: c.decision || null,
    greeting: c.greeting || '',
    claimed: !!c.claimed,
    amount: c.amount,
    rpType: c.rpType,
    totalAmount: c.totalAmount,
    count: c.count,
    stickerData: c.stickerData || '',
    imageData: c.imageData || '',
    duration: c.duration || 3,
    audioUrl: c.audioUrl || '',
    audioData: c.audioData || '',
    audioMime: c.audioMime || '',
    voiceText: c.voiceText || ''
  };
}

/* 构建聊天消息头像 HTML */
function _buildMessageAvatar(profile) {
  if (!profile) return '';
  var text = profile.avatar || profile.nickname || '';
  if (text.length > 1) text = text.charAt(0);
  var color = profile.avatarColor || '#A090B0';
  var shape = (profile.avatarShape === 'square') ? '8px' : '50%';
  if (profile.avatarImage) {
    return '<div class="message-avatar" style="background:' + color + ';background-image:url(' + profile.avatarImage + ');background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:' + shape + '"></div>';
  }
  return '<div class="message-avatar" style="background:' + color + ';border-radius:' + shape + '">' + Core.escapeHtml(text || '?') + '</div>';
}

/* ============================================================
   语音消息：输入栏语音模式（点击录音，真实录入声音，最长 5 分钟）+ 语音气泡真实播放
   ============================================================ */
var _voiceMode = false;
var _voiceRecording = false;
var _voiceStartTime = 0;
var _voiceStream = null;
var _mediaRecorder = null;
var _voiceChunks = [];
var _voiceTimer = null;
var _voiceSeconds = 0;
var _voiceSpeechRec = null;
var _voiceSpeechText = '';
var _voiceBlob = null;
var _voiceMaxSeconds = 300; // 最长 5 分钟

function toggleVoiceMode() {
  _voiceMode = !_voiceMode;
  var input = document.getElementById('chat-input');
  var holdBtn = document.getElementById('chat-voice-hold');
  var voiceBtn = document.getElementById('chat-voice-btn');
  var emojiBtn = document.getElementById('chat-emoji-btn');
  var plusBtn = document.getElementById('chat-plus-btn');
  var sendBtn = document.getElementById('chat-send-btn');
  if (!input || !holdBtn || !voiceBtn) return;
  closePlusMenu();
  closeStickerPanel();
  if (_voiceMode) {
    input.style.display = 'none';
    holdBtn.style.display = 'flex';
    if (emojiBtn) emojiBtn.style.display = 'none';
    if (plusBtn) plusBtn.style.display = 'none';
    if (sendBtn) sendBtn.style.display = 'none';
    voiceBtn.classList.add('active');
  } else {
    if (_voiceRecording) stopRealVoiceRecord(true);
    input.style.display = '';
    holdBtn.style.display = 'none';
    holdBtn.textContent = '点击 说话';
    holdBtn.classList.remove('recording');
    if (emojiBtn) emojiBtn.style.display = '';
    if (plusBtn) plusBtn.style.display = '';
    if (sendBtn) sendBtn.style.display = (input.value && input.value.trim()) ? 'flex' : 'none';
    voiceBtn.classList.remove('active');
  }
}

/* 点击语音输入框（语音模式）：启动或结束录音 */
function onVoiceHoldClick() {
  if (_voiceRecording) {
    stopRealVoiceRecord(false);
  } else {
    startRealVoiceRecord();
  }
}

/* 开始真实录音（MediaRecorder + 麦克风，最长 5 分钟） */
function startRealVoiceRecord() {
  if (_voiceRecording) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (Core.toast) Core.toast('当前浏览器不支持录音');
    return;
  }
  var hold = document.getElementById('chat-voice-hold');
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _voiceStream = stream;
    _voiceChunks = [];
    _voiceSpeechText = '';
    _voiceSeconds = 0;
    var mimeType = '';
    if (window.MediaRecorder) {
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      for (var i = 0; i < candidates.length; i++) {
        if (MediaRecorder.isTypeSupported(candidates[i])) { mimeType = candidates[i]; break; }
      }
    }
    try {
      _mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    } catch (e) {
      _mediaRecorder = new MediaRecorder(stream);
    }
    _mediaRecorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) _voiceChunks.push(e.data);
    };
    _mediaRecorder.onstop = function() {
      var type = (_mediaRecorder && _mediaRecorder.mimeType) ? _mediaRecorder.mimeType : 'audio/webm';
      _voiceBlob = new Blob(_voiceChunks, { type: type });
      if (Core.toast) Core.toast('录音完成');
      showVoiceSendDialog();
    };
    _mediaRecorder.start(250);

    _voiceRecording = true;
    _voiceStartTime = Date.now();
    if (hold) {
      hold.classList.add('recording');
      hold.textContent = '录音中 0:00 · 点击结束';
    }
    startVoiceSpeechRec();
    _voiceTimer = setInterval(function() {
      _voiceSeconds++;
      var mm = String(Math.floor(_voiceSeconds / 60)).padStart(2, '0');
      var ss = String(_voiceSeconds % 60).padStart(2, '0');
      if (hold) hold.textContent = '录音中 ' + mm + ':' + ss + ' · 点击结束';
      if (_voiceSeconds >= _voiceMaxSeconds) {
        if (Core.toast) Core.toast('已达 5 分钟上限，自动结束录音');
        stopRealVoiceRecord(false);
      }
    }, 1000);
    if (Core.toast) Core.toast('正在录音，点击输入框结束（最长 5 分钟）');
  }).catch(function(err) {
    if (Core.toast) Core.toast('无法使用麦克风：' + (err && err.name ? err.name : '权限被拒绝'));
  });
}

/* 结束真实录音 */
function stopRealVoiceRecord(silent) {
  if (!_voiceRecording) return;
  _voiceRecording = false;
  if (_voiceTimer) { clearInterval(_voiceTimer); _voiceTimer = null; }
  stopVoiceSpeechRec();
  var hold = document.getElementById('chat-voice-hold');
  if (hold) {
    hold.classList.remove('recording');
    hold.textContent = '点击 说话';
  }
  try { if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop(); } catch (e) {}
  if (_voiceStream) {
    _voiceStream.getTracks().forEach(function(t) { t.stop(); });
    _voiceStream = null;
  }
}

/* 录音期间并行启动语音识别（用于「转文字发送」，Chrome 等支持） */
function startVoiceSpeechRec() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  try {
    _voiceSpeechRec = new SR();
    _voiceSpeechRec.lang = 'zh-CN';
    _voiceSpeechRec.continuous = true;
    _voiceSpeechRec.interimResults = false;
    _voiceSpeechRec.onresult = function(e) {
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          _voiceSpeechText += e.results[i][0].transcript;
        }
      }
    };
    _voiceSpeechRec.onerror = function() {};
    _voiceSpeechRec.start();
  } catch (e) { _voiceSpeechRec = null; }
}

function stopVoiceSpeechRec() {
  try { if (_voiceSpeechRec) _voiceSpeechRec.stop(); } catch (e) {}
  _voiceSpeechRec = null;
}

/* 录音完成弹窗：直接发送 / 转文字发送 / 取消 */
function showVoiceSendDialog() {
  closeVoiceSendDialog();
  var mm = String(Math.floor(_voiceSeconds / 60)).padStart(2, '0');
  var ss = String(_voiceSeconds % 60).padStart(2, '0');
  var html = '<div class="voice-send-overlay" id="voice-send-overlay" onclick="closeVoiceSendDialog()">'
    + '<div class="voice-send-panel" onclick="event.stopPropagation()">'
    + '<div class="voice-send-title">录音完成</div>'
    + '<div class="voice-send-dur">时长 ' + mm + ':' + ss + '，请选择发送方式</div>'
    + '<div class="voice-send-btns">'
    + '<button class="voice-send-btn send" onclick="voiceSendDirect()">直接发送</button>'
    + '<button class="voice-send-btn text" onclick="voiceSendText()">转文字发送</button>'
    + '<button class="voice-send-btn cancel" onclick="voiceSendCancel()">取消</button>'
    + '</div>'
    + '</div>'
    + '</div>';
  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstChild);
}

function closeVoiceSendDialog() {
  var ov = document.getElementById('voice-send-overlay');
  if (ov) ov.remove();
}

/* 直接发送：把录音作为真实语音消息发送 */
function voiceSendDirect() {
  closeVoiceSendDialog();
  if (!_voiceBlob) return;
  var dur = Math.max(1, Math.round(_voiceSeconds));
  var url = URL.createObjectURL(_voiceBlob);
  // 短录音（<1.5MB）转 Base64 持久化，长录音仅保留会话内 blob URL
  var audioData = '';
  var voiceText = (_voiceSpeechText || '').trim();
  if (_voiceBlob.size < 1500000) {
    var reader = new FileReader();
    reader.onloadend = function() {
      audioData = reader.result || '';
      sendVoiceMessage(dur, url, audioData, _voiceBlob.type, voiceText);
    };
    reader.readAsDataURL(_voiceBlob);
    return;
  }
  sendVoiceMessage(dur, url, audioData, _voiceBlob.type, voiceText);
}

/* 转文字发送：优先使用录音期间识别的文本，发送文本消息 */
function voiceSendText() {
  closeVoiceSendDialog();
  var text = (_voiceSpeechText || '').trim();
  if (!text) {
    if (Core.toast) Core.toast('未能识别到文字（当前浏览器可能不支持语音转文字）');
    return;
  }
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId) return;
  var messages = Storage.getMessages(chatId);
  var newMsg = { id: Date.now(), type: 'self', text: text, time: Date.now(), msgType: 'text', read: false };
  messages.push(newMsg);
  Storage.setMessages(chatId, messages);
  updateLastMsg(chatId, text);
  renderChatMessages(chatId);
  if (App && App.playSound) App.playSound('send');
  scheduleAutoReply(chatId);
  if (Core.toast) Core.toast('已转文字发送');
}

/* 取消：丢弃录音 */
function voiceSendCancel() {
  closeVoiceSendDialog();
  _voiceBlob = null;
  if (Core.toast) Core.toast('已取消发送');
}

function sendVoiceMessage(duration, audioUrl, audioData, audioMime, voiceText) {
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId) return;
  var messages = Storage.getMessages(chatId);
  var newMsg = {
    id: Date.now(),
    type: 'self',
    text: '[语音]',
    time: Date.now(),
    msgType: 'voice',
    read: false,
    duration: duration,
    audioUrl: audioUrl || '',
    audioData: audioData || '',
    audioMime: audioMime || '',
    voiceText: voiceText || ''
  };
  messages.push(newMsg);
  Storage.setMessages(chatId, messages);
  updateLastMsg(chatId, '[语音]');
  renderChatMessages(chatId);
  if (App && App.playSound) App.playSound('send');
  scheduleAutoReply(chatId);
}

/* 全局语音播放器：同一时刻只允许一条语音播放，点击播放、再次点击暂停 */
var _voicePlayer = null;

/* 播放语音消息：有真实音频则用 Audio 播放，否则按旧逻辑模拟播放 */
function playVoiceMsg(el) {
  if (!el) return;
  // 再次点击正在播放的气泡：暂停播放
  if (_voicePlayer && _voicePlayer.el === el) {
    stopVoicePlayback();
    return;
  }
  // 切换播放：先停止当前正在播放的语音
  stopVoicePlayback();
  var audioSrc = el.getAttribute('data-audio');
  if (audioSrc) {
    var audio = new Audio(audioSrc);
    el.classList.add('playing');
    _voicePlayer = { audio: audio, el: el };
    audio.onended = function() { stopVoicePlayback(); };
    audio.onerror = function() { stopVoicePlayback(); };
    audio.play().catch(function() { stopVoicePlayback(); });
    return;
  }
  // 无真实音频：模拟播放，再次点击同样可停止
  var dur = parseFloat(el.getAttribute('data-dur')) || 3;
  el.classList.add('playing');
  _voicePlayer = {
    audio: null,
    el: el,
    timer: setTimeout(function() { stopVoicePlayback(); }, dur * 1000)
  };
}

/* 停止当前语音播放并清理播放状态 */
function stopVoicePlayback() {
  if (!_voicePlayer) return;
  var p = _voicePlayer;
  _voicePlayer = null;
  if (p.audio) { try { p.audio.pause(); p.audio = null; } catch (e) {} }
  if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  if (p.el) { p.el.classList.remove('playing'); }
}

/* 语音转文字：展开/收起语音消息对应的识别文本 */
function toggleVoiceText(btn) {
  if (!btn) return;
  var box = btn.nextElementSibling;
  if (!box || !box.classList || !box.classList.contains('voice-text-box')) {
    if (Core && Core.toast) Core.toast('该语音暂无可转文字');
    return;
  }
  var hidden = box.style.display === 'none';
  box.style.display = hidden ? 'block' : 'none';
  btn.textContent = hidden ? '收起文字' : '转文字';
}

function onChatInputChange() {
  var input = document.getElementById('chat-input');
  var plusBtn = document.getElementById('chat-plus-btn');
  var sendBtn = document.getElementById('chat-send-btn');
  
  if (!input || !plusBtn || !sendBtn) return;
  
  if (input.value.trim()) {
    plusBtn.style.display = 'none';
    sendBtn.style.display = 'flex';
  } else {
    plusBtn.style.display = 'flex';
    sendBtn.style.display = 'none';
  }
}

function sendMessage() {
  var input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId) return;
  
  var text = input.value.trim();
  input.value = '';
  onChatInputChange();
  
  // 添加消息
  var messages = Storage.getMessages(chatId);
  var newMsg = { id: Date.now(), type: 'self', text: text, time: Date.now(), msgType: 'text', read: false };
  if (_pendingQuote) {
    newMsg.quote = {
      text: _pendingQuote.text,
      from: _pendingQuote.from,
      msgId: _pendingQuote.msgId || '',
      stickerData: _pendingQuote.stickerData || '',
      imageData: _pendingQuote.imageData || ''
    };
  }
  messages.push(newMsg);
  Storage.setMessages(chatId, messages);
  
  // 发送后清除引用
  cancelQuoteReply();
  
  // 更新聊天列表
  updateLastMsg(chatId, text);
  
  // 重新渲染
  renderChatMessages(chatId);
  App.playSound('send');

  // 聊天特效：发布包含关键词的消息时播放 emoji 特效
  var fx = matchChatEffect(text);
  if (fx) {
    setTimeout(function() { triggerChatEffect(fx); }, 350);
  }
  
  // 触发词：我方发送含"涂鸦"二字时，对方会发送涂鸦
  if (text.indexOf('涂鸦') !== -1) {
    setTimeout(function() { scheduleDoodleAutoReply(chatId); }, 600);
  } else if (text.indexOf('你发拍一拍') !== -1) {
    // 触发词：我方发送"你发拍一拍"时，对方会发送拍一拍
    setTimeout(function() { schedulePatAutoReply(chatId); }, 600);
  } else {
    // 自动回复（始终开启，由 pace settings 控制延迟）
    scheduleAutoReply(chatId);
  }
  
  // 关键词触发对方来电（如：打电话、打语音、打视频等）
  var callKind = _matchCallKeyword(text);
  if (callKind) {
    setTimeout(function() { _triggerIncomingCall(callKind); }, 1200 + Math.random() * 1500);
  }
}

function scheduleAutoReply(chatId) {
  // 群聊：走多成员自动回复
  if (isGroupChatId(chatId)) {
    scheduleGroupAutoReply(chatId);
    return;
  }
  var minDelay = Storage.getReplyMinDelay();  // 秒
  var maxDelay = Storage.getReplyMaxDelay();  // 秒
  var delay = (minDelay + Math.random() * Math.max(0, maxDelay - minDelay)) * 1000; // 转为毫秒
  // 下限：至少 0.5 秒
  if (delay < 500) delay = 500 + Math.random() * 1500;
  
  setTimeout(function() {
    // 对方发送前先显示"正在输入"气泡（若开启）
    if (Storage.getTypingIndicator()) {
      showTypingIndicator();
      setTimeout(function() {
        doAutoReply(chatId);
      }, 1600 + Math.random() * 2200);
    } else {
      doAutoReply(chatId);
    }
  }, delay);
}

function sendStickerMessage(stickerData) {
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId || !stickerData) return;
  
  // 压缩大表情包，避免 localStorage 超限导致消息不显示/不持久化
  compressImageData(stickerData, 240, 0.82, true).then(function(compressed) {
    _doSendSticker(chatId, compressed);
  });
}

function _doSendSticker(chatId, stickerData) {
  var messages = Storage.getMessages(chatId);
  messages.push({ id: Date.now(), type: 'self', text: '[表情]', time: Date.now(), msgType: 'sticker', read: false, stickerData: stickerData });
  Storage.setMessages(chatId, messages);
  
  updateLastMsg(chatId, '[表情]');
  renderChatMessages(chatId);
  App.playSound('send');
  closeStickerPanel();
  
  scheduleAutoReply(chatId);
}

/* 压缩图片数据（base64 dataURL），减小 localStorage 占用；失败或更小时原样返回 */
function compressImageData(data, maxSize, quality, keepAnim) {
  return new Promise(function(resolve) {
    if (!data || data.indexOf('data:') !== 0) { resolve(data); return; }
    var isGif = data.indexOf('data:image/gif') === 0;
    // GIF 动图：canvas 转 JPEG 会丢失动画且透明底变黑底，一律原样返回，不做压缩
    if (isGif) { resolve(data); return; }
    var img = new Image();
    img.onload = function() {
      try {
        var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var out = canvas.toDataURL('image/jpeg', quality);
        if (out && out.length < data.length) { resolve(out); return; }
      } catch (e) {}
      resolve(data);
    };
    img.onerror = function() { resolve(data); };
    img.src = data;
  });
}

function sendImageMessage(imageData) {
  var chatId = document.getElementById('page-chat-room').dataset.chatId;
  if (!chatId || !imageData) return;
  
  // 压缩图片，避免 localStorage 超限导致消息不显示/不持久化
  compressImageData(imageData, 480, 0.8, false).then(function(compressed) {
    _doSendImage(chatId, compressed);
  });
}

function _doSendImage(chatId, imageData) {
  var messages = Storage.getMessages(chatId);
  messages.push({ id: Date.now(), type: 'self', text: '[图片]', time: Date.now(), msgType: 'image', read: false, imageData: imageData });
  Storage.setMessages(chatId, messages);
  
  // 发送图片时清除引用
  cancelQuoteReply();
  
  updateLastMsg(chatId, '[图片]');
  renderChatMessages(chatId);
  App.playSound('send');
  
  scheduleAutoReply(chatId);
}

function updateLastMsg(chatId, text) {
  var chats = Storage.getChats();
  for (var i = 0; i < chats.length; i++) {
    if (chats[i].id === chatId) {
      chats[i].lastMsg = text;
      chats[i].lastTime = Date.now();
      Storage.setChats(chats);
      break;
    }
  }
}

// 安全渲染：仅当当前正处于该聊天室的聊天界面时才刷新消息列表，
// 避免全站主动发送/自动回复在其它界面或其它聊天室时误渲染错乱
function _safeRenderChat(chatId) {
  var room = document.getElementById('page-chat-room');
  if (!room || room.dataset.chatId === undefined) return;
  if (String(room.dataset.chatId) === String(chatId)) renderChatMessages(chatId);
}

function doAutoReply(chatId) {
  hideTypingIndicator();
  // 群聊：随机一名成员发言
  if (isGroupChatId(chatId)) {
    var g = getGroupByChatId(chatId);
    var gMembers = g ? getGroupMembers(g) : [];
    if (gMembers.length) {
      var randomMember = gMembers[Math.floor(Math.random() * gMembers.length)];
      doGroupAutoReply(chatId, randomMember);
    }
    return;
  }
  // 涂鸦自主发送：10% 概率随机发送涂鸦图案
  if (Math.random() < 0.1) {
    _sendDoodleAutoReply(chatId);
    return;
  }
  var cards = Storage.getCards();           // {id, text, source, category}[]
  var emojis = Storage.getEmojis();         // {id, char, category}[]
  var kaomojis = Storage.getKaomojis();     // {id, text, category}[]
  
  var spellCard = Storage.getSpellCardSend();
  var emojiMixing = Storage.getEmojiMixing();
  var kaomojiMixing = Storage.getKaomojiMixing();
  var stickerMixing = Storage.getStickerMixing();
  var redpacketMixing = Storage.getRedPacketMixing();

  // 自动领取对方发来的未领红包
  var claimCheckMsgs = Storage.getMessages(chatId);
  for (var ci = claimCheckMsgs.length - 1; ci >= 0; ci--) {
    var rpMsg = claimCheckMsgs[ci];
    if (rpMsg.msgType === 'redpacket' && rpMsg.type === 'self') {
      var autoSaved = RedPacketStorage.load(chatId, rpMsg.id);
      var partnerCanClaim = !rpMsg.claimed && !rpMsg.returned;
      if (!partnerCanClaim) continue;
      var claimAmt = rpMsg.totalAmount;
      rpMsg.claimed = true;
      rpMsg.amount = claimAmt;
      Storage.setMessages(chatId, claimCheckMsgs);
      var autoStored = autoSaved || {};
      autoStored.id = rpMsg.id;
      autoStored.greeting = rpMsg.greeting;
      autoStored.rpType = rpMsg.rpType;
      autoStored.totalAmount = rpMsg.totalAmount;
      autoStored.count = rpMsg.count;
      autoStored.claimed = true;
      autoStored.amount = claimAmt;
      autoStored.otherAmount = claimAmt;
      autoStored.otherClaimTime = Date.now();
      autoStored.time = rpMsg.time;
      RedPacketStorage.save(chatId, rpMsg.id, autoStored);
      _safeRenderChat(chatId);
      break;
    }
  }

  // 红包混入
  if (redpacketMixing) {
    var useRedPacket = Math.random() < 0.10;  // 10% 总概率（含特殊金额，占红包内 20%）
    if (useRedPacket) {
      _sendRedPacketAutoReply(chatId);
      return;
    }
  }

  // 先处理 stickerMixing：独立决定是否发表情包消息
  if (stickerMixing) {
    var useSticker = Math.random() < 0.4; // 40% 概率发表情包
    if (useSticker) {
      _sendStickerAutoReply(chatId);
      return;
    }
  }
  
  // 筛选主字卡（category 非"格言"即为主字卡）
  var mainCards = cards.filter(function(c) { return c.category !== '格言'; });
  
  var replyParts = [];
  
  // 基础：至少选 1 张主字卡
  if (mainCards.length > 0) {
    var baseCard = mainCards[Math.floor(Math.random() * mainCards.length)];
    replyParts.push(baseCard.text);
    
    if (spellCard && mainCards.length > 1) {
      var extraCount = 1 + Math.floor(Math.random() * 2); // 额外 1~2 张
      for (var i = 0; i < extraCount; i++) {
        var otherCard;
        var attempts = 0;
        do {
          otherCard = mainCards[Math.floor(Math.random() * mainCards.length)];
          attempts++;
        } while (otherCard.id === baseCard.id && mainCards.length > 1 && attempts < 20);
        replyParts.push(otherCard.text);
      }
    }
  }
  
  // 混入 emoji（25% 概率，在任意位置随机插入）
  if (emojiMixing && emojis.length > 0 && Math.random() < 0.25) {
    var emoji = emojis[Math.floor(Math.random() * emojis.length)];
    var pos = Math.floor(Math.random() * (replyParts.length + 1));
    replyParts.splice(pos, 0, emoji.char);
  }
  
  // 混入颜文字（20% 概率）
  if (kaomojiMixing && kaomojis.length > 0 && Math.random() < 0.20) {
    var kao = kaomojis[Math.floor(Math.random() * kaomojis.length)];
    var pos = Math.floor(Math.random() * (replyParts.length + 1));
    replyParts.splice(pos, 0, kao.text);
  }
  
  var reply = replyParts.length > 0 ? replyParts.join('') : '嗯嗯';
  
  var msgs = Storage.getMessages(chatId);
  var newMsg = { id: Date.now(), type: 'other', text: reply, time: Date.now(), msgType: 'text' };

  // 对方角色可主动引用消息：小概率引用最近一条我方文本消息
  var quoteTarget = null;
  for (var q = msgs.length - 1; q >= 0; q--) {
    if (msgs[q].type === 'self' && msgs[q].msgType === 'text' && !msgs[q].isRecall && msgs[q].text) {
      quoteTarget = msgs[q];
      break;
    }
  }
  if (quoteTarget && Math.random() < 0.18) {
    newMsg.quote = { text: quoteTarget.text, from: '我', msgId: quoteTarget.id };
  }
  msgs.push(newMsg);

  // 聊天特效：对方发送字卡内容命中关键词同样触发（复用同一套关键词→特效映射）
  var fx = matchChatEffect(reply);
  if (fx) {
    setTimeout(function() { triggerChatEffect(fx); }, 350);
  }

  // 对方角色可主动撤回：小概率在消息发出后延迟撤回（先正常显示，等一会儿再撤回）
  var willRecall = Math.random() < 0.10;
  if (willRecall) {
    var partnerName = _getCurrentPartnerName();
    var recallDelay = 2000 + Math.random() * 3000; // 2~5 秒后再撤回
    var sentMsgId = newMsg.id;
    updateLastMsg(chatId, reply);
    setTimeout(function() {
      var msgs2 = Storage.getMessages(chatId);
      for (var ri = msgs2.length - 1; ri >= 0; ri--) {
        if (String(msgs2[ri].id) === String(sentMsgId)) {
          var recallEntry = {
            id: sentMsgId,
            type: 'other',
            text: partnerName + '撤回了一条消息',
            time: Date.now(),
            msgType: 'text',
            isRecall: true,
            recallName: partnerName,
            recalledContent: _captureRecallContent(newMsg)
          };
          msgs2[ri] = recallEntry;
          updateLastMsg(chatId, recallEntry.text);
          Storage.setMessages(chatId, msgs2);
          _safeRenderChat(chatId);
          App.playSound('receive');
          break;
        }
      }
    }, recallDelay);
  } else {
    updateLastMsg(chatId, reply);
  }
  Storage.setMessages(chatId, msgs);
  
  _safeRenderChat(chatId);
  App.playSound('receive');
  showBackgroundPush(reply);
}

// 从表情包库随机选择一张表情包发送（仅用于自动回复）
function _sendStickerAutoReply(chatId) {
  StickerDB.getRandom().then(function(sticker) {
    if (sticker && sticker.data) {
      var msgs = Storage.getMessages(chatId);
      msgs.push({ id: Date.now(), type: 'other', text: '[表情]', time: Date.now(), msgType: 'sticker', stickerData: sticker.data });
      Storage.setMessages(chatId, msgs);
      updateLastMsg(chatId, '[表情]');
      _safeRenderChat(chatId);
      App.playSound('receive');
      showBackgroundPush('[表情]');
    } else {
      // 表情包库为空时降级为普通回复
      var msgs = Storage.getMessages(chatId);
      msgs.push({ id: Date.now(), type: 'other', text: '嗯嗯', time: Date.now(), msgType: 'text' });
      Storage.setMessages(chatId, msgs);
      updateLastMsg(chatId, '嗯嗯');
      _safeRenderChat(chatId);
      App.playSound('receive');
      showBackgroundPush('嗯嗯');
    }
  }).catch(function() {
    // 降级
    var msgs = Storage.getMessages(chatId);
    msgs.push({ id: Date.now(), type: 'other', text: '嗯嗯', time: Date.now(), msgType: 'text' });
    Storage.setMessages(chatId, msgs);
    updateLastMsg(chatId, '嗯嗯');
    _safeRenderChat(chatId);
    App.playSound('receive');
    showBackgroundPush('嗯嗯');
  });
}

/* 农历信息表（1900-2100），用于判断农历节日 */
var _lunarInfo = [
0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b5a0,0x195a6,
0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
0x0d520
];
function _lunarYearDays(y) { var i, sum = 348; for (i = 0x8000; i > 0x8; i >>= 1) sum += (_lunarInfo[y - 1900] & i) ? 1 : 0; return sum + _lunarLeapDays(y); }
function _lunarLeapMonth(y) { return _lunarInfo[y - 1900] & 0xf; }
function _lunarLeapDays(y) { return _lunarLeapMonth(y) ? ((_lunarInfo[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function _lunarMonthDays(y, m) { return (_lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
/* 公历转农历，返回 { month, day } */
function _solar2lunar(date) {
  var y = date.getFullYear();
  if (y < 1900 || y > 2100) return null;
  var offset = Math.floor((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(1900, 0, 31)) / 86400000);
  var temp = 0, lunarYear;
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) { temp = _lunarYearDays(lunarYear); offset -= temp; }
  if (offset < 0) { offset += temp; lunarYear--; }
  var leap = _lunarLeapMonth(lunarYear), isLeap = false, lunarMonth, lunarDay;
  for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
    if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) { --lunarMonth; isLeap = true; temp = _lunarLeapDays(lunarYear); }
    else { temp = _lunarMonthDays(lunarYear, lunarMonth); }
    if (isLeap && lunarMonth === (leap + 1)) isLeap = false;
    offset -= temp;
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) { isLeap = false; } else { isLeap = true; --lunarMonth; }
  }
  if (offset < 0) { offset += temp; --lunarMonth; }
  lunarDay = offset + 1;
  return { month: lunarMonth, day: lunarDay };
}

/* 恋爱向红包祝福语（非节日默认，古风浪漫） */
var _loveGreetings = [
  '山有木兮木有枝，心悦君兮君已知',
  '愿我如星君如月，夜夜流光相皎洁',
  '晓看天色暮看云，行也思君，坐也思君',
  '一日不见，如三秋兮，聊寄此金以慰相思',
  '玲珑骰子安红豆，入骨相思知不知',
  '此情无计可消除，才下眉头，却上心头',
  '两情若是久长时，又岂在朝朝暮暮',
  '既见君子，云胡不喜，一点心意，赠予卿卿',
  '只愿君心似我心，定不负相思意',
  '青青子衿，悠悠我心，红封薄礼，聊表深情',
  '衣带渐宽终不悔，为伊消得人憔悴',
  '金风玉露一相逢，便胜却人间无数',
  '愿我如君之影，朝朝暮暮不相离',
  '以我之名，冠你之姓，此生此世，白首不离',
  '月上柳梢头，人约黄昏后，此金为证，共赴白头',
  '你是我心内的一首歌',
  '确认过眼神，我遇上对的人',
  '我的眼里只有你',
  '我愿意为你忘记我姓名',
  '想你时你在天边，想你时你在眼前',
  '你浅浅的微笑，就像乌梅子酱',
  '甜甜的恋爱，甜甜的红包',
  '余生请多指教，红包先敬上',
  '好想好想和你在一起',
  '爱你的心，比红包更红'
];

/* 红包祝福语：节日当天用节日祝福语，其余用恋爱向祝福语（古风版，节日名称用正式称谓） */
function _pickRedPacketGreeting() {
  var now = new Date();
  var m = now.getMonth() + 1, d = now.getDate();
  var solarKey = m + '-' + d;
  var solarFestivals = {
    '1-1': ['岁序更新，万象伊始，恭贺新禧', '新年伊始，万象更新，愿你岁岁安康'],
    '2-14': ['此日情人节，愿执子之手，与子偕老', '春风十里不如你，情人节里诉衷情'],
    '3-8': ['三八妇女节，巾帼不让须眉，愿你岁岁芳华', '妇女节至，愿你如花美眷，似水流年'],
    '4-1': ['人间四月芳菲始，此心昭昭非戏言', '四月风轻，此情真切，不作戏言'],
    '5-1': ['劳动节至，辛苦你了，且收薄礼慰辛劳', '五一佳节，劳有所得，愿你欢愉'],
    '5-20': ['五二零，吾爱卿，此情天地可鉴', '五二零，心心相印，此金为聘，白首不离'],
    '6-1': ['童心未泯，愿你永如少年时', '六一佳节，愿你笑靥如花，纯真常在'],
    '10-1': ['国庆良辰，与卿同庆，山河远阔共欢喜', '盛世华诞，与君同贺，愿家国两安'],
    '12-24': ['平安夜至，愿卿岁岁平安，喜乐无忧', '平安夜，愿灯火可亲，所念之人皆安好'],
    '12-25': ['圣诞良夜，愿你喜乐安康，心想事成', '圣诞佳节，愿此红封暖你冬夜']
  };
  if (solarFestivals[solarKey]) {
    var arr = solarFestivals[solarKey];
    return arr[Math.floor(Math.random() * arr.length)];
  }
  var lunar = _solar2lunar(now);
  if (lunar) {
    var lunarKey = lunar.month + '-' + lunar.day;
    var lunarFestivals = {
      '1-1': ['新春大吉，岁岁平安', '春节良辰，恭贺新禧，岁岁安康', '元日呈祥，愿卿岁岁欢愉'],
      '1-15': ['元宵佳节，花灯如昼，人月两圆', '上元良夜，甜糯在心，愿卿如意'],
      '5-5': ['端午安康，粽叶飘香，愿君顺遂', '端午时节，艾草青青，愿你平安喜乐'],
      '7-7': ['七夕良夜，鹊桥相会，愿有情人长相守', '七夕佳期，牛郎织女亦羡我们情深'],
      '8-15': ['中秋月圆，人月两团圆', '中秋佳节，桂子飘香，愿与卿共此良宵']
    };
    if (lunarFestivals[lunarKey]) {
      var arr2 = lunarFestivals[lunarKey];
      return arr2[Math.floor(Math.random() * arr2.length)];
    }
  }
  return _loveGreetings[Math.floor(Math.random() * _loveGreetings.length)];
}

/* 对方自动发送红包 */
function _sendRedPacketAutoReply(chatId) {
  var specialAmounts = [520, 1314, 188, 666, 888];
  var useSpecial = Math.random() < (0.05 / 0.25);  // 特殊金额占红包内 20%（行为不变）；总红包率 10% 下，特殊红包占总回复约 2%
  var amount, count, rpType;

  if (useSpecial) {
    amount = specialAmounts[Math.floor(Math.random() * specialAmounts.length)];
  } else {
    // 金额无上限：1 ~ 9999 元随机
    amount = parseFloat((Math.random() * 9999 + 1).toFixed(2));
  }
  rpType = 'normal';
  count = 1;

  var greeting = _pickRedPacketGreeting();
  var msgId = Date.now();
  var msg = {
    id: msgId,
    type: 'other',
    text: '[红包]' + greeting,
    time: Date.now(),
    msgType: 'redpacket',
    greeting: greeting,
    rpType: rpType,
    totalAmount: amount,
    count: count,
    claimed: false,
    amount: 0
  };

  RedPacketStorage.save(chatId, msgId, {
    id: msgId,
    greeting: greeting,
    rpType: rpType,
    totalAmount: amount,
    count: count,
    claimed: false,
    amount: 0,
    time: msg.time
  });

  var msgs = Storage.getMessages(chatId);
  msgs.push(msg);
  Storage.setMessages(chatId, msgs);
  updateLastMsg(chatId, '[红包]' + greeting);
  _safeRenderChat(chatId);
  App.playSound('receive');
  showBackgroundPush('[红包]' + greeting);
}

