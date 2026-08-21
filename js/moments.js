/* ==== moments.js ==== */
/* ===== 疯狗龙的情书 - 发现页 · 朋友圈（对标微信朋友圈） =====
 * 数据全部经 Storage 持久化（localStorage 镜像 + IndexedDB 权威），刷新不丢失。
 * 模块风格与 mailbox.js 一致：const MomentsApp + window 绑定。
 */

const MomentsApp = {
  _feedKey: 'momentsFeed_v1',
  _friendsKey: 'momentsFriends_v1',
  _bgKey: 'momentsBg_v1',
  _visitorsKey: 'momentsVisitors_v1',

  // 发布页状态
  _publishMode: 'me',          // 'me' 我方 | 'friend' 帮朋友发
  _publishFriendId: null,      // friend 模式对应的朋友 id
  _publishText: '',
  _publishImages: [],          // dataURL 数组（最多 9 张）
  _publishQuote: null,         // 引用的主字卡 {id, text, source}

  // 交互状态
  _interactMomentId: null,     // 朋友互动当前动态
  _commentMomentId: null,      // 评论当前动态
  _commentReplyTo: '',         // 回复对象昵称（仅用于 placeholder）
  _friendCommentMomentId: null,
  _addFriendColor: '',
  _addFriendAvatarImage: '',
  _pickQuery: '',              // 字卡选择器搜索词

  /* ================ 数据读写 ================ */
  _loadFeed() {
    var data = Storage.get(this._feedKey, null);
    if (data && Array.isArray(data.feed)) return data;
    return { feed: [], nextId: 1 };
  },
  _saveFeed(data) {
    Storage.set(this._feedKey, data);
  },
  _loadFriends() {
    var list = Storage.get(this._friendsKey, null);
    return Array.isArray(list) ? list : [];
  },
  _saveFriends(list) {
    Storage.set(this._friendsKey, list);
  },
  getBackground() {
    var bg = Storage.get(this._bgKey, '');
    return (bg && typeof bg === 'string') ? bg : '';
  },
  setBackground(dataUrl) {
    Storage.set(this._bgKey, dataUrl || '');
  },

  /* 来访记录读写（momentsVisitors_v1：{id, friendId, name, avatar, color, avatarImage, time}） */
  _loadVisitors() {
    var list = Storage.get(this._visitorsKey, null);
    return Array.isArray(list) ? list : [];
  },
  _saveVisitors(list) {
    Storage.set(this._visitorsKey, list);
  },

  /* 当前主题主色（读取 theme.css CSS 变量，随 data-theme 联动；兜底为默认主题主色） */
  _themePrimary() {
    try {
      var cs = getComputedStyle(document.documentElement);
      var v = cs.getPropertyValue('--primary');
      if (v && String(v).trim()) return String(v).trim();
    } catch (e) {
      console.error('[moments] 读取主题色失败', e);
    }
    return '#B8DCF0';
  },

  /* 我方资料快照 */
  _meSnapshot() {
    var p = Storage.getMyProfile ? Storage.getMyProfile() : {};
    var nickname = (p && p.nickname) ? p.nickname : '我';
    return {
      id: 'me',
      name: nickname,
      avatar: (p && p.avatar && String(p.avatar).trim()) ? p.avatar : nickname.charAt(0),
      color: (p && p.avatarColor) || this._themePrimary(),
      avatarImage: (p && p.avatarImage) || ''
    };
  },

  _findMoment(id) {
    var data = this._loadFeed();
    for (var i = 0; i < data.feed.length; i++) {
      if (data.feed[i].id === id) return { index: i, moment: data.feed[i], data: data };
    }
    return null;
  },

  /* ================ 主页面渲染 ================ */
  renderMoments() {
    var page = document.getElementById('page-moments');
    if (!page) return;
    var me = this._meSnapshot();
    var bg = this.getBackground();
    var bgHtml = bg
      ? '<div class="moments-bg-image" style="background-image:url(\'' + bg + '\')"></div>'
      : '';
    page.innerHTML =
      '<div class="moments-page">'
      + '<div class="moments-bg-wrap' + (bg ? ' has-custom' : '') + '">'
      +   bgHtml
      +   '<div class="moments-bg-actions">'
      +     '<button class="moments-visitors-entry" onclick="MomentsApp.openMomentsVisitors()"><i class="fas fa-eye"></i>来访记录</button>'
      +     '<button class="moments-bg-btn" onclick="MomentsApp.openBgSettings()" title="设置朋友圈背景"><i class="fas fa-camera"></i></button>'
      +     '<button class="moments-bg-btn" onclick="MomentsApp.openFriendsManager()" title="朋友管理"><i class="fas fa-user-friends"></i></button>'
      +   '</div>'
      +   '<div class="moments-profile" onclick="MomentsApp.openFriendsManager()">'
      +     '<div class="moments-profile-name">' + Core.escapeHtml(me.name) + '</div>'
      +     this._avatarHtml(me, 'moments-profile-avatar')
      +   '</div>'
      + '</div>'
      + '<div class="moments-toolbar">'
      +   '<button class="moments-toolbar-btn" onclick="MomentsApp.openMomentsPublish(\'me\')"><i class="fas fa-edit"></i>发文字</button>'
      +   '<button class="moments-toolbar-btn ghost" onclick="MomentsApp.openMomentsPublish(\'me\', \'withImage\')"><i class="fas fa-camera"></i>发图片</button>'
      + '</div>'
      + '<div id="moments-feed" class="moments-feed"></div>'
      + '</div>';
    this._renderFeed();
  },

  /* 只刷新动态列表（点赞/评论/删除后调用，不重建整页） */
  _renderFeed() {
    var feedEl = document.getElementById('moments-feed');
    if (!feedEl) return;
    var data = this._loadFeed();
    var list = data.feed.slice().sort(function(a, b) { return b.time - a.time; });
    if (!list.length) {
      feedEl.innerHTML =
        '<div class="moments-empty">'
        + '<i class="fas fa-images"></i>'
        + '还没有朋友圈动态<br>点击上方「发文字」或「发图片」发布第一条吧'
        + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += this._momentCardHtml(list[i]);
    }
    feedEl.innerHTML = html;
  },

  /* 单条动态卡片 HTML */
  _momentCardHtml(m) {
    var me = this._meSnapshot();
    var likesHtml = '';
    var commentsHtml = '';
    if (m.likes && m.likes.length) {
      var chips = '';
      for (var i = 0; i < m.likes.length; i++) {
        var l = m.likes[i];
        chips += '<button class="moment-like-chip' + (l.id === 'me' ? ' me-chip' : '') + '" onclick="MomentsApp.toggleMomentLike(\'' + m.id + '\')">'
          + this._avatarHtml(l, 'chip-avatar') + '<span>' + Core.escapeHtml(l.name) + '</span></button>';
      }
      likesHtml = '<div class="moment-likes"><i class="fas fa-thumbs-up moments-likes-icon"></i>' + chips + '</div>';
    }
    if (m.comments && m.comments.length) {
      var cHtml = '';
      for (var j = 0; j < m.comments.length; j++) {
        var c = m.comments[j];
        cHtml += '<button class="moment-comment" onclick="MomentsApp.openCommentBox(\'' + m.id + '\', \'' + c.id + '\')">'
          + '<span class="c-name">' + Core.escapeHtml(c.name) + '：</span>'
          + '<span class="c-text">' + Core.escapeHtml(c.text) + '</span></button>';
      }
      commentsHtml = '<div class="moment-comments">' + cHtml + '</div>';
    }
    var meLiked = m.likes && m.likes.some(function(l) { return l.id === 'me'; });
    var quoteHtml = '';
    if (m.quote && m.quote.text) {
      quoteHtml = '<div class="moment-quote-card">'
        + '<div class="moment-quote-label"><i class="fas fa-quote-left"></i> 引用字卡' + (m.quote.source ? ' · ' + Core.escapeHtml(m.quote.source) : '') + '</div>'
        + '<div class="moment-quote-text">' + Core.escapeHtml(m.quote.text) + '</div>'
        + '</div>';
    }
    var imagesHtml = '';
    if (m.images && m.images.length) {
      var cls = 'moment-images';
      if (m.images.length === 1) cls += ' one';
      else if (m.images.length === 2) cls += ' two';
      var imgs = '';
      for (var k = 0; k < m.images.length; k++) {
        imgs += '<div class="moment-img" onclick="MomentsApp.viewMomentImage(' + k + ',\'' + m.id + '\')">'
          + '<img src="' + m.images[k] + '" alt="朋友圈图片">'
          + (m.images.length > 9 && k === 8 ? '<div class="img-count-mask">+' + (m.images.length - 9) + '</div>' : '')
          + '</div>';
      }
      imagesHtml = '<div class="' + cls + '">' + imgs + '</div>';
    }
    var deleteBtn = m.authorId === 'me'
      ? '<button class="moment-action-btn danger" onclick="MomentsApp.deleteMoment(\'' + m.id + '\')"><i class="fas fa-trash-alt"></i>删除</button>'
      : '';

    return '<div class="moment-card">'
      + '<div class="moment-card-head">'
      +   this._avatarHtml(m, 'moment-card-avatar')
      +   '<div><div class="moment-card-author">' + Core.escapeHtml(m.authorName) + '</div>'
      +   '<div class="moment-card-source">' + (m.authorId === 'me' ? '我' : '朋友') + ' · ' + Core.escapeHtml(m.source || '') + '</div></div>'
      + '</div>'
      + '<div class="moment-card-body">'
      +   (m.text ? '<div class="moment-card-text">' + Core.escapeHtml(m.text) + '</div>' : '')
      +   quoteHtml
      +   imagesHtml
      + '</div>'
      + '<div class="moment-card-actions">'
      +   '<div class="moment-card-time">' + Core.formatTime(m.time) + '</div>'
      +   '<div class="moment-action-btns">'
      +     '<button class="moment-action-btn' + (meLiked ? ' liked' : '') + '" onclick="MomentsApp.toggleMomentLike(\'' + m.id + '\')">'
      +       '<i class="fas fa-thumbs-up"></i>' + (meLiked ? '已赞' : '赞') + '</button>'
      +     '<button class="moment-action-btn" onclick="MomentsApp.openCommentBox(\'' + m.id + '\')"><i class="fas fa-comment-dots"></i>评论</button>'
      +     '<button class="moment-action-btn" onclick="MomentsApp.openFriendInteract(\'' + m.id + '\')" title="朋友互动"><i class="fas fa-user-friends"></i>朋友</button>'
      +     deleteBtn
      +   '</div>'
      + '</div>'
      + likesHtml
      + commentsHtml
      + '</div>';
  },

  /* 头像 HTML（通用：色块/首字 或 图片；任何情况下不出现问号占位） */
  _avatarHtml(person, cls) {
    var style = person.color ? 'background:' + person.color : '';
    if (person.avatarImage) {
      return '<div class="' + cls + '" style="' + style + '"><img src="' + person.avatarImage + '" alt="头像"'
        + ' data-name="' + Core.escapeHtml((person.name || '友')) + '" data-color="' + (person.color || '') + '"'
        + ' onerror="MomentsApp._avatarImgFallback(this)"></div>';
    }
    var ch = (person.avatar && String(person.avatar).trim())
      ? String(person.avatar).charAt(0)
      : ((person.name && String(person.name).trim()) ? String(person.name).charAt(0) : '友');
    return '<div class="' + cls + '" style="' + style + '">' + Core.escapeHtml(ch) + '</div>';
  },

  /* 头像图片加载失败兜底：隐藏图片，改显昵称首字（绝不显示破图/问号） */
  _avatarImgFallback(img) {
    try {
      var box = img.parentNode;
      if (!box) return;
      var name = img.getAttribute('data-name') || '友';
      var color = img.getAttribute('data-color') || '';
      box.style.background = color;
      box.innerHTML = Core.escapeHtml(String(name).charAt(0) || '友');
    } catch (e) {
      console.error('[moments] 头像图片加载失败兜底异常', e);
    }
  },

  /* ================ 发布页 ================ */
  openMomentsPublish(mode, extra) {
    if (extra === 'withImage') {
      // 发图片模式：进入发布页后自动弹出图片选择器
      this._autoPickImage = true;
    }
    this._publishMode = mode === 'friend' ? 'friend' : 'me';
    this._publishFriendId = mode === 'friend' ? extra : null;
    this._publishText = '';
    this._publishImages = [];
    this._publishQuote = null;
    Navigation.navigateTo('moments-publish');
    this.renderPublish();
    var self = this;
    if (this._autoPickImage) {
      this._autoPickImage = false;
      setTimeout(function() {
        try {
          var input = document.getElementById('moments-pub-file-input');
          if (input) input.click();
        } catch (e) { console.error('[moments] 自动唤起图片选择失败', e); }
      }, 250);
    }
  },

  renderPublish() {
    var page = document.getElementById('page-moments-publish');
    if (!page) return;
    var isFriend = this._publishMode === 'friend';
    var friend = null;
    if (isFriend) {
      var friends = this._loadFriends();
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].id === this._publishFriendId) { friend = friends[i]; break; }
      }
    }
    var title = isFriend ? '帮 ' + (friend ? friend.nickname : '朋友') + ' 发朋友圈' : '发表朋友圈';
    var tip = isFriend
      ? '当前为「' + (friend ? friend.nickname : '朋友') + '」发送，可引用主字卡内容（引用部分最多 3 句）'
      : '可发纯文字或图片，支持从字卡界面引用主字卡内容（引用部分最多 3 句）';
    var quoteHtml = '';
    if (this._publishQuote && this._publishQuote.text) {
      quoteHtml = '<div class="moments-pub-quote">'
        + '<div class="q-text">' + Core.escapeHtml(this._publishQuote.text) + '</div>'
        + '<button class="q-remove" onclick="MomentsApp.clearPublishQuote()"><i class="fas fa-times"></i></button>'
        + '</div>';
    }
    var imgsHtml = '';
    if (this._publishImages.length) {
      var cells = '';
      for (var k = 0; k < this._publishImages.length; k++) {
        cells += '<div class="moments-pub-img"><img src="' + this._publishImages[k] + '" alt="图片">'
          + '<button class="remove" onclick="MomentsApp.removePublishImage(' + k + ')"><i class="fas fa-times"></i></button></div>';
      }
      if (this._publishImages.length < 9) {
        cells += '<div class="moments-pub-add" onclick="MomentsApp.pickPublishImages()"><i class="fas fa-plus"></i>添加</div>';
      }
      imgsHtml = '<div class="moments-publish-images">' + cells + '</div>';
    } else {
      imgsHtml = '<div class="moments-publish-images">'
        + '<div class="moments-pub-add" onclick="MomentsApp.pickPublishImages()"><i class="fas fa-plus"></i>添加图片</div>'
        + '</div>';
    }
    page.innerHTML =
      '<div class="moments-publish-page">'
      + '<div class="top-nav">'
      +   '<div class="back-btn" onclick="Navigation.goBack()"><i class="fas fa-chevron-left"></i></div>'
      +   '<div class="nav-title">' + Core.escapeHtml(title) + '</div>'
      +   '<div class="nav-right" style="display:flex;align-items:center">'
      +     '<button class="moments-toolbar-btn" style="padding:6px 16px" onclick="MomentsApp.submitMomentsPublish()">发表</button>'
      +   '</div>'
      + '</div>'
      + '<div class="moments-publish-tip">' + Core.escapeHtml(tip) + '</div>'
      + '<textarea class="moments-publish-input" id="moments-publish-text" maxlength="2000" placeholder="这一刻的想法…"></textarea>'
      + '<div class="moments-publish-section">'
      +   '<div class="moments-publish-section-title">图片（最多 9 张）</div>'
      +   imgsHtml
      + '</div>'
      + '<div class="moments-publish-section">'
      +   '<div class="moments-publish-section-title">引用字卡</div>'
      +   (quoteHtml || '<button class="moments-pub-action-btn" onclick="MomentsApp.pickQuoteCard()"><i class="fas fa-book-open"></i>从字卡界面选择主字卡</button>')
      + '</div>'
      + '<div class="moments-publish-bar">'
      +   '<button class="bar-btn secondary" onclick="MomentsApp.pickPublishImages()"><i class="fas fa-camera"></i> 图片</button>'
      +   '<button class="bar-btn secondary" onclick="MomentsApp.pickQuoteCard()"><i class="fas fa-book-open"></i> 字卡</button>'
      +   '<button class="bar-btn" onclick="MomentsApp.submitMomentsPublish()">发表</button>'
      + '</div>'
      + '<input type="file" id="moments-pub-file-input" accept="image/*" multiple style="display:none" onchange="MomentsApp.addPublishImages(this)">'
      + '</div>';
    var ta = document.getElementById('moments-publish-text');
    if (ta) {
      ta.value = this._publishText;
      var self = this;
      ta.addEventListener('input', function() {
        try { self._publishText = ta.value; } catch (e) { console.error('[moments] 同步正文失败', e); }
      });
    }
  },

  /* 选择图片（唤起文件选择） */
  pickPublishImages() {
    var input = document.getElementById('moments-pub-file-input');
    if (input) input.click();
  },

  /* 图片文件 → 压缩 dataURL → 加入待发布列表 */
  addPublishImages(input) {
    var files = input && input.files ? input.files : [];
    var self = this;
    var remain = 9 - this._publishImages.length;
    if (files.length > remain) {
      Core.toast('最多 9 张图片');
      remain = Math.max(0, remain);
    }
    var pending = Array.prototype.slice.call(files).slice(0, remain);
    if (!pending.length) { if (input) input.value = ''; return; }
    var done = 0;
    pending.forEach(function(file) {
      if (!/^image\//.test(file.type)) { done++; if (done === pending.length && input) input.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          self._compressDataUrl(e.target.result, 800, 0.72, function(compressed) {
            if (self._publishImages.length < 9) {
              self._publishImages.push(compressed);
            }
            done++;
            if (done === pending.length) {
              if (input) input.value = '';
              self.renderPublish();
            }
          });
        } catch (err) {
          console.error('[moments] 压缩图片失败', err);
          Core.toast('部分图片处理失败');
          done++;
          if (done === pending.length && input) input.value = '';
        }
      };
      reader.onerror = function() {
        console.error('[moments] 读取图片失败');
        done++;
        if (done === pending.length && input) input.value = '';
      };
      reader.readAsDataURL(file);
    });
  },

  removePublishImage(index) {
    if (index >= 0 && index < this._publishImages.length) {
      this._publishImages.splice(index, 1);
      this.renderPublish();
    }
  },

  /* 选择引用字卡 */
  pickQuoteCard() {
    var cards = this._getMainCards();
    if (!cards.length) { Core.toast('字卡中暂无可引用的主字卡'); return; }
    this._pickQuery = '';
    this._showPanel(this._cardPickerHtml(cards));
  },

  _getMainCards() {
    var cards = [];
    try {
      var raw = Storage.getCards ? Storage.getCards() : [];
      for (var i = 0; i < raw.length; i++) {
        var c = raw[i];
        if (c && c.text && String(c.text).trim() && (!c.category || c.category !== '格言')) {
          cards.push(c);
        }
      }
    } catch (e) {
      console.error('[moments] 读取字卡失败', e);
    }
    return cards;
  },

  _cardPickerHtml(cards) {
    var q = (this._pickQuery || '').trim();
    var list = cards;
    if (q) {
      list = cards.filter(function(c) {
        var t = (c.text || '') + ' ' + (c.category || '') + ' ' + (c.source || '');
        return t.indexOf(q) !== -1;
      });
    }
    var items = '';
    if (list.length) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        items += '<button class="moments-card-picker-item" onclick="MomentsApp.chooseQuoteCard(\'' + c.id + '\')">'
          + '<span class="cp-cat">' + Core.escapeHtml(c.category || '字卡') + '</span>'
          + '<span class="cp-text">' + Core.escapeHtml(String(c.text).trim()) + '</span>'
          + '</button>';
      }
    } else {
      items = '<div class="moments-friend-empty">没有匹配的字卡</div>';
    }
    return '<div class="moments-panel">'
      + '<div class="moments-panel-title">从字卡界面选择主字卡</div>'
      + '<input type="text" class="moments-card-picker-search" id="moments-pick-search" placeholder="搜索字卡内容…" value="' + Core.escapeHtml(this._pickQuery) + '" oninput="MomentsApp.filterPickerCards(this)">'
      + '<div class="moments-card-picker-list">' + items + '</div>'
      + '</div>';
  },

  filterPickerCards(input) {
    this._pickQuery = input ? input.value : '';
    var cards = this._getMainCards();
    var panel = document.querySelector('.moments-overlay .moments-panel');
    if (panel) {
      panel.outerHTML = '<div class="moments-panel-holder"></div>';
      this._showPanel(this._cardPickerHtml(cards));
    }
  },

  chooseQuoteCard(cardId) {
    var cards = this._getMainCards();
    var card = null;
    for (var i = 0; i < cards.length; i++) {
      if (String(cards[i].id) === String(cardId)) { card = cards[i]; break; }
    }
    if (!card) { Core.toast('未找到该字卡'); return; }
    var text = String(card.text || '').trim();
    var truncated = this._truncateQuote(text);
    this._publishQuote = { id: card.id, text: truncated, source: (card.source || '') + (truncated !== text ? '（已截取前 3 句）' : '') };
    this._closeOverlay();
    Core.toast(truncated !== text ? '已引用，内容超过 3 句已自动截取' : '已引用该字卡');
    this.renderPublish();
  },

  clearPublishQuote() {
    this._publishQuote = null;
    this.renderPublish();
  },

  /* 截取主字卡内容为最多 3 句（按句末标点切句，保留标点） */
  _truncateQuote(text) {
    if (!text) return '';
    var parts = text.match(/[^。！？!?；;]+[。！？!?；;]*/g) || [];
    var out = [];
    for (var i = 0; i < parts.length && out.length < 3; i++) {
      var p = parts[i].trim();
      if (p) out.push(p);
    }
    return out.join('');
  },

  /* 发布（我方 / 朋友） */
  submitMomentsPublish() {
    var ta = document.getElementById('moments-publish-text');
    var text = ta ? ta.value : this._publishText;
    text = (text || '').trim();
    if (!text && !this._publishImages.length && !this._publishQuote) {
      Core.toast('写点什么吧（文字、图片或引用字卡至少一项）');
      return;
    }
    if (this._publishImages.length > 9) {
      Core.toast('最多只能发 9 张图片');
      return;
    }
    var data = this._loadFeed();
    var isFriend = this._publishMode === 'friend';
    var author = this._meSnapshot();
    var source = '朋友圈';
    if (isFriend) {
      var friends = this._loadFriends();
      var friend = null;
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].id === this._publishFriendId) { friend = friends[i]; break; }
      }
      if (!friend) { Core.toast('该朋友不存在，请先添加朋友'); return; }
      author = {
        id: friend.id,
        name: friend.nickname || '朋友',
        avatar: (friend.avatar && String(friend.avatar).trim()) ? friend.avatar : (((friend.nickname && friend.nickname.charAt(0)) || '友')),
        color: friend.avatarColor || this._themePrimary(),
        avatarImage: friend.avatarImage || ''
      };
      source = '朋友圈 · 来自 ' + (this._publishQuote ? '字卡' : '朋友');
    }
    var moment = {
      id: 'm' + (data.nextId || 1),
      authorId: author.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      authorColor: author.color,
      authorAvatarImage: author.avatarImage,
      source: source,
      text: text,
      images: this._publishImages.slice(),
      quote: this._publishQuote ? { id: this._publishQuote.id, text: this._publishQuote.text, source: this._publishQuote.source } : null,
      time: Date.now(),
      likes: [],
      comments: []
    };
    data.feed.push(moment);
    data.nextId = (data.nextId || 1) + 1;
    try {
      this._saveFeed(data);
    } catch (e) {
      console.error('[moments] 保存动态失败', e);
      Core.toast('保存失败，请重试');
      return;
    }
    // 重置发布状态
    this._publishMode = 'me';
    this._publishFriendId = null;
    this._publishText = '';
    this._publishImages = [];
    this._publishQuote = null;
    Core.toast(isFriend ? '已帮朋友发布朋友圈' : '发布成功');
    Navigation.goBack();
  },

  /* ================ 点赞 / 评论 / 删除 ================ */
  toggleMomentLike(momentId) {
    var hit = this._findMoment(momentId);
    if (!hit) return;
    var me = this._meSnapshot();
    var idx = -1;
    for (var i = 0; i < hit.moment.likes.length; i++) {
      if (hit.moment.likes[i].id === 'me') { idx = i; break; }
    }
    if (idx >= 0) {
      hit.moment.likes.splice(idx, 1);
      Core.toast('已取消赞');
    } else {
      hit.moment.likes.push(me);
      Core.toast('点赞成功');
    }
    this._saveFeed(hit.data);
    this._renderFeed();
  },

  openCommentBox(momentId, replyCommentId) {
    var hit = this._findMoment(momentId);
    if (!hit) return;
    this._commentMomentId = momentId;
    this._commentReplyTo = '';
    if (replyCommentId) {
      for (var i = 0; i < hit.moment.comments.length; i++) {
        if (hit.moment.comments[i].id === replyCommentId) {
          this._commentReplyTo = hit.moment.comments[i].name;
          break;
        }
      }
    }
    var placeholder = this._commentReplyTo ? '回复 ' + this._commentReplyTo + '：' : '评论：';
    this._showSheet(
      '<div class="moments-panel-title">发表评论</div>'
      + '<div class="moments-comment-box">'
      +   '<input type="text" id="moments-comment-input" maxlength="200" placeholder="' + Core.escapeHtml(placeholder) + '" autocomplete="off">'
      +   '<button onclick="MomentsApp.submitMomentComment()">发送</button>'
      + '</div>'
    );
    var self = this;
    setTimeout(function() {
      try {
        var inp = document.getElementById('moments-comment-input');
        if (inp) inp.focus();
      } catch (e) { console.error('[moments] 评论框聚焦失败', e); }
    }, 120);
  },

  submitMomentComment() {
    var inp = document.getElementById('moments-comment-input');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) { Core.toast('评论内容不能为空'); return; }
    var hit = this._findMoment(this._commentMomentId);
    if (!hit) { this._closeOverlay(); return; }
    var me = this._meSnapshot();
    hit.moment.comments.push({
      id: 'c' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      authorId: me.id,
      name: me.name,
      avatar: me.avatar,
      color: me.color,
      avatarImage: me.avatarImage,
      text: text,
      time: Date.now()
    });
    this._saveFeed(hit.data);
    this._closeOverlay();
    Core.toast('评论成功');
    this._renderFeed();
  },

  deleteMoment(momentId) {
    var hit = this._findMoment(momentId);
    if (!hit) return;
    if (hit.moment.authorId !== 'me') { Core.toast('只能删除自己发布的朋友圈'); return; }
    var self = this;
    Core.confirm('删除这条朋友圈？', '删除后将无法恢复', function() {
      var data = self._loadFeed();
      var idx = -1;
      for (var i = 0; i < data.feed.length; i++) {
        if (data.feed[i].id === momentId) { idx = i; break; }
      }
      if (idx >= 0) {
        data.feed.splice(idx, 1);
        self._saveFeed(data);
        Core.toast('已删除');
        self._renderFeed();
      }
    });
  },

  /* ================ 朋友互动（模拟朋友视角） ================ */
  openFriendInteract(momentId) {
    var friends = this._loadFriends();
    if (!friends.length) { Core.toast('暂无朋友，请先添加朋友'); return; }
    this._interactMomentId = momentId;
    var rows = '';
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i];
      rows += '<button class="moments-friend-row" onclick="MomentsApp.selectInteractFriend(\'' + f.id + '\')">'
        + this._avatarHtml({ id: f.id, name: f.nickname, avatar: f.avatar, color: f.avatarColor, avatarImage: f.avatarImage }, 'mf-avatar')
        + '<span class="mf-name">' + Core.escapeHtml(f.nickname) + '</span>'
        + '<span class="mf-status"><i class="fas fa-chevron-right"></i></span>'
        + '</button>';
    }
    this._showSheet(
      '<div class="moments-panel-title">选择朋友（模拟朋友操作）</div>'
      + '<div class="moments-friend-list">' + rows + '</div>'
    );
  },

  selectInteractFriend(friendId) {
    var hit = this._findMoment(this._interactMomentId);
    if (!hit) return;
    var friends = this._loadFriends();
    var f = null;
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].id === friendId) { f = friends[i]; break; }
    }
    if (!f) { Core.toast('朋友不存在'); return; }
    var liked = hit.moment.likes.some(function(l) { return l.id === friendId; });
    this._showPanel(
      '<div class="moments-panel-title">' + Core.escapeHtml(f.nickname) + ' 的操作</div>'
      + '<div class="moments-option-list">'
      +   '<button class="moments-option" onclick="MomentsApp.friendLikeToggle(\'' + friendId + '\')">'
      +     '<i class="fas fa-thumbs-up"></i>' + (liked ? '取消赞' : '点赞') + '</button>'
      +   '<button class="moments-option" onclick="MomentsApp.openFriendCommentBox(\'' + friendId + '\')">'
      +     '<i class="fas fa-comment-dots"></i>写评论</button>'
      +   '<button class="moments-option" onclick="MomentsApp.friendViewMoments(\'' + friendId + '\')">'
      +     '<i class="fas fa-eye"></i>查看我的朋友圈</button>'
      +   '<button class="moments-option" onclick="MomentsApp.closeMomentsOverlay()"><i class="fas fa-arrow-left"></i>返回</button>'
      + '</div>'
    );
  },

  friendLikeToggle(friendId) {
    var hit = this._findMoment(this._interactMomentId);
    if (!hit) { this._closeOverlay(); return; }
    var friends = this._loadFriends();
    var f = null;
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].id === friendId) { f = friends[i]; break; }
    }
    if (!f) { Core.toast('朋友不存在'); return; }
    var idx = -1;
    for (var j = 0; j < hit.moment.likes.length; j++) {
      if (hit.moment.likes[j].id === friendId) { idx = j; break; }
    }
    if (idx >= 0) {
      hit.moment.likes.splice(idx, 1);
      Core.toast(f.nickname + ' 已取消赞');
    } else {
      hit.moment.likes.push({ id: f.id, name: f.nickname, avatar: f.avatar, color: f.avatarColor, avatarImage: f.avatarImage });
      Core.toast(f.nickname + ' 点赞成功');
    }
    this._saveFeed(hit.data);
    this._closeOverlay();
    this._renderFeed();
  },

  openFriendCommentBox(friendId) {
    var hit = this._findMoment(this._interactMomentId);
    if (!hit) { this._closeOverlay(); return; }
    var friends = this._loadFriends();
    var f = null;
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].id === friendId) { f = friends[i]; break; }
    }
    if (!f) { Core.toast('朋友不存在'); return; }
    this._friendCommentMomentId = this._interactMomentId;
    this._friendCommentId = friendId;
    this._showSheet(
      '<div class="moments-panel-title">' + Core.escapeHtml(f.nickname) + ' 发表评论</div>'
      + '<div class="moments-comment-box">'
      +   '<input type="text" id="moments-comment-input" maxlength="200" placeholder="输入评论内容…" autocomplete="off">'
      +   '<button onclick="MomentsApp.submitFriendComment()">发送</button>'
      + '</div>'
    );
    var self = this;
    setTimeout(function() {
      try {
        var inp = document.getElementById('moments-comment-input');
        if (inp) inp.focus();
      } catch (e) { console.error('[moments] 朋友评论框聚焦失败', e); }
    }, 120);
  },

  submitFriendComment() {
    var inp = document.getElementById('moments-comment-input');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) { Core.toast('评论内容不能为空'); return; }
    var hit = this._findMoment(this._friendCommentMomentId);
    if (!hit) { this._closeOverlay(); return; }
    var friends = this._loadFriends();
    var f = null;
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].id === this._friendCommentId) { f = friends[i]; break; }
    }
    if (!f) { Core.toast('朋友不存在'); return; }
    hit.moment.comments.push({
      id: 'c' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      authorId: f.id,
      name: f.nickname,
      avatar: f.avatar,
      color: f.avatarColor,
      avatarImage: f.avatarImage,
      text: text,
      time: Date.now()
    });
    this._saveFeed(hit.data);
    this._closeOverlay();
    Core.toast(f.nickname + ' 评论成功');
    this._renderFeed();
  },

  /* ================ 图片查看 ================ */
  viewMomentImage(index, momentId) {
    var hit = this._findMoment(momentId);
    if (!hit || !hit.moment.images || !hit.moment.images[index]) return;
    var src = hit.moment.images[index];
    var ov = document.createElement('div');
    ov.className = 'moments-viewer';
    ov.id = 'moments-viewer';
    ov.innerHTML = '<img src="' + src + '" alt="图片">'
      + '<button class="moments-viewer-close" onclick="MomentsApp.closeMomentsViewer()"><i class="fas fa-times"></i></button>';
    document.body.appendChild(ov);
  },

  closeMomentsViewer() {
    var v = document.getElementById('moments-viewer');
    if (v) v.parentNode.removeChild(v);
  },

  /* ================ 背景设置 ================ */
  openBgSettings() {
    var hasCustom = !!this.getBackground();
    this._showPanel(
      '<div class="moments-panel-title">朋友圈封面背景</div>'
      + '<div class="moments-option-list">'
      +   '<button class="moments-option" onclick="MomentsApp.setMomentsBgDefault()"><i class="fas fa-image"></i>使用默认背景</button>'
      +   '<button class="moments-option" onclick="MomentsApp.pickMomentsBg()"><i class="fas fa-folder-open"></i>从本地选择图片</button>'
      +   (hasCustom ? '<button class="moments-option danger" onclick="MomentsApp.clearMomentsBg()"><i class="fas fa-eraser"></i>恢复默认（清除自定义）</button>' : '')
      + '</div>'
      + '<input type="file" id="moments-bg-file-input" accept="image/*" style="display:none" onchange="MomentsApp.applyMomentsBg(this)">'
    );
  },

  setMomentsBgDefault() {
    this.setBackground('');
    this._closeOverlay();
    Core.toast('已恢复默认背景');
    this.renderMoments();
  },

  pickMomentsBg() {
    var input = document.getElementById('moments-bg-file-input');
    if (input) input.click();
  },

  applyMomentsBg(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { Core.toast('请选择图片文件'); return; }
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        self._compressDataUrl(e.target.result, 1200, 0.75, function(compressed) {
          self.setBackground(compressed);
          self._closeOverlay();
          Core.toast('背景设置成功');
          self.renderMoments();
        });
      } catch (err) {
        console.error('[moments] 背景图片处理失败', err);
        Core.toast('背景设置失败，请重试');
      }
      if (input) input.value = '';
    };
    reader.onerror = function() {
      console.error('[moments] 读取背景图片失败');
      Core.toast('背景图片读取失败');
      if (input) input.value = '';
    };
    reader.readAsDataURL(file);
  },

  clearMomentsBg() {
    this.setBackground('');
    this._closeOverlay();
    Core.toast('已清除自定义背景');
    this.renderMoments();
  },

  /* ================ 朋友管理 ================ */
  openFriendsManager() {
    Navigation.navigateTo('moments-friends');
  },

  renderMomentsFriends() {
    var page = document.getElementById('page-moments-friends');
    if (!page) return;
    var friends = this._loadFriends();
    var rows = '';
    if (friends.length) {
      for (var i = 0; i < friends.length; i++) {
        var f = friends[i];
        rows += '<div class="moments-friend-item">'
          + this._avatarHtml({ id: f.id, name: f.nickname, avatar: f.avatar, color: f.avatarColor, avatarImage: f.avatarImage }, 'mf-item-avatar')
          + '<div class="mf-item-info">'
          +   '<div class="mf-item-name">' + Core.escapeHtml(f.nickname) + '</div>'
          +   '<div class="mf-item-desc">朋友圈朋友 · 可点赞评论</div>'
          + '</div>'
          + '<button class="mf-item-del" onclick="MomentsApp.deleteFriend(\'' + f.id + '\')" title="删除朋友"><i class="fas fa-trash-alt"></i></button>'
          + '</div>';
      }
    } else {
      rows = '<div class="moments-empty"><i class="fas fa-user-friends"></i>暂无朋友<br>点击右上角「添加」设置朋友（仅用于朋友圈点赞评论）</div>';
    }
    page.innerHTML =
      '<div class="moments-friends-page">'
      + '<div class="top-nav">'
      +   '<div class="back-btn" onclick="Navigation.goBack()"><i class="fas fa-chevron-left"></i></div>'
      +   '<div class="nav-title">朋友圈朋友管理</div>'
      +   '<div class="nav-right" style="display:flex;align-items:center">'
      +     '<button class="moments-toolbar-btn" style="padding:6px 14px" onclick="MomentsApp.openAddFriend()"><i class="fas fa-plus"></i>添加</button>'
      +   '</div>'
      + '</div>'
      + '<div class="moments-publish-tip">朋友仅用于互动（点赞 / 评论），不影响其他模块</div>'
      + '<div class="moments-friends-list">' + rows + '</div>'
      + '</div>';
  },

  openAddFriend() {
    this._addFriendColor = this._themePrimary();
    this._addFriendAvatarImage = '';
    this._showPanel(
      '<div class="moments-panel-title">添加朋友</div>'
      + '<div class="moments-form-row">'
      +   '<div class="moments-form-label">昵称</div>'
      +   '<input type="text" class="moments-form-input" id="moments-add-name" maxlength="12" placeholder="朋友昵称" autocomplete="off">'
      + '</div>'
      + '<div class="moments-form-row">'
      +   '<div class="moments-form-label">头像</div>'
      +   '<div style="display:flex;align-items:center;gap:8px">'
      +     '<div class="moments-avatar-preview" id="moments-add-avatar-preview" style="background:' + this._addFriendColor + '">'
      +       (this._addFriendAvatarImage ? '<img src="' + this._addFriendAvatarImage + '" alt="头像">' : '友')
      +     '</div>'
      +     '<div style="display:flex;flex-direction:column;gap:6px">'
      +       '<button class="moments-upload-btn" onclick="MomentsApp.pickFriendAvatar()"><i class="fas fa-upload"></i>上传图片</button>'
      +       '<input type="file" id="moments-add-avatar-input" accept="image/*" style="display:none" onchange="MomentsApp.applyFriendAvatar(this)">'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="moments-form-row">'
      +   '<div class="moments-form-label">头像颜色</div>'
      +   '<div class="moments-color-row" id="moments-add-colors">' + this._colorSwatchesHtml() + '</div>'
      + '</div>'
      + '<div class="moments-option-list">'
      +   '<button class="moments-option" onclick="MomentsApp.submitAddFriend()"><i class="fas fa-check"></i>确认添加</button>'
      + '</div>'
    );
  },

  _colorSwatchesHtml() {
    var colors = [this._themePrimary(), '#F2B6C1', '#C8A2E0', '#A5D6A7', '#FFD8A8', '#B3C7E6', '#E0A8B0', '#A8D8C8'];
    var html = '';
    for (var i = 0; i < colors.length; i++) {
      html += '<div class="moments-color-swatch' + (colors[i] === this._addFriendColor ? ' selected' : '') + '" style="background:' + colors[i] + '" onclick="MomentsApp.selectFriendColor(\'' + colors[i] + '\')"></div>';
    }
    return html;
  },

  selectFriendColor(color) {
    this._addFriendColor = color;
    var preview = document.getElementById('moments-add-avatar-preview');
    if (preview) preview.style.background = color;
    var swatches = document.querySelectorAll('.moments-color-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var c = swatches[i].getAttribute('style') || '';
      swatches[i].classList.toggle('selected', c.indexOf(color) !== -1);
    }
  },

  pickFriendAvatar() {
    var input = document.getElementById('moments-add-avatar-input');
    if (input) input.click();
  },

  applyFriendAvatar(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { Core.toast('请选择图片文件'); return; }
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        self._compressDataUrl(e.target.result, 240, 0.8, function(compressed) {
          self._addFriendAvatarImage = compressed;
          var preview = document.getElementById('moments-add-avatar-preview');
          if (preview) preview.innerHTML = '<img src="' + compressed + '" alt="头像">';
        });
      } catch (err) {
        console.error('[moments] 朋友头像处理失败', err);
        Core.toast('头像处理失败');
      }
      if (input) input.value = '';
    };
    reader.onerror = function() {
      console.error('[moments] 朋友头像读取失败');
      if (input) input.value = '';
    };
    reader.readAsDataURL(file);
  },

  submitAddFriend() {
    var nameInput = document.getElementById('moments-add-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!name) { Core.toast('请输入朋友昵称'); return; }
    var friends = this._loadFriends();
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].nickname === name) { Core.toast('已存在同名朋友'); return; }
    }
    friends.push({
      id: 'friend_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      nickname: name,
      avatar: name.charAt(0),
      avatarColor: this._addFriendColor,
      avatarImage: this._addFriendAvatarImage
    });
    this._saveFriends(friends);
    this._closeOverlay();
    Core.toast('添加成功');
    this.renderMomentsFriends();
  },

  deleteFriend(friendId) {
    var self = this;
    Core.confirm('删除该朋友？', '删除后该朋友不再参与点赞评论（其历史动态仍会保留）', function() {
      var friends = self._loadFriends();
      var idx = -1;
      for (var i = 0; i < friends.length; i++) {
        if (friends[i].id === friendId) { idx = i; break; }
      }
      if (idx >= 0) {
        friends.splice(idx, 1);
        self._saveFriends(friends);
        Core.toast('已删除朋友');
        self.renderMomentsFriends();
      }
    });
  },

  /* ================ 来访记录 ================ */
  openMomentsVisitors() {
    Navigation.navigateTo('moments-visitors');
  },

  renderMomentsVisitors() {
    var page = document.getElementById('page-moments-visitors');
    if (!page) return;
    var list = this._loadVisitors().slice().sort(function(a, b) { return b.time - a.time; });
    var rows = '';
    if (list.length) {
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        var vName = v.name || v.nickname || '朋友';
        rows += '<div class="moments-visitor-item">'
          + this._avatarHtml({ id: v.friendId || v.id, name: vName, avatar: v.avatar, color: v.color, avatarImage: v.avatarImage }, 'mv-avatar')
          + '<div class="mv-info">'
          +   '<div class="mv-name">' + Core.escapeHtml(vName) + '</div>'
          +   '<div class="mv-time"><i class="fas fa-clock"></i> ' + Core.formatTime(v.time) + '</div>'
          + '</div>'
          + '<i class="fas fa-eye mv-eye"></i>'
          + '</div>';
      }
    } else {
      rows = '<div class="moments-empty"><i class="fas fa-eye"></i>还没有人来访<br>在动态的「朋友」互动中选择「查看我的朋友圈」模拟来访</div>';
    }
    page.innerHTML =
      '<div class="moments-visitors-page">'
      + '<div class="top-nav">'
      +   '<div class="back-btn" onclick="Navigation.goBack()"><i class="fas fa-chevron-left"></i></div>'
      +   '<div class="nav-title">来访记录</div>'
      +   '<div class="nav-right" style="display:flex;align-items:center">'
      +     (list.length ? '<button class="moments-toolbar-btn" style="padding:6px 14px" onclick="MomentsApp.clearVisitors()"><i class="fas fa-eraser"></i>清空</button>' : '')
      +   '</div>'
      + '</div>'
      + '<div class="moments-publish-tip">朋友查看你的朋友圈时会留下记录（本人浏览不记录）</div>'
      + '<div class="moments-visitors-list">' + rows + '</div>'
      + '</div>';
  },

  clearVisitors() {
    var self = this;
    Core.confirm('清空全部来访记录？', '清空后不可恢复', function() {
      self._saveVisitors([]);
      Core.toast('已清空来访记录');
      self.renderMomentsVisitors();
    });
  },

  /* 朋友主动查看我方朋友圈：写入访客记录 + 展示朋友视角（只读） */
  friendViewMoments(friendId) {
    var friends = this._loadFriends();
    var f = null;
    for (var i = 0; i < friends.length; i++) {
      if (friends[i].id === friendId) { f = friends[i]; break; }
    }
    if (!f) { Core.toast('朋友不存在'); return; }
    var visitors = this._loadVisitors();
    visitors.push({
      id: 'v_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      friendId: f.id,
      name: f.nickname || '朋友',
      avatar: (f.avatar && String(f.avatar).trim()) ? f.avatar : (((f.nickname && f.nickname.charAt(0)) || '友')),
      color: f.avatarColor || this._themePrimary(),
      avatarImage: f.avatarImage || '',
      time: Date.now()
    });
    this._saveVisitors(visitors);
    var data = this._loadFeed();
    var mine = [];
    for (var j = 0; j < data.feed.length; j++) {
      if (data.feed[j].authorId === 'me') mine.push(data.feed[j]);
    }
    var body = '';
    if (mine.length) {
      for (var k = 0; k < mine.length; k++) {
        body += this._visitorCardHtml(mine[k]);
      }
    } else {
      body = '<div class="moments-empty"><i class="fas fa-images"></i>你还没有发布朋友圈</div>';
    }
    this._showPanel(
      '<div class="moments-panel-title">' + Core.escapeHtml(f.nickname || '朋友') + ' 正在查看你的朋友圈</div>'
      + '<div class="moments-visitor-feed">' + body + '</div>'
    );
    Core.toast((f.nickname || '朋友') + ' 查看了你的朋友圈');
  },

  /* 朋友视角只读卡片（无点赞/评论/删除操作） */
  _visitorCardHtml(m) {
    var quoteHtml = '';
    if (m.quote && m.quote.text) {
      quoteHtml = '<div class="moment-quote-card">'
        + '<div class="moment-quote-label"><i class="fas fa-quote-left"></i> 引用字卡' + (m.quote.source ? ' · ' + Core.escapeHtml(m.quote.source) : '') + '</div>'
        + '<div class="moment-quote-text">' + Core.escapeHtml(m.quote.text) + '</div>'
        + '</div>';
    }
    var imagesHtml = '';
    if (m.images && m.images.length) {
      var cls = 'moment-images';
      if (m.images.length === 1) cls += ' one';
      else if (m.images.length === 2) cls += ' two';
      var imgs = '';
      for (var i = 0; i < m.images.length; i++) {
        imgs += '<div class="moment-img"><img src="' + m.images[i] + '" alt="朋友圈图片"></div>';
      }
      imagesHtml = '<div class="' + cls + '">' + imgs + '</div>';
    }
    return '<div class="moment-card">'
      + '<div class="moment-card-head">'
      +   this._avatarHtml({ id: m.authorId, name: m.authorName, avatar: m.authorAvatar, color: m.authorColor, avatarImage: m.authorAvatarImage }, 'moment-card-avatar')
      +   '<div><div class="moment-card-author">' + Core.escapeHtml(m.authorName) + '</div>'
      +   '<div class="moment-card-source">' + Core.escapeHtml(m.source || '') + '</div></div>'
      + '</div>'
      + '<div class="moment-card-body">'
      +   (m.text ? '<div class="moment-card-text">' + Core.escapeHtml(m.text) + '</div>' : '')
      +   quoteHtml
      +   imagesHtml
      + '</div>'
      + '<div class="moment-card-actions">'
      +   '<div class="moment-card-time">' + Core.formatTime(m.time) + '</div>'
      + '</div>'
      + '</div>';
  },

  /* ================ 弹层 ================ */
  _showPanel(html) {
    this._closeOverlay();
    var ov = document.createElement('div');
    ov.className = 'moments-overlay';
    ov.id = 'moments-overlay';
    ov.onclick = function(e) {
      if (e.target === ov) MomentsApp.closeMomentsOverlay();
    };
    ov.innerHTML = '<div style="position:relative">' + html + '</div>';
    document.body.appendChild(ov);
  },

  _showSheet(html) {
    this._closeOverlay();
    var ov = document.createElement('div');
    ov.className = 'moments-overlay';
    ov.id = 'moments-overlay';
    ov.onclick = function(e) {
      if (e.target === ov) MomentsApp.closeMomentsOverlay();
    };
    var sheet = document.createElement('div');
    sheet.className = 'moments-sheet';
    sheet.innerHTML = html;
    ov.appendChild(sheet);
    document.body.appendChild(ov);
  },

  closeMomentsOverlay() {
    var ov = document.getElementById('moments-overlay');
    if (ov) ov.parentNode.removeChild(ov);
  },

  _closeOverlay() {
    this.closeMomentsOverlay();
  },

  /* ================ 图片压缩 ================ */
  _compressDataUrl(dataUrl, maxSize, quality, callback) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
      if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() {
      console.error('[moments] 图片解码失败');
      callback(dataUrl);
    };
    img.src = dataUrl;
  }
};

