var BubbleMaker = (function() {
  /* ---------- 数据层 ---------- */
  function getBubbles() {
    var list = Storage.get('bubbleList', []);
    return Array.isArray(list) ? list : [];
  }
  function setBubbles(list) {
    Storage.set('bubbleList', list || []);
  }
  function getAssignments() {
    var a = Storage.get('bubbleAssignments', {});
    return (a && typeof a === 'object') ? a : {};
  }
  function setAssignments(a) {
    Storage.set('bubbleAssignments', a || {});
  }
  function getBubbleById(id) {
    var list = getBubbles();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hexToRgba(hex, alpha) {
    var h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0x888888;
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var a = (alpha == null ? 1 : alpha);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function isLightColor(hex) {
    var h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0x888888;
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  }
  function compressImage(dataUrl, maxSize, cb) {
    try {
      var img = new Image();
      img.onload = function() {
        try {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSize / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          cb(c.toDataURL('image/png'));
        } catch (e) { cb(dataUrl); }
      };
      img.onerror = function() { cb(dataUrl); };
      img.src = dataUrl;
    } catch (e) { cb(dataUrl); }
  }
  function toast(msg) {
    var old = document.querySelector('.bm-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'bm-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 1800);
  }

  /* =====================================================
   * 数据归一化：兼容旧数据（旧气泡无新字段时补齐默认值）
   * ===================================================== */
  function normalizeCfg(cfg) {
    if (!cfg) return null;
    var c = cfg;
    var scale = c.bubbleScale == null ? 1 : c.bubbleScale;
    var isOld = (c.radiusTL == null);
    var radiusTL = c.radiusTL == null ? 5 : c.radiusTL;
    var radiusTR = c.radiusTR == null ? 5 : c.radiusTR;
    var radiusBL = c.radiusBL == null ? 5 : c.radiusBL;
    var radiusBR = c.radiusBR == null ? 5 : c.radiusBR;
    return {
      id: c.id,
      name: c.name || '',
      source: c.source || 'maker',
      createdAt: c.createdAt,
      type: c.type || 'basic',
      ear: c.ear || 'cat',
      bgColor: c.bgColor || '#B8DCF0',
      borderColor: c.borderColor || '#4C9AFF',
      borderWidth: c.borderWidth == null ? 1 : c.borderWidth,
      opacity: c.opacity == null ? 100 : c.opacity,
      bubbleScale: scale,
      // 独立宽高（旧数据按 scale 换算）
      width: c.width == null ? Math.round(220 * scale) : c.width,
      height: c.height == null ? Math.round(60 * scale) : c.height,
      // 晕染
      haloColor: c.haloColor || '#FFD700',
      haloSpread: c.haloSpread == null ? 20 : c.haloSpread,
      haloMode: c.haloMode || 'outer',
      // 四角圆角
      radiusTL: radiusTL, radiusTR: radiusTR, radiusBL: radiusBL, radiusBR: radiusBR,
      // 小三角：旧气泡原本带右侧小尾巴 → 兼容为 wechat / auto
      tailType: c.tailType == null ? (isOld ? 'wechat' : 'none') : c.tailType,
      tailPos: c.tailPos || 'auto',
      decorations: (c.decorations || []).map(function(d) {
        return {
          type: d.type,
          value: d.value,
          x: d.x == null ? 0 : d.x,
          y: d.y == null ? 0 : d.y,
          size: d.size || 20,
          rotate: d.rotate || 0,
          anchor: d.anchor || 'tl'
        };
      })
    };
  }

  /* =====================================================
   * 动态样式注入
   * ===================================================== */
  var _styleEl = null;
  var _injected = {};
  function styleEl() {
    if (_styleEl) return _styleEl;
    _styleEl = document.getElementById('bubble-dynamic-styles');
    if (!_styleEl) {
      _styleEl = document.createElement('style');
      _styleEl.id = 'bubble-dynamic-styles';
      document.head.appendChild(_styleEl);
    }
    return _styleEl;
  }

  /* 小三角定位（pos: auto/right/left/top/bottom/tl/tr/bl/br） */
  function tailCss(cfg, pos) {
    var bg = hexToRgba(cfg.bgColor, cfg.opacity / 100);
    var bw = cfg.borderWidth || 0;
    var bc = (bw > 0 && cfg.borderColor) ? cfg.borderColor : 'transparent';
    var body;
    if (cfg.tailType === 'qq') {
      // QQ 式：圆润小方块
      body = 'width:10px;height:10px;background:' + bg + ';border-radius:3px;'
        + (bw > 0 ? 'box-shadow:0 0 0 ' + bw + 'px ' + bc + ';' : '');
    } else {
      // 微信式：尖角小三角（border 三角，尖朝外）
      body = 'width:0;height:0;border-left:10px solid ' + bg
        + ';border-top:6px solid transparent;border-bottom:6px solid transparent;';
    }
    var offset = '';
    if (pos === 'right') offset = 'right:-8px;top:14px;';
    else if (pos === 'left') offset = 'left:-8px;top:14px;';
    else if (pos === 'top') offset = 'top:-8px;left:24px;';
    else if (pos === 'bottom') offset = 'bottom:-8px;left:24px;';
    else if (pos === 'tl') offset = 'top:-8px;left:16px;';
    else if (pos === 'tr') offset = 'top:-8px;right:16px;';
    else if (pos === 'bl') offset = 'bottom:-8px;left:16px;';
    else if (pos === 'br') offset = 'bottom:-8px;right:16px;';
    return body + 'position:absolute;' + offset + 'z-index:1;pointer-events:none;';
  }

  function buildBubbleCss(rawCfg) {
    var cfg = normalizeCfg(rawCfg);
    if (!cfg) return '';
    var bg = hexToRgba(cfg.bgColor, cfg.opacity / 100);
    var textColor = isLightColor(cfg.bgColor) ? '#333333' : '#ffffff';
    var borderCss = (cfg.borderWidth > 0 && cfg.borderColor)
      ? (cfg.borderWidth + 'px solid ' + cfg.borderColor) : 'none';
    var fontSize = Math.round(14 * cfg.bubbleScale);
    var radius = cfg.radiusTL + 'px ' + cfg.radiusTR + 'px ' + cfg.radiusBR + 'px ' + cfg.radiusBL + 'px';
    var rules = [];

    // 气泡本体：box-sizing:border-box 保证描边不改变整体大小
    var base = '.message-row .message-bubble.bub-' + cfg.id
      + ' { box-sizing:border-box; position:relative;'
      + ' width:' + cfg.width + 'px; min-height:' + cfg.height + 'px;'
      + ' font-size:' + fontSize + 'px; border-radius:' + radius + ';';
    if (cfg.type === 'halo' && cfg.haloMode === 'outer') {
      // 纯四周晕染：无基础底盘背景/描边，靠多层 box-shadow 向四周扩散
      var haloRgba = hexToRgba(cfg.haloColor, (cfg.opacity / 100) * 0.5);
      var haloSoft = hexToRgba(cfg.haloColor, (cfg.opacity / 100) * 0.22);
      var spread = cfg.haloSpread || 20;
      base += 'background:transparent; border:none; color:' + textColor + ';'
        + ' box-shadow:0 0 ' + spread + 'px ' + Math.round(spread * 0.35) + 'px ' + haloRgba
        + ', 0 0 ' + Math.round(spread * 1.8) + 'px ' + Math.round(spread * 0.6) + 'px ' + haloSoft + ';';
    } else if (cfg.type === 'halo' && cfg.haloMode === 'inner') {
      // 内部晕染：气泡内部径向渐变
      var in1 = hexToRgba(cfg.haloColor, (cfg.opacity / 100) * 0.85);
      var in2 = hexToRgba(cfg.haloColor, (cfg.opacity / 100) * 0.3);
      var in3 = hexToRgba(cfg.bgColor, (cfg.opacity / 100) * 0.15);
      base += 'background:radial-gradient(circle at 50% 30%, ' + in1 + ' 0%, ' + in2 + ' 60%, ' + in3 + ' 100%);'
        + ' color:' + textColor + '; border:' + borderCss + ';';
    } else {
      base += 'background:' + bg + '; color:' + textColor + '; border:' + borderCss + ';';
    }
    base += ' }';
    rules.push(base);

    // 自定义气泡统一隐藏默认小尖角（是否添加小三角由 tailType 决定，走 .bub-tail）
    rules.push('.message-row.self .bub-' + cfg.id + '::after, .message-row.other .bub-' + cfg.id + '::after { display:none; }');

    // 小三角
    if (cfg.tailType && cfg.tailType !== 'none') {
      if (cfg.tailPos === 'auto') {
        rules.push('.message-row.self .bub-' + cfg.id + ' .bub-tail { ' + tailCss(cfg, 'right') + ' }');
        rules.push('.message-row.other .bub-' + cfg.id + ' .bub-tail { ' + tailCss(cfg, 'left') + ' }');
      } else {
        rules.push('.bub-' + cfg.id + ' .bub-tail { ' + tailCss(cfg, cfg.tailPos) + ' }');
      }
    }

    // 动物耳朵：位于气泡上方外部（不是内部预留），下半被气泡背景盖住形成“长出”效果
    if (cfg.type === 'animal') {
      // 外部耳朵需要垂直空间，用 margin-top 补偿，避免盖住上一条消息
      rules.push('.message-row .message-bubble.bub-' + cfg.id + ' { margin-top:22px; }');
      var earBorder = (cfg.borderWidth > 0 && cfg.borderColor) ? 'border:' + cfg.borderWidth + 'px solid ' + cfg.borderColor + ';' : '';
      rules.push('.bub-' + cfg.id + ' .bub-ear { position:absolute; z-index:1; pointer-events:none; }');
      rules.push('.bub-' + cfg.id + ' .bub-ear-l { left:14px; top:-11px; width:18px; height:18px; transform:rotate(45deg); border-radius:3px 0 0 0; background:' + bg + ';' + earBorder + ' }');
      rules.push('.bub-' + cfg.id + ' .bub-ear-r { right:14px; top:-11px; width:18px; height:18px; transform:rotate(45deg) scaleX(-1); border-radius:3px 0 0 0; background:' + bg + ';' + earBorder + ' }');
      rules.push('.bub-' + cfg.id + ' .bub-ear-bear { border-radius:50%; }');
      rules.push('.bub-' + cfg.id + ' .bub-ear-bunny { width:10px; height:26px; border-radius:50%; top:-19px; }');
    }
    return rules.join('\n');
  }

  function ensureBubbleStyle(cfg, force) {
    if (!cfg || cfg.source === 'css') return;
    if (!force && _injected[cfg.id]) return;
    styleEl().textContent += '\n' + buildBubbleCss(cfg);
    _injected[cfg.id] = true;
  }
  function ensureCssBubbleStyle(cfg, force) {
    if (!cfg || cfg.source !== 'css' || !cfg.cssCode) return;
    if (!force && _injected['css_' + cfg.id]) return;
    styleEl().textContent += '\n' + cfg.cssCode;
    _injected['css_' + cfg.id] = true;
  }
  function rebuildAllStyles() {
    _injected = {};
    if (_styleEl) _styleEl.textContent = '';
    var list = getBubbles();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.source === 'css') ensureCssBubbleStyle(c, true);
      else ensureBubbleStyle(c, true);
    }
  }

  /* =====================================================
   * 消息气泡扩展（chat.js 渲染时调用）
   * ===================================================== */
  /* 装饰物：按锚点贴近气泡四周，x/y 为微调偏移 */
  function decoStyle(d) {
    var size = d.size || 20;
    var dx = d.x || 0, dy = d.y || 0;
    var off = Math.round(size / 2);
    var anchor = d.anchor || 'tl';
    var st = 'position:absolute;';
    switch (anchor) {
      case 'tl': st += 'left:' + (-off + dx) + 'px;top:' + (-off + dy) + 'px;'; break;
      case 'tc': st += 'left:calc(50% + ' + dx + 'px - ' + off + 'px);top:' + (-off + dy) + 'px;'; break;
      case 'tr': st += 'right:' + (-off + dx) + 'px;top:' + (-off + dy) + 'px;'; break;
      case 'ml': st += 'left:' + (-off + dx) + 'px;top:calc(50% + ' + dy + 'px - ' + off + 'px);'; break;
      case 'mr': st += 'right:' + (-off + dx) + 'px;top:calc(50% + ' + dy + 'px - ' + off + 'px);'; break;
      case 'bl': st += 'left:' + (-off + dx) + 'px;bottom:' + (-off + dy) + 'px;'; break;
      case 'bc': st += 'left:calc(50% + ' + dx + 'px - ' + off + 'px);bottom:' + (-off + dy) + 'px;'; break;
      case 'br': st += 'right:' + (-off + dx) + 'px;bottom:' + (-off + dy) + 'px;'; break;
      default: st += 'left:' + dx + 'px;top:' + dy + 'px;';
    }
    return st;
  }
  function buildDecoHtml(rawCfg) {
    var cfg = normalizeCfg(rawCfg);
    if (!cfg) return '';
    var html = '';
    var decos = cfg.decorations || [];
    for (var i = 0; i < decos.length; i++) {
      var d = decos[i];
      var st = decoStyle(d);
      var size = d.size || 20;
      if (d.rotate) st += 'transform:rotate(' + d.rotate + 'deg);';
      if (d.type === 'image') {
        html += '<img class="bub-deco" src="' + esc(d.value) + '" style="' + st + 'width:' + size + 'px;height:auto">';
      } else {
        st += 'font-size:' + size + 'px;';
        html += '<span class="bub-deco" style="' + st + '">' + esc(d.value) + '</span>';
      }
    }
    return html;
  }
  function buildEarHtml(rawCfg) {
    var cfg = normalizeCfg(rawCfg);
    if (!cfg || cfg.type !== 'animal') return '';
    var ear = cfg.ear || 'cat';
    return '<span class="bub-ear bub-ear-l bub-ear-' + ear + '"></span>'
      + '<span class="bub-ear bub-ear-r bub-ear-' + ear + '"></span>';
  }
  function buildTailHtml(rawCfg) {
    var cfg = normalizeCfg(rawCfg);
    if (!cfg || !cfg.tailType || cfg.tailType === 'none') return '';
    return '<span class="bub-tail"></span>';
  }
  function getBubbleForMsg(msg, isSelf) {
    try {
      var assignments = getAssignments();
      var chatId = '';
      var el = document.getElementById('page-chat-room');
      if (el) chatId = el.dataset.chatId || '';
      var key = null;
      if (isSelf) {
        key = 'self';
      } else if (window.isGroupChatId && isGroupChatId(chatId)) {
        key = (msg && msg.fromId) || '';
      } else {
        key = window._chatCurrentPartnerId || 'other';
      }
      var bubId = assignments[key];
      if (!bubId) return null;
      return getBubbleById(bubId);
    } catch (e) { return null; }
  }
  function buildBubbleExt(msg, isSelf) {
    var cfg = getBubbleForMsg(msg, isSelf);
    if (!cfg) return { extraCls: '', deco: '', ears: '' };
    if (cfg.source === 'css') {
      ensureCssBubbleStyle(cfg);
      if (cfg.wechat) {
        // 微信风格：按消息方向追加类名，只作用于气泡本身（message-bubble 上的 message/message-sent|received）
        return { extraCls: ' message message-' + (isSelf ? 'sent' : 'received'), deco: '', ears: '' };
      }
      return { extraCls: ' ' + (cfg.cssClass || ''), deco: '', ears: '' };
    }
    ensureBubbleStyle(cfg);
    // 尾巴并入 ears 字段（chat.js 将其插入气泡开头），避免改动 chat.js
    return {
      extraCls: ' bub-' + cfg.id,
      deco: buildDecoHtml(cfg),
      ears: buildEarHtml(cfg) + buildTailHtml(cfg)
    };
  }

  /* ---------- 制作页状态 ---------- */
  var _editId = null;
  var _bound = false;
  var _state = defaultState();

  var QUICK_EMOJIS = ['🌸', '🌙', '⭐', '❤️', '🔥', '💫', '🍀', '🌈', '🎀', '✨', '😊', '🍓'];
  var TAIL_POSITIONS = [
    { key: 'auto', label: '自动' }, { key: 'right', label: '右' }, { key: 'left', label: '左' },
    { key: 'top', label: '上' }, { key: 'bottom', label: '下' },
    { key: 'tl', label: '左上' }, { key: 'tr', label: '右上' },
    { key: 'bl', label: '左下' }, { key: 'br', label: '右下' }
  ];
  var DECO_ANCHORS = [
    { key: 'tl', label: '左上' }, { key: 'tc', label: '上' }, { key: 'tr', label: '右上' },
    { key: 'ml', label: '左' }, { key: 'mr', label: '右' },
    { key: 'bl', label: '左下' }, { key: 'bc', label: '下' }, { key: 'br', label: '右下' }
  ];

  function defaultState() {
    return {
      name: '', type: 'basic', ear: 'cat',
      bgColor: '#B8DCF0', borderColor: '#4C9AFF', borderWidth: 1,
      opacity: 100,
      width: 220, height: 60,
      haloColor: '#FFD700', haloSpread: 20, haloMode: 'outer',
      radiusTL: 5, radiusTR: 5, radiusBL: 5, radiusBR: 5,
      tailType: 'none', tailPos: 'auto',
      decorations: []
    };
  }

  /* ---------- 制作页渲染 ---------- */
  function renderBubbleMaker() {
    bindMakerEvents();
    var page = document.getElementById('page-bubble-maker');
    if (!page) return;
    syncFormFromState();
    refreshPreview();
  }

  function el(id) { return document.getElementById(id); }
  function bind(id, evt, fn) {
    var node = el(id);
    if (node) node.addEventListener(evt, fn);
  }
  /* 滑块 + 数字框 + 值标签双向联动 */
  function bindRangeNumber(sliderId, numId, valId, cb) {
    var slider = el(sliderId), num = el(numId);
    if (!slider && !num) return;
    if (slider) slider.addEventListener('input', function(e) {
      var v = +e.target.value;
      if (num) num.value = v;
      if (valId && el(valId)) el(valId).textContent = v;
      if (cb) cb(v);
    });
    if (num) num.addEventListener('change', function(e) {
      var node = e.target;
      var min = parseFloat(node.min), max = parseFloat(node.max);
      var v = parseFloat(node.value);
      if (isNaN(v)) v = min || 0;
      if (!isNaN(min)) v = Math.max(min, v);
      if (!isNaN(max)) v = Math.min(max, v);
      node.value = v;
      if (slider) slider.value = v;
      if (valId && el(valId)) el(valId).textContent = v;
      if (cb) cb(v);
    });
  }

  function bindMakerEvents() {
    if (_bound) return;
    _bound = true;

    var onType = function() {
      var btns = document.querySelectorAll('.bm-type-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.type === _state.type);
      }
      var isBasic = _state.type === 'basic' || _state.type === 'animal';
      var earRow = el('bm-ear-row');
      if (earRow) earRow.style.display = _state.type === 'animal' ? 'flex' : 'none';
      var baseRow = el('bm-base-row');
      if (baseRow) baseRow.style.display = isBasic ? 'block' : 'none';
      var haloRow = el('bm-halo-row');
      if (haloRow) haloRow.style.display = _state.type === 'halo' ? 'flex' : 'none';
      refreshPreview();
    };
    var bindClick = function(selector, fn) {
      var els = document.querySelectorAll(selector);
      for (var i = 0; i < els.length; i++) els[i].addEventListener('click', fn);
    };

    bindClick('.bm-type-btn', function(e) {
      _state.type = e.currentTarget.dataset.type;
      onType();
    });
    bindClick('.bm-ear-btn', function(e) {
      _state.ear = e.currentTarget.dataset.ear;
      var btns = document.querySelectorAll('.bm-ear-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.ear === _state.ear);
      refreshPreview();
    });

    // 形状快捷：方形 / 椭圆 / 圆角矩形
    bindClick('.bm-shape-btn', function(e) {
      var k = e.currentTarget.dataset.shape;
      if (k === 'square') { _state.radiusTL = 0; _state.radiusTR = 0; _state.radiusBL = 0; _state.radiusBR = 0; }
      else if (k === 'oval') { _state.radiusTL = 999; _state.radiusTR = 999; _state.radiusBL = 999; _state.radiusBR = 999; }
      else { _state.radiusTL = 12; _state.radiusTR = 12; _state.radiusBL = 12; _state.radiusBR = 12; }
      syncFormFromState();
      refreshPreview();
    });
    // 小三角类型
    bindClick('.bm-tail-type-btn', function(e) {
      _state.tailType = e.currentTarget.dataset.tail;
      var btns = document.querySelectorAll('.bm-tail-type-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.tail === _state.tailType);
      refreshPreview();
    });
    // 小三角位置
    bindClick('.bm-tail-pos-btn', function(e) {
      _state.tailPos = e.currentTarget.dataset.pos;
      var btns = document.querySelectorAll('.bm-tail-pos-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.pos === _state.tailPos);
      refreshPreview();
    });
    // 晕染模式
    bindClick('.bm-halo-mode-btn', function(e) {
      _state.haloMode = e.currentTarget.dataset.mode;
      var btns = document.querySelectorAll('.bm-halo-mode-btn');
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.mode === _state.haloMode);
      refreshPreview();
    });

    bind('bm-bg-color', 'input', function(e) { _state.bgColor = e.target.value; refreshPreview(); });
    bind('bm-border-color', 'input', function(e) { _state.borderColor = e.target.value; refreshPreview(); });
    bindRangeNumber('bm-border-width', 'bm-border-width-num', 'bm-border-val', function(v) { _state.borderWidth = v; refreshPreview(); });
    bindRangeNumber('bm-opacity', 'bm-opacity-num', 'bm-opacity-val', function(v) { _state.opacity = v; refreshPreview(); });
    // 独立宽高
    bindRangeNumber('bm-width', 'bm-width-num', 'bm-width-val', function(v) { _state.width = v; refreshPreview(); });
    bindRangeNumber('bm-height', 'bm-height-num', 'bm-height-val', function(v) { _state.height = v; refreshPreview(); });
    // 四角圆角
    bindRangeNumber('bm-radius-tl', 'bm-radius-tl-num', 'bm-radius-tl-val', function(v) { _state.radiusTL = v; refreshPreview(); });
    bindRangeNumber('bm-radius-tr', 'bm-radius-tr-num', 'bm-radius-tr-val', function(v) { _state.radiusTR = v; refreshPreview(); });
    bindRangeNumber('bm-radius-bl', 'bm-radius-bl-num', 'bm-radius-bl-val', function(v) { _state.radiusBL = v; refreshPreview(); });
    bindRangeNumber('bm-radius-br', 'bm-radius-br-num', 'bm-radius-br-val', function(v) { _state.radiusBR = v; refreshPreview(); });
    // 晕染
    bind('bm-halo-color', 'input', function(e) { _state.haloColor = e.target.value; refreshPreview(); });
    bindRangeNumber('bm-halo-spread', 'bm-halo-spread-num', 'bm-halo-val', function(v) { _state.haloSpread = v; refreshPreview(); });

    // 装饰：上传图片
    bind('bm-deco-file', 'change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function() {
        compressImage(reader.result, 220, function(dataUrl) {
          addDecoration({ type: 'image', value: dataUrl });
        });
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
    bind('bm-deco-upload', 'click', function() {
      el('bm-deco-file').click();
    });
    bind('bm-deco-url-add', 'click', function() {
      var url = el('bm-deco-url').value.trim();
      if (!url) { toast('请先粘贴图片URL'); return; }
      addDecoration({ type: 'image', value: url });
      el('bm-deco-url').value = '';
    });
    bind('bm-deco-emoji-add', 'click', function() {
      var v = el('bm-deco-emoji').value.trim();
      if (!v) { toast('请先输入表情符号'); return; }
      addDecoration({ type: 'emoji', value: v });
      el('bm-deco-emoji').value = '';
    });
    bind('bm-deco-emoji', 'keydown', function(e) {
      if (e.key === 'Enter') el('bm-deco-emoji-add').click();
    });
    var quickBox = el('bm-deco-quick');
    if (quickBox) {
      QUICK_EMOJIS.forEach(function(em) {
        var s = document.createElement('span');
        s.textContent = em;
        s.addEventListener('click', function() { addDecoration({ type: 'emoji', value: em }); });
        quickBox.appendChild(s);
      });
    }

    bind('bm-save', 'click', saveBubble);
    bind('bm-save-cancel', 'click', function() {
      _editId = null;
      _state = defaultState();
      el('bm-save-cancel').style.display = 'none';
      el('bm-name').value = '';
      renderBubbleMaker();
      toast('已取消编辑');
    });
  }

  function syncFormFromState() {
    if (el('bm-name')) el('bm-name').value = _state.name;
    var bg = el('bm-bg-color'); if (bg) bg.value = _state.bgColor;
    var bc = el('bm-border-color'); if (bc) bc.value = _state.borderColor;
    var setVal = function(sliderId, numId, valId, v) {
      if (el(sliderId)) el(sliderId).value = v;
      if (numId && el(numId)) el(numId).value = v;
      if (valId && el(valId)) el(valId).textContent = v;
    };
    setVal('bm-border-width', 'bm-border-width-num', 'bm-border-val', _state.borderWidth);
    setVal('bm-opacity', 'bm-opacity-num', 'bm-opacity-val', _state.opacity);
    setVal('bm-width', 'bm-width-num', 'bm-width-val', _state.width);
    setVal('bm-height', 'bm-height-num', 'bm-height-val', _state.height);
    setVal('bm-radius-tl', 'bm-radius-tl-num', 'bm-radius-tl-val', _state.radiusTL);
    setVal('bm-radius-tr', 'bm-radius-tr-num', 'bm-radius-tr-val', _state.radiusTR);
    setVal('bm-radius-bl', 'bm-radius-bl-num', 'bm-radius-bl-val', _state.radiusBL);
    setVal('bm-radius-br', 'bm-radius-br-num', 'bm-radius-br-val', _state.radiusBR);
    var hc = el('bm-halo-color'); if (hc) hc.value = _state.haloColor;
    setVal('bm-halo-spread', 'bm-halo-spread-num', 'bm-halo-val', _state.haloSpread);
    var btns = document.querySelectorAll('.bm-type-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.type === _state.type);
    var earRow = el('bm-ear-row');
    if (earRow) earRow.style.display = _state.type === 'animal' ? 'flex' : 'none';
    var baseRow = el('bm-base-row');
    if (baseRow) baseRow.style.display = (_state.type === 'basic' || _state.type === 'animal') ? 'block' : 'none';
    var haloRow = el('bm-halo-row');
    if (haloRow) haloRow.style.display = _state.type === 'halo' ? 'flex' : 'none';
    var earBtns = document.querySelectorAll('.bm-ear-btn');
    for (var j = 0; j < earBtns.length; j++) earBtns[j].classList.toggle('active', earBtns[j].dataset.ear === _state.ear);
    var shapeBtns = document.querySelectorAll('.bm-shape-btn');
    var shapeKey = (_state.radiusTL === 0 && _state.radiusTR === 0 && _state.radiusBL === 0 && _state.radiusBR === 0) ? 'square'
      : (_state.radiusTL >= 100 && _state.radiusTR >= 100 && _state.radiusBL >= 100 && _state.radiusBR >= 100) ? 'oval' : 'rect';
    for (var k = 0; k < shapeBtns.length; k++) shapeBtns[k].classList.toggle('active', shapeBtns[k].dataset.shape === shapeKey);
    var tailTypeBtns = document.querySelectorAll('.bm-tail-type-btn');
    for (var m = 0; m < tailTypeBtns.length; m++) tailTypeBtns[m].classList.toggle('active', tailTypeBtns[m].dataset.tail === _state.tailType);
    var tailPosBtns = document.querySelectorAll('.bm-tail-pos-btn');
    for (var n = 0; n < tailPosBtns.length; n++) tailPosBtns[n].classList.toggle('active', tailPosBtns[n].dataset.pos === _state.tailPos);
    var modeBtns = document.querySelectorAll('.bm-halo-mode-btn');
    for (var p = 0; p < modeBtns.length; p++) modeBtns[p].classList.toggle('active', modeBtns[p].dataset.mode === _state.haloMode);
    el('bm-save-cancel').style.display = _editId ? 'block' : 'none';
  }

  /* ---------- 预览 ---------- */
  function previewStyle(state) {
    var cfg = {
      id: 'preview', type: state.type, ear: state.ear,
      bgColor: state.bgColor, borderColor: state.borderColor,
      borderWidth: state.borderWidth, opacity: state.opacity,
      bubbleScale: 1, width: state.width, height: state.height,
      haloColor: state.haloColor, haloSpread: state.haloSpread, haloMode: state.haloMode,
      radiusTL: state.radiusTL, radiusTR: state.radiusTR, radiusBL: state.radiusBL, radiusBR: state.radiusBR,
      tailType: state.tailType, tailPos: state.tailPos,
      decorations: state.decorations
    };
    var lines = buildBubbleCss(cfg).split('\n').filter(function(l) {
      return l.indexOf('.message-row .message-bubble.bub-preview') === 0;
    });
    var css = lines.length ? lines[0].replace(/^.*\{\s*/, '').replace(/\s*\}$/, '') : '';
    return { css: css, bg: hexToRgba(state.bgColor, state.opacity / 100) };
  }
  function refreshPreview() {
    var bubble = el('bm-preview-bubble');
    if (!bubble) return;
    var ps = previewStyle(_state);
    bubble.style.cssText = ps.css;
    bubble.style.position = 'relative';
    // 小三角
    var tail = bubble.querySelector('.bub-tail');
    if (tail) tail.remove();
    if (_state.tailType && _state.tailType !== 'none') {
      tail = document.createElement('span');
      tail.className = 'bub-tail';
      tail.style.cssText = tailCss({ type: 'basic', bgColor: _state.bgColor, opacity: _state.opacity, borderWidth: _state.borderWidth, borderColor: _state.borderColor, tailType: _state.tailType }, _state.tailPos === 'auto' ? 'right' : _state.tailPos);
      bubble.appendChild(tail);
    }
    // 耳朵（外部）
    bubble.querySelectorAll('.bub-ear').forEach(function(n) { n.remove(); });
    if (_state.type === 'animal') {
      var ear = _state.ear || 'cat';
      var earCssBase = 'position:absolute;z-index:1;pointer-events:none;'
        + 'background:' + ps.bg + ';'
        + (_state.borderWidth > 0 ? 'border:' + _state.borderWidth + 'px solid ' + _state.borderColor + ';' : '');
      var l, r;
      if (ear === 'bunny') {
        l = earCssBase + 'left:14px;top:-19px;width:10px;height:26px;border-radius:50%;';
        r = earCssBase + 'right:14px;top:-19px;width:10px;height:26px;border-radius:50%;';
      } else if (ear === 'bear') {
        l = earCssBase + 'left:14px;top:-11px;width:18px;height:18px;border-radius:50%;';
        r = earCssBase + 'right:14px;top:-11px;width:18px;height:18px;border-radius:50%;';
      } else {
        l = earCssBase + 'left:14px;top:-11px;width:18px;height:18px;transform:rotate(45deg);border-radius:3px 0 0 0;';
        r = earCssBase + 'right:14px;top:-11px;width:18px;height:18px;transform:rotate(45deg) scaleX(-1);border-radius:3px 0 0 0;';
      }
      bubble.insertAdjacentHTML('beforeend',
        '<span class="bub-ear bub-ear-l bub-ear-' + ear + '" style="' + l + '"></span>'
        + '<span class="bub-ear bub-ear-r bub-ear-' + ear + '" style="' + r + '"></span>');
    }
    // 装饰
    bubble.querySelectorAll('.bub-deco').forEach(function(n) { n.remove(); });
    var decos = _state.decorations || [];
    for (var i = 0; i < decos.length; i++) {
      var d = decos[i];
      var st = decoStyle(d);
      var size = d.size || 20;
      if (d.rotate) st += 'transform:rotate(' + d.rotate + 'deg);';
      var node = null;
      if (d.type === 'image') {
        node = document.createElement('img');
        node.className = 'bub-deco';
        node.src = d.value;
        st += 'width:' + size + 'px;height:auto;';
      } else {
        node = document.createElement('span');
        node.className = 'bub-deco';
        node.textContent = d.value;
        st += 'font-size:' + size + 'px;';
      }
      node.style.cssText = st;
      node.style.pointerEvents = 'auto';
      node.style.cursor = 'move';
      bubble.appendChild(node);
      makeDecoDraggable(node, d);
    }
    renderDecoList();
  }

  function makeDecoDraggable(node, deco) {
    var startX = 0, startY = 0, origX = 0, origY = 0;
    var move = function(e) {
      var dx = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
      var dy = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      node.style.left = (origX + dx) + 'px';
      node.style.top = (origY + dy) + 'px';
    };
    var up = function(e) {
      e.preventDefault();
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      deco.x = parseFloat(node.style.left) || 0;
      deco.y = parseFloat(node.style.top) || 0;
    };
    node.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX; startY = e.clientY;
      origX = parseFloat(node.style.left) || 0;
      origY = parseFloat(node.style.top) || 0;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    node.addEventListener('touchstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      origX = parseFloat(node.style.left) || 0;
      origY = parseFloat(node.style.top) || 0;
      document.addEventListener('touchmove', move);
      document.addEventListener('touchend', up);
    }, { passive: false });
  }

  function renderDecoList() {
    var box = el('bm-deco-list');
    if (!box) return;
    box.innerHTML = '';
    var decos = _state.decorations || [];
    if (decos.length === 0) {
      box.innerHTML = '<div style="font-size:0.7rem;color:#b0a0c0;text-align:center;padding:8px 0">暂无装饰，可上传图片 / 粘贴URL / 输入表情</div>';
      return;
    }
    for (var i = 0; i < decos.length; i++) {
      (function(idx, d) {
        var item = document.createElement('div');
        item.className = 'bm-deco-item';
        var thumb = document.createElement('div');
        thumb.className = 'bm-deco-thumb';
        if (d.type === 'image') {
          var img = document.createElement('img');
          img.src = d.value;
          thumb.appendChild(img);
        } else {
          thumb.textContent = d.value;
        }
        // 锚点选择
        var anchorBox = document.createElement('div');
        anchorBox.className = 'bm-deco-anchors';
        DECO_ANCHORS.forEach(function(a) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bm-deco-anchor' + (d.anchor === a.key ? ' active' : '');
          b.textContent = a.label;
          b.addEventListener('click', function() {
            d.anchor = a.key;
            refreshPreview();
          });
          anchorBox.appendChild(b);
        });
        var sliders = document.createElement('div');
        sliders.className = 'bm-deco-sliders';
        sliders.innerHTML = '<label>大小 <input type="range" min="10" max="60" value="' + (d.size || 20) + '"></label>'
          + '<label>旋转 <input type="range" min="0" max="360" value="' + (d.rotate || 0) + '"></label>'
          + '<label>偏移X <input type="number" min="-60" max="60" value="' + (d.x || 0) + '"></label>'
          + '<label>偏移Y <input type="number" min="-60" max="60" value="' + (d.y || 0) + '"></label>';
        var sizeInput = sliders.querySelectorAll('input')[0];
        var rotInput = sliders.querySelectorAll('input')[1];
        var xInput = sliders.querySelectorAll('input')[2];
        var yInput = sliders.querySelectorAll('input')[3];
        sizeInput.addEventListener('input', function(e) { d.size = +e.target.value; refreshPreview(); });
        rotInput.addEventListener('input', function(e) { d.rotate = +e.target.value; refreshPreview(); });
        xInput.addEventListener('change', function(e) { d.x = +e.target.value; refreshPreview(); });
        yInput.addEventListener('change', function(e) { d.y = +e.target.value; refreshPreview(); });
        var del = document.createElement('button');
        del.className = 'bm-deco-del';
        del.innerHTML = '<i class="fas fa-trash"></i>';
        del.addEventListener('click', function() {
          _state.decorations.splice(idx, 1);
          refreshPreview();
        });
        item.appendChild(thumb);
        item.appendChild(anchorBox);
        item.appendChild(sliders);
        item.appendChild(del);
        box.appendChild(item);
      })(i, decos[i]);
    }
  }

  function addDecoration(d) {
    _state.decorations.push({
      type: d.type,
      value: d.value,
      x: 0,
      y: 0,
      size: 20,
      rotate: 0,
      anchor: 'tl'
    });
    refreshPreview();
  }

  /* ---------- 保存 ---------- */
  function saveBubble() {
    var name = (el('bm-name') ? el('bm-name').value : '').trim();
    if (!name) { toast('请先填写气泡名称'); return; }
    var cfg = {
      id: _editId || ('bub_' + Date.now()),
      name: name,
      source: 'maker',
      type: _state.type,
      ear: _state.ear,
      bgColor: _state.bgColor,
      borderColor: _state.borderColor,
      borderWidth: _state.borderWidth,
      opacity: _state.opacity,
      bubbleScale: 1,
      width: _state.width,
      height: _state.height,
      haloColor: _state.haloColor,
      haloSpread: _state.haloSpread,
      haloMode: _state.haloMode,
      radiusTL: _state.radiusTL,
      radiusTR: _state.radiusTR,
      radiusBL: _state.radiusBL,
      radiusBR: _state.radiusBR,
      tailType: _state.tailType,
      tailPos: _state.tailPos,
      decorations: (_state.decorations || []).map(function(d) {
        return { type: d.type, value: d.value, x: d.x, y: d.y, size: d.size, rotate: d.rotate, anchor: d.anchor };
      }),
      createdAt: Date.now()
    };
    var list = getBubbles();
    var existed = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === cfg.id) { list[i] = cfg; existed = true; break; }
    }
    if (!existed) list.push(cfg);
    setBubbles(list);
    rebuildAllStyles();
    _editId = null;
    _state = defaultState();
    el('bm-name').value = '';
    toast('气泡已保存');
    if (window.Navigation) {
      var shop = document.getElementById('page-bubble-shop');
      if (shop && shop.classList.contains('active')) renderBubbleShop();
      Navigation.goBack();
      if (shop) renderBubbleShop();
    }
  }

  /* ---------- 商城页 ---------- */
  var _assignTarget = null;
  var _assignOpen = false;

  function renderBubbleShop() {
    var grid1 = el('bs-maker-grid');
    var grid2 = el('bs-css-grid');
    if (!grid1 || !grid2) return;
    var list = getBubbles();
    var makerList = list.filter(function(b) { return b.source !== 'css'; });
    var cssList = list.filter(function(b) { return b.source === 'css'; });
    renderCardGrid(grid1, makerList);
    renderCardGrid(grid2, cssList, true);
  }

  function miniBubbleHtml(rawCfg) {
    if (rawCfg.source === 'css') {
      if (rawCfg.wechat) {
        // 微信风格：发送/接收各一个预览，直观展示双向气泡样式
        return '<div class="bs-mini-pair"><span class="bs-mini-tag">我</span><div class="bs-mini-bubble message message-sent">你好呀~</div></div>'
          + '<div class="bs-mini-pair"><span class="bs-mini-tag">TA</span><div class="bs-mini-bubble message message-received">你好呀~</div></div>';
      }
      return '<div class="bs-mini-bubble ' + (rawCfg.cssClass || '') + '">气泡预览</div>';
    }
    var cfg = normalizeCfg(rawCfg);
    var css = buildBubbleCss(cfg).split('\n')[0];
    var body = css.replace(/^.*\{\s*/, '').replace(/\s*\}$/, '');
    body += 'position:relative;';
    var ears = '';
    if (cfg.type === 'animal') {
      var ear = cfg.ear || 'cat';
      var earBase = 'position:absolute;z-index:1;pointer-events:none;background:'
        + hexToRgba(cfg.bgColor, cfg.opacity / 100) + ';'
        + (cfg.borderWidth > 0 ? 'border:' + cfg.borderWidth + 'px solid ' + cfg.borderColor + ';' : '');
      var l, r;
      if (ear === 'bunny') {
        l = earBase + 'left:14px;top:-19px;width:10px;height:26px;border-radius:50%;';
        r = earBase + 'right:14px;top:-19px;width:10px;height:26px;border-radius:50%;';
      } else if (ear === 'bear') {
        l = earBase + 'left:14px;top:-11px;width:18px;height:18px;border-radius:50%;';
        r = earBase + 'right:14px;top:-11px;width:18px;height:18px;border-radius:50%;';
      } else {
        l = earBase + 'left:14px;top:-11px;width:18px;height:18px;transform:rotate(45deg);border-radius:3px 0 0 0;';
        r = earBase + 'right:14px;top:-11px;width:18px;height:18px;transform:rotate(45deg) scaleX(-1);border-radius:3px 0 0 0;';
      }
      ears = '<span class="bub-ear bub-ear-l bub-ear-' + ear + '" style="' + l + '"></span>'
        + '<span class="bub-ear bub-ear-r bub-ear-' + ear + '" style="' + r + '"></span>';
    }
    var tail = '';
    if (cfg.tailType && cfg.tailType !== 'none') {
      var tpos = cfg.tailPos === 'auto' ? 'right' : cfg.tailPos;
      tail = '<span class="bub-tail" style="' + tailCss(cfg, tpos) + '"></span>';
    }
    return '<div class="bs-mini-bubble" style="' + body + '">气泡预览' + tail + ears + buildDecoHtml(cfg) + '</div>';
  }

  function renderCardGrid(grid, list, isCss) {
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = '<div class="bs-empty">' + (isCss ? '暂无 CSS 气泡，可在上方粘贴 CSS 代码创建' : '还没有制作气泡，点击右上角「+ 制作新气泡」开始') + '</div>';
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function(cfg) {
        var card = document.createElement('div');
        card.className = 'bs-card';
        card.setAttribute('data-id', cfg.id);
        var preview = document.createElement('div');
        preview.className = 'bs-card-preview';
        preview.innerHTML = miniBubbleHtml(cfg);
        var name = document.createElement('div');
        name.className = 'bs-card-name';
        name.textContent = cfg.name;
        var actions = document.createElement('div');
        actions.className = 'bs-card-actions';
        var setBtn = document.createElement('button');
        setBtn.className = 'bs-card-btn primary';
        setBtn.textContent = '设置';
        setBtn.addEventListener('click', function() { openAssign(cfg); });
        var editBtn = document.createElement('button');
        editBtn.className = 'bs-card-btn';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', function() { openEdit(cfg); });
        var delBtn = document.createElement('button');
        delBtn.className = 'bs-card-btn danger';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', function() { deleteBubble(cfg); });
        actions.appendChild(setBtn);
        if (!isCss) actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(preview);
        card.appendChild(name);
        card.appendChild(actions);
        grid.appendChild(card);
      })(list[i]);
    }
  }

  function openNew() {
    _editId = null;
    _state = defaultState();
    if (el('bm-name')) el('bm-name').value = '';
    if (window.Navigation) Navigation.navigateTo('bubble-maker');
  }

  function openEdit(rawCfg) {
    var cfg = normalizeCfg(rawCfg);
    if (!cfg) return;
    _editId = cfg.id;
    _state = {
      name: cfg.name,
      type: cfg.type,
      ear: cfg.ear,
      bgColor: cfg.bgColor,
      borderColor: cfg.borderColor,
      borderWidth: cfg.borderWidth,
      opacity: cfg.opacity,
      width: cfg.width,
      height: cfg.height,
      haloColor: cfg.haloColor,
      haloSpread: cfg.haloSpread,
      haloMode: cfg.haloMode,
      radiusTL: cfg.radiusTL,
      radiusTR: cfg.radiusTR,
      radiusBL: cfg.radiusBL,
      radiusBR: cfg.radiusBR,
      tailType: cfg.tailType,
      tailPos: cfg.tailPos,
      decorations: cfg.decorations
    };
    if (window.Navigation) Navigation.navigateTo('bubble-maker');
  }

  function deleteBubble(cfg) {
    if (!window.confirm('确定删除气泡「' + (cfg.name || '') + '」吗？')) return;
    var list = getBubbles().filter(function(b) { return b.id !== cfg.id; });
    setBubbles(list);
    var assign = getAssignments();
    var changed = false;
    for (var k in assign) {
      if (assign[k] === cfg.id) { delete assign[k]; changed = true; }
    }
    if (changed) setAssignments(assign);
    rebuildAllStyles();
    renderBubbleShop();
    toast('已删除气泡');
  }

  /* ---------- 指派 ---------- */
  function openAssign(cfg) {
    _assignTarget = cfg;
    var overlay = el('bs-assign-overlay');
    if (!overlay) return;
    _assignOpen = true;
    el('bs-assign-name').textContent = '「' + cfg.name + '」';
    var box = el('bs-assign-targets');
    box.innerHTML = '';
    var assign = getAssignments();
    var bubbles = getBubbles();
    var allPartners = [];
    try { allPartners = Storage.getPartnerProfiles() || []; } catch (e) {}

    var targets = [{ key: 'self', label: '我方', sub: '我的消息' }];
    allPartners.forEach(function(p) {
      targets.push({ key: p.id, label: p.nickname || '角色', sub: '对方 / 角色' });
    });

    targets.forEach(function(t) {
      var row = document.createElement('div');
      row.className = 'bs-assign-item';
      row.setAttribute('data-key', t.key);
      var label = document.createElement('span');
      label.className = 'bs-assign-label';
      label.innerHTML = esc(t.label) + '<small>' + esc(t.sub) + '</small>';
      var sel = document.createElement('select');
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '默认气泡（不指定）';
      sel.appendChild(opt0);
      bubbles.forEach(function(b) {
        var o = document.createElement('option');
        o.value = b.id;
        o.textContent = b.name;
        if (assign[t.key] === b.id) o.selected = true;
        sel.appendChild(o);
      });
      row.appendChild(label);
      row.appendChild(sel);
      box.appendChild(row);
    });

    overlay.style.display = 'flex';
  }

  function bindAssignEvents() {
    bind('bs-assign-cancel', 'click', function() {
      el('bs-assign-overlay').style.display = 'none';
      _assignOpen = false;
    });
    bind('bs-assign-save', 'click', function() {
      if (!_assignOpen) return;
      var box = el('bs-assign-targets');
      var rows = box.querySelectorAll('.bs-assign-item');
      var assign = getAssignments();
      var hadAny = false;
      rows.forEach(function(row) {
        var label = row.querySelector('.bs-assign-label');
        var sel = row.querySelector('select');
        if (!label || !sel) return;
        var key = row.getAttribute('data-key');
        if (!key) return;
        if (sel.value) { assign[key] = sel.value; hadAny = true; }
        else { delete assign[key]; }
      });
      setAssignments(assign);
      el('bs-assign-overlay').style.display = 'none';
      _assignOpen = false;
      toast(hadAny ? '气泡指派已保存' : '已清除所有指派');
    });
    bind('bs-assign-overlay', 'click', function(e) {
      if (e.target && e.target.id === 'bs-assign-overlay') {
        e.target.style.display = 'none';
        _assignOpen = false;
      }
    });
  }

  function bindShopEvents() {
    bind('bs-new-maker', 'click', openNew);
    bind('bs-css-save', 'click', saveCssBubble);
  }

  function saveCssBubble() {
    var code = (el('bs-css-code') ? el('bs-css-code').value : '').trim();
    if (!code) { toast('请先粘贴 CSS 代码'); return; }
    var m = /\.([a-zA-Z_][\w-]*)/.exec(code);
    if (!m) { toast('CSS 中未找到类名（如 .my-bubble）'); return; }
    var cls = m[1];
    // 微信风格检测：同时包含 .message-sent 与 .message-received 选择器即视为微信风格
    var wechat = /\.message-sent(?=[\s,{.:])/.test(code) && /\.message-received(?=[\s,{.:])/.test(code);
    var cfg = {
      id: 'bub_css_' + Date.now(),
      name: wechat ? '微信风格气泡' : ('CSS气泡 ' + cls),
      source: 'css',
      cssClass: wechat ? 'message' : cls,
      cssCode: code,
      wechat: wechat || undefined,
      createdAt: Date.now()
    };
    var list = getBubbles();
    list.push(cfg);
    setBubbles(list);
    ensureCssBubbleStyle(cfg);
    el('bs-css-code').value = '';
    renderBubbleShop();
    toast(wechat ? '微信风格气泡已保存（我/对方自动区分方向）' : 'CSS 气泡已保存');
  }

  /* ---------- 初始化 ---------- */
  function init() {
    bindAssignEvents();
    bindShopEvents();
    document.addEventListener('pagechange', function() {
      var shop = document.getElementById('page-bubble-shop');
      if (shop && shop.classList.contains('active')) renderBubbleShop();
    });
    rebuildAllStyles();
  }

  /* ---------- 对外接口 ---------- */
  return {
    init: init,
    getBubbleForMsg: getBubbleForMsg,
    buildBubbleExt: buildBubbleExt,
    rebuildAllStyles: rebuildAllStyles,
    renderBubbleMaker: renderBubbleMaker,
    renderBubbleShop: renderBubbleShop,
    openNew: openNew,
    openEdit: openEdit,
    deleteBubble: deleteBubble,
    openAssign: openAssign,
    _testGetBubbles: getBubbles
  };
})();

window.BubbleMaker = BubbleMaker;
window.renderBubbleMaker = function() { BubbleMaker.renderBubbleMaker(); };
window.renderBubbleShop = function() { BubbleMaker.renderBubbleShop(); };
window.BubbleMakerOpenNew = function() { BubbleMaker.openNew(); };
window.BubbleMakerOpenEdit = function(id) {
  var b = BubbleMaker._testGetBubbles().filter(function(x) { return x.id === id; })[0];
  if (b) BubbleMaker.openEdit(b);
};
window.BubbleMakerDelete = function(id) {
  var b = BubbleMaker._testGetBubbles().filter(function(x) { return x.id === id; })[0];
  if (b) BubbleMaker.deleteBubble(b);
};
window.BubbleMakerAssign = function(id) {
  var b = BubbleMaker._testGetBubbles().filter(function(x) { return x.id === id; })[0];
  if (b) BubbleMaker.openAssign(b);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { BubbleMaker.init(); });
} else {
  BubbleMaker.init();
}