/* ================ window 绑定（供内联 onclick / navigation 使用） ================ */
window.MomentsApp = MomentsApp;
window.renderMoments = function() { MomentsApp.renderMoments(); };
window.renderMomentsFriends = function() { MomentsApp.renderMomentsFriends(); };
window.openMomentsPublish = function(mode, extra) { MomentsApp.openMomentsPublish(mode, extra); };
window.pickPublishImages = function() { MomentsApp.pickPublishImages(); };
window.addPublishImages = function(input) { MomentsApp.addPublishImages(input); };
window.removePublishImage = function(index) { MomentsApp.removePublishImage(index); };
window.pickQuoteCard = function() { MomentsApp.pickQuoteCard(); };
window.filterPickerCards = function(input) { MomentsApp.filterPickerCards(input); };
window.chooseQuoteCard = function(id) { MomentsApp.chooseQuoteCard(id); };
window.clearPublishQuote = function() { MomentsApp.clearPublishQuote(); };
window.submitMomentsPublish = function() { MomentsApp.submitMomentsPublish(); };
window.toggleMomentLike = function(id) { MomentsApp.toggleMomentLike(id); };
window.openCommentBox = function(id, replyId) { MomentsApp.openCommentBox(id, replyId); };
window.submitMomentComment = function() { MomentsApp.submitMomentComment(); };
window.deleteMoment = function(id) { MomentsApp.deleteMoment(id); };
window.openFriendInteract = function(id) { MomentsApp.openFriendInteract(id); };
window.selectInteractFriend = function(id) { MomentsApp.selectInteractFriend(id); };
window.friendLikeToggle = function(id) { MomentsApp.friendLikeToggle(id); };
window.openFriendCommentBox = function(id) { MomentsApp.openFriendCommentBox(id); };
window.submitFriendComment = function() { MomentsApp.submitFriendComment(); };
window.viewMomentImage = function(index, id) { MomentsApp.viewMomentImage(index, id); };
window.closeMomentsViewer = function() { MomentsApp.closeMomentsViewer(); };
window.openBgSettings = function() { MomentsApp.openBgSettings(); };
window.setMomentsBgDefault = function() { MomentsApp.setMomentsBgDefault(); };
window.pickMomentsBg = function() { MomentsApp.pickMomentsBg(); };
window.applyMomentsBg = function(input) { MomentsApp.applyMomentsBg(input); };
window.clearMomentsBg = function() { MomentsApp.clearMomentsBg(); };
window.openFriendsManager = function() { MomentsApp.openFriendsManager(); };
window.openMomentsVisitors = function() { MomentsApp.openMomentsVisitors(); };
window.renderMomentsVisitors = function() { MomentsApp.renderMomentsVisitors(); };
window.clearVisitors = function() { MomentsApp.clearVisitors(); };
window.friendViewMoments = function(id) { MomentsApp.friendViewMoments(id); };
window.openAddFriend = function() { MomentsApp.openAddFriend(); };
window.selectFriendColor = function(color) { MomentsApp.selectFriendColor(color); };
window.pickFriendAvatar = function() { MomentsApp.pickFriendAvatar(); };
window.applyFriendAvatar = function(input) { MomentsApp.applyFriendAvatar(input); };
window.submitAddFriend = function() { MomentsApp.submitAddFriend(); };
window.deleteFriend = function(id) { MomentsApp.deleteFriend(id); };
window.closeMomentsOverlay = function() { MomentsApp.closeMomentsOverlay(); };
