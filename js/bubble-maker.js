/* ==== bubble-maker.js ==== */
/* ===== 疯狗龙的情书 - 气泡生成器 v2（整体重设计） =====
   旧版"气泡美化"功能整体删除重建，全新实现：
   1) 预览区实时预览气泡效果
   2) 文本输入框输入聊天文字，立刻更新预览
   3) 全部参数均为移动端滑块 + 颜色选择器：
      气泡圆角 / 气泡最大宽度 / 内边距 / 背景色 / 文字颜色 /
      边框粗细 / 边框颜色 / 阴影开关 / 阴影大小 /
      CSS 尖角三角开关 / 尖角大小 / 尖角位置（左下/右下）
   4) 上传透明底图片或粘贴图片 URL，在气泡上做装饰
   5) 制作完毕的气泡保存至气泡商城（Storage 持久化 + 角色指派）
   6) UI 与网站整体风格一致，各功能位置大小自适应
*/

const BubbleMaker = (function() {

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function clampNum(v, min, max) {
    v = parseFloat(v);
    if (isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }
  function intVal(id, def) {
    var node = el(id);
    if (!node) return def;
    var min = parseFloat(node.min);
    var max = parseFloat(node.max);
    if (isNaN(min)) min = def;
    if (isNaN(max)) max = 9999;
    return clampNum(parseFloat(node.value), min, max);
  }
  function boolVal(id, def) {
    var node = el(id);
    if (!node) return def;
    return node.checked;
  }
  function textVal(id, def) {
    var node = el(id);
    return node ? String(node.value || '') : (def || '');
  }
  function toast(msg) {
    try {
      if (window.Core && typeof Core.toast === 'function') { Core.toast(msg); return; }
    } catch (e) {}
    // 兜底自建提示条
    var old = document.querySelector('.bm-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'bm-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2000);
  }

  /* ================= 数据层（与项目 Storage 机制一致） ================= */
  function getBubbles() {
    var list = Storage.get('bubbleList', []) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var cfg = normalizeBubble(list[i]);
      if (cfg) out.push(cfg);
    }
    return out;
  }
  function setBubbles(list) { Storage.set('bubbleList', list || []); }
  function getAssignments() { return Storage.get('bubbleAssignments', {}) || {}; }
  function setAssignments(map) { Storage.set('bubbleAssignments', map || {}); }
  function getBubbleById(id) {
    var list = getBubbles();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ================= 配置模型 ================= */
  function defaultCfg() {
    return {
      id: null,
      name: '',
      source: 'maker',
      cssClass: null,
      cssCode: null,
      wechat: false,
      radius: 16,          // 气泡圆角 px
      maxWidth: 260,       // 气泡最大宽度 px
      padding: 12,         // 内边距 px
      bgColor: '#B8DCF0',  // 背景色
      textColor: '#3A4050',// 文字颜色
      borderWidth: 0,      // 边框粗细 px
      borderColor: '#4C9AFF', // 边框颜色
      shadowEnabled: true, // 阴影开关
      shadowSize: 8,       // 阴影大小 px
      shadowBlur: 16,      // 阴影模糊度 px
      shadowAngle: 0,      // 阴影角度（0=正下方，顺时针旋转）
      tailEnabled: true,   // CSS 尖角三角开关
      tailSize: 10,        // 尖角大小 px
      tailPos: 'br',       // 尖角位置：br 右下 / bl 左下（我方消息视角；对方消息自动镜像）
      decoration: null,    // 装饰 {type: 'image'|'symbol', url?, text?, size, anchor}
      createdAt: 0
    };
  }
  /* 装饰锚点：四角（tl 左上 / tr 右上 / bl 左下 / br 右下），图片中心对齐气泡角 */
  var DECO_ANCHORS = [
    { key: 'tl', label: '左上' }, { key: 'tr', label: '右上' },
    { key: 'bl', label: '左下' }, { key: 'br', label: '右下' }
  ];
  function isValidAnchor(a) {
    if (!a) return false;
    for (var i = 0; i < DECO_ANCHORS.length; i++) {
      if (DECO_ANCHORS[i].key === a) return true;
    }
    return false;
  }
  /* 装饰物定位样式：四角中心对齐固定（正方形图片/符号中心对准气泡角） */
  function decoStyleFor(d) {
    var size = clampNum(d && d.size, 16, 80);
    var half = Math.round(size / 2);
    var anchor = isValidAnchor(d && d.anchor) ? d.anchor : 'tr';
    var st = 'position:absolute;z-index:2;pointer-events:none;';
    switch (anchor) {
      case 'tl': st += 'left:' + (-half) + 'px;top:' + (-half) + 'px;'; break;
      case 'tr': st += 'right:' + (-half) + 'px;top:' + (-half) + 'px;'; break;
      case 'bl': st += 'left:' + (-half) + 'px;bottom:' + (-half) + 'px;'; break;
      case 'br': st += 'right:' + (-half) + 'px;bottom:' + (-half) + 'px;'; break;
      default: st += 'right:' + (-half) + 'px;top:' + (-half) + 'px;';
    }
    return st;
  }
  /* 归一化：兼容旧版（v1）已保存数据，自动迁移到新字段；CSS 导入款转为基础款 */
  function normalizeBubble(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var cfg = defaultCfg();
    cfg.id = raw.id || ('bub_' + Date.now() + '_' + Math.floor(Math.random() * 10000));
    cfg.name = raw.name || '未命名气泡';
    cfg.createdAt = raw.createdAt || Date.now();
    // CSS 款：完整保留 cssCode/cssClass/wechat，不参与基础款迁移
    if (raw.source === 'css') {
      cfg.source = 'css';
      if (raw.cssClass) cfg.cssClass = raw.cssClass;
      if (raw.cssCode) cfg.cssCode = raw.cssCode;
      if (typeof raw.wechat === 'boolean') cfg.wechat = raw.wechat;
      return cfg;
    }
    // 旧字段迁移
    if (typeof raw.radius === 'number') cfg.radius = clampNum(raw.radius, 0, 40);
    else if (typeof raw.radiusTL === 'number' || typeof raw.radiusTR === 'number' || typeof raw.radiusBL === 'number' || typeof raw.radiusBR === 'number') {
      var r = ((raw.radiusTL || 0) + (raw.radiusTR || 0) + (raw.radiusBL || 0) + (raw.radiusBR || 0)) / 4;
      cfg.radius = clampNum(r, 0, 40);
    }
    if (typeof raw.maxWidth === 'number') cfg.maxWidth = clampNum(raw.maxWidth, 120, 360);
    if (typeof raw.padding === 'number') cfg.padding = clampNum(raw.padding, 4, 28);
    if (raw.bgColor) cfg.bgColor = raw.bgColor;
    if (raw.textColor) cfg.textColor = raw.textColor;
    if (typeof raw.borderWidth === 'number') cfg.borderWidth = clampNum(raw.borderWidth, 0, 8);
    if (raw.borderColor) cfg.borderColor = raw.borderColor;
    if (typeof raw.shadowEnabled === 'boolean') cfg.shadowEnabled = raw.shadowEnabled;
    if (typeof raw.shadowSize === 'number') cfg.shadowSize = clampNum(raw.shadowSize, 0, 30);
    if (typeof raw.shadowBlur === 'number') cfg.shadowBlur = clampNum(raw.shadowBlur, 0, 40);
    if (typeof raw.shadowAngle === 'number') cfg.shadowAngle = clampNum(raw.shadowAngle, 0, 360);
    if (typeof raw.tailEnabled === 'boolean') cfg.tailEnabled = raw.tailEnabled;
    if (typeof raw.tailSize === 'number') cfg.tailSize = clampNum(raw.tailSize, 4, 24);
    if (raw.tailPos === 'bl') cfg.tailPos = 'bl';
    else if (raw.tailPos === 'br') cfg.tailPos = 'br';
    // 装饰迁移：v2 结构 {type,url,text,size,anchor}；v1 结构 {url,size}；v1 装饰数组取第一个可用图片
    if (raw.decoration) {
      var d = raw.decoration;
      if (d.type === 'symbol' && d.text) {
        cfg.decoration = {
          type: 'symbol',
          text: d.text,
          size: clampNum(d.size, 16, 80),
          anchor: isValidAnchor(d.anchor) ? d.anchor : 'tr'
        };
      } else if (d.url) {
        cfg.decoration = {
          type: 'image',
          url: d.url,
          text: d.type === 'symbol' ? (d.text || '') : undefined,
          size: clampNum(d.size, 16, 80),
          anchor: isValidAnchor(d.anchor) ? d.anchor : 'tr'
        };
      }
    } else if (Array.isArray(raw.decorations) && raw.decorations.length) {
      for (var i = 0; i < raw.decorations.length; i++) {
        var d = raw.decorations[i];
        if (d && d.src) {
          cfg.decoration = { type: 'image', url: d.src, size: clampNum(d.size || 36, 16, 80), anchor: isValidAnchor(d.anchor) ? d.anchor : 'tr' };
          break;
        }
      }
    }
    return cfg;
  }
  function cloneCfg(cfg) {
    var c = {};
    for (var k in cfg) {
      if (cfg[k] && typeof cfg[k] === 'object') {
        c[k] = JSON.parse(JSON.stringify(cfg[k]));
      } else {
        c[k] = cfg[k];
      }
    }
    return c;
  }

  /* ================= 动态样式注入（聊天渲染用，幂等） ================= */
  function ensureStyleEl() {
    var st = document.getElementById('bubble-dynamic-styles');
    if (!st) {
      st = document.createElement('style');
      st.id = 'bubble-dynamic-styles';
      document.head.appendChild(st);
    }
    return st;
  }
  /* 阴影值计算：角度 0=正下方，顺时针旋转（x=sin(angle)*size, y=cos(angle)*size） */
  function shadowCssVal(cfg, alpha) {
    if (!cfg || !cfg.shadowEnabled) return 'none';
    var a = (typeof cfg.shadowAngle === 'number' && isFinite(cfg.shadowAngle)) ? cfg.shadowAngle : 0;
    var rad = a * Math.PI / 180;
    var x = Math.round(Math.sin(rad) * cfg.shadowSize);
    var y = Math.round(Math.cos(rad) * cfg.shadowSize);
    return x + 'px ' + y + 'px ' + cfg.shadowBlur + 'px rgba(0,0,0,' + (typeof alpha === 'number' ? alpha : 0.16) + ')';
  }
  /* 生成某气泡的完整聊天 CSS：含 self/other 两个方向 */
  function bubbleCssFor(cfg) {
    var id = cfg.id;
    var ts = cfg.tailSize;
    var tailColor = (cfg.borderWidth > 0 && cfg.borderColor) ? cfg.borderColor : cfg.bgColor;
    var shadow = 'box-shadow:' + shadowCssVal(cfg) + ';';
    var border = cfg.borderWidth > 0 ? (cfg.borderWidth + 'px solid ' + cfg.borderColor) : 'none';
    var css = '';
    css += '.message-bubble.bub-' + id + '{'
      + 'border-radius:' + cfg.radius + 'px;'
      + 'max-width:' + cfg.maxWidth + 'px;'
      + 'padding:' + cfg.padding + 'px;'
      + 'background:' + cfg.bgColor + ';'
      + 'color:' + cfg.textColor + ';'
      + 'border:' + border + ';'
      + shadow
      + '}';
    if (cfg.tailEnabled) {
      var selfSide = (cfg.tailPos === 'bl') ? 'left' : 'right';
      var selfBorder = (cfg.tailPos === 'bl') ? 'borderRight' : 'borderLeft';
      var otherSide = (selfSide === 'right') ? 'left' : 'right';
      var otherBorder = (selfBorder === 'borderLeft') ? 'borderRight' : 'borderLeft';
      css += '.message-row.self .message-bubble.bub-' + id + '::after{'
        + 'content:"";position:absolute;top:50%;transform:translateY(-50%);'
        + selfSide + ':-' + ts + 'px;width:0;height:0;'
        + selfBorder + ':' + ts + 'px solid ' + tailColor + ';'
        + 'borderTop:' + Math.round(ts * 0.62) + 'px solid transparent;'
        + 'borderBottom:' + Math.round(ts * 0.62) + 'px solid transparent;'
        + '}';
      css += '.message-row.other .message-bubble.bub-' + id + '::after{'
        + 'content:"";position:absolute;top:50%;transform:translateY(-50%);'
        + otherSide + ':-' + ts + 'px;width:0;height:0;'
        + otherBorder + ':' + ts + 'px solid ' + tailColor + ';'
        + 'borderTop:' + Math.round(ts * 0.62) + 'px solid transparent;'
        + 'borderBottom:' + Math.round(ts * 0.62) + 'px solid transparent;'
        + '}';
    } else {
      css += '.message-row.self .message-bubble.bub-' + id + '::after,'
        + '.message-row.other .message-bubble.bub-' + id + '::after{display:none;}';
    }
    return css;
  }
  function ensureBubbleStyle(cfg) {
    if (!cfg || !cfg.id) return;
    var st = ensureStyleEl();
    if (st.textContent.indexOf('.bub-' + cfg.id) !== -1) return;
    st.textContent += bubbleCssFor(cfg);
  }
  /* CSS 款作用域化：把用户粘贴的选择器限定到 .bub-css-<id> 专属命名空间，避免多条 CSS 互相串扰 */
  function scopeCss(cfg) {
    if (!cfg || !cfg.cssCode) return '';
    var code = cfg.cssCode;
    var ns = '.bub-css-' + cfg.id;
    if (cfg.wechat) {
      // 先替换长选择器，再替换 .message（负向断言避免误伤 .message-sent 等子串）
      code = code.replace(/\.message-sent/g, ns + '.message-sent');
      code = code.replace(/\.message-received/g, ns + '.message-received');
      code = code.replace(/\.message(?![\-\w])/g, ns + '.message');
      return code;
    }
    // 非微信：把用户自定义类名（cssClass）的选择器限定到命名空间内
    var cls = cfg.cssClass;
    if (cls) {
      var re = new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g');
      code = code.replace(re, ns + '.' + cls);
    }
    return code;
  }
  var _injectedCss = {};
  /* 注入某 CSS 款气泡的作用域化样式（幂等：同 id 不重复注入；force 时先移除旧段再重灌） */
  function ensureCssBubbleStyle(cfg, force) {
    if (!cfg || cfg.source !== 'css' || !cfg.cssCode) return;
    var key = 'css_' + cfg.id;
    if (!force && _injectedCss[key]) return;
    var st = ensureStyleEl();
    var mark = '/*bub-css-' + cfg.id + '*/';
    if (st.textContent.indexOf(mark) !== -1) {
      st.textContent = st.textContent.split(mark + '\n').join('');
    }
    var scoped = scopeCss(cfg);
    if (!scoped) return;
    st.textContent += '\n' + mark + '\n' + scoped;
    _injectedCss[key] = true;
  }
  function rebuildAllStyles() {
    var st = ensureStyleEl();
    st.textContent = '';
    _injectedCss = {};
    var list = getBubbles();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.source === 'css') {
        ensureCssBubbleStyle(c, true);
      } else {
        st.textContent += bubbleCssFor(c);
      }
    }
  }

  /* ================= 聊天渲染接口（chat.js 调用，接口保持兼容） ================= */
  function getBubbleForMsg(msg, isSelf) {
    try {
      var assignments = getAssignments();
      var chatId = '';
      var roomEl = el('page-chat-room');
      if (roomEl) chatId = roomEl.dataset.chatId || '';
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
    var hasDeco = !!(cfg.decoration && (cfg.decoration.url || (cfg.decoration.type === 'symbol' && cfg.decoration.text)));
    if (cfg.source === 'css') {
      try { ensureCssBubbleStyle(cfg); } catch (e) {}
      if (hasDeco) {
        try { ensureDecoMargin(cfg); } catch (e) {}
      }
      if (cfg.wechat) {
        return { extraCls: ' bub-css-' + cfg.id + ' message message-' + (isSelf ? 'sent' : 'received') + (hasDeco ? ' bub-has-deco' : ''), deco: hasDeco ? buildDecoHtml(cfg) : '', ears: '' };
      }
      return { extraCls: ' bub-css-' + cfg.id + ' ' + (cfg.cssClass || '') + (hasDeco ? ' bub-has-deco' : ''), deco: hasDeco ? buildDecoHtml(cfg) : '', ears: '' };
    }
    try { ensureBubbleStyle(cfg); } catch (e) {}
    if (hasDeco) {
      try { ensureDecoMargin(cfg); } catch (e) {}
    }
    return {
      extraCls: ' bub-' + cfg.id + (hasDeco ? ' bub-has-deco' : ''),
      deco: hasDeco ? buildDecoHtml(cfg) : '',
      ears: ''
    };
  }
  /* 带装饰气泡：在聊天中为下方时间戳让位（按装饰尺寸与下侧锚点自适应 margin-bottom） */
  function ensureDecoMargin(cfg) {
    if (!cfg || !cfg.decoration) return;
    var st = ensureStyleEl();
    var idCls = (cfg.source === 'css' ? 'bub-css-' : 'bub-') + cfg.id;
    var size = clampNum(cfg.decoration.size, 16, 80);
    var anchor = isValidAnchor(cfg.decoration.anchor) ? cfg.decoration.anchor : 'tr';
    var mb = (anchor === 'bl' || anchor === 'br') ? (Math.round(size / 2) + 6) : 4;
    var mark = '/*bub-deco-margin-' + cfg.id + '*/';
    var idx = st.textContent.indexOf(mark);
    if (idx !== -1) {
      var segStart = st.textContent.lastIndexOf('\n', idx);
      var segEnd = st.textContent.indexOf('\n', idx + mark.length);
      if (segEnd === -1) segEnd = st.textContent.length;
      st.textContent = st.textContent.slice(0, segStart + 1) + st.textContent.slice(segEnd + 1);
    }
    st.textContent += '\n' + mark + '\n.message-row .message-bubble.' + idCls + '.bub-has-deco{margin-bottom:' + mb + 'px;}';
  }
  /* 装饰物 HTML：绝对定位在气泡四角（图片用背景，符号用文本） */
  function buildDecoHtml(cfg) {
    if (!cfg || !cfg.decoration) return '';
    var sz = clampNum(cfg.decoration.size, 16, 80);
    var st = decoStyleFor(cfg.decoration);
    var isSymbol = cfg.decoration.type === 'symbol' && cfg.decoration.text;
    if (isSymbol) {
      var t = esc(cfg.decoration.text).replace(/\s+/g, ' ');
      return '<span class="bub-deco" style="' + st + 'font-size:' + sz + 'px;line-height:1;white-space:nowrap;text-align:center;">' + t + '</span>';
    }
    if (!cfg.decoration.url) return '';
    return '<span class="bub-deco" style="' + st + 'width:' + sz + 'px;height:' + sz + 'px;background-image:url(' + cfg.decoration.url + ');background-size:contain;background-repeat:no-repeat;background-position:center;"></span>';
  }

  /* ================= 制作页状态 ================= */
  var _bound = false;
  var _state = {
    editingId: null,
    text: '嗨，今天过得怎么样？',
    tailPos: 'br',
    decoration: null,
    decoSize: 36,
    decoAnchor: 'tr',
    shadowAngle: 0,
    shadowBlur: 16
  };

  /* ================= 预览渲染 ================= */
  function renderPreview() {
    var bubble = el('bm-preview-bubble');
    if (!bubble) return;
    var cfg = _state;
    bubble.textContent = _state.text || ' ';
    bubble.style.borderRadius = cfg.radius + 'px';
    bubble.style.maxWidth = cfg.maxWidth + 'px';
    bubble.style.padding = cfg.padding + 'px';
    bubble.style.background = cfg.bgColor;
    bubble.style.color = cfg.textColor;
    bubble.style.border = cfg.borderWidth > 0 ? (cfg.borderWidth + 'px solid ' + cfg.borderColor) : 'none';
    bubble.style.boxShadow = shadowCssVal(cfg);
    // 尖角（预览为我方视角）
    bubble.classList.toggle('bm-tail', !!cfg.tailEnabled);
    bubble.classList.toggle('bm-tail-right', !!cfg.tailEnabled && cfg.tailPos === 'br');
    bubble.classList.toggle('bm-tail-left', !!cfg.tailEnabled && cfg.tailPos === 'bl');
    bubble.style.setProperty('--bm-tail-size', cfg.tailSize + 'px');
    bubble.style.setProperty('--bm-tail-color', (cfg.borderWidth > 0 ? cfg.borderColor : cfg.bgColor));
    // 装饰
    var deco = bubble.querySelector('.bm-preview-deco');
    var hasDeco = cfg.decoration && (cfg.decoration.url || (cfg.decoration.type === 'symbol' && cfg.decoration.text));
    if (hasDeco) {
      if (!deco) {
        deco = document.createElement('span');
        deco.className = 'bm-preview-deco';
        bubble.appendChild(deco);
      }
      var dcfg = { size: cfg.decoration.size, anchor: isValidAnchor(cfg.decoAnchor) ? cfg.decoAnchor : (isValidAnchor(cfg.decoration.anchor) ? cfg.decoration.anchor : 'tr') };
      if (cfg.decoration.type === 'symbol' && cfg.decoration.text) {
        deco.textContent = cfg.decoration.text;
        deco.style.cssText = decoStyleFor(dcfg)
          + 'font-size:' + dcfg.size + 'px;line-height:1;white-space:nowrap;text-align:center;';
      } else {
        deco.textContent = '';
        deco.style.cssText = decoStyleFor(dcfg)
          + 'width:' + dcfg.size + 'px;height:' + dcfg.size + 'px;'
          + 'background-image:url(' + cfg.decoration.url + ');'
          + 'background-size:contain;background-repeat:no-repeat;background-position:center;';
      }
      deco.style.display = 'block';
    } else if (deco) {
      deco.style.display = 'none';
    }
  }

  /* ================= 控件同步 ================= */
  function syncLabel(valId, val, suffix) {
    var node = el(valId);
    if (node) node.textContent = val + (suffix || '');
  }
  function setControl(id, value) {
    var node = el(id);
    if (node) node.value = value;
  }
  function setChecked(id, checked) {
    var node = el(id);
    if (node) node.checked = !!checked;
  }
  /* 把当前配置写回控件（进入页面 / 编辑时） */
  function applyCfgToControls() {
    setControl('bm-text', _state.text);
    setControl('bm-radius', _state.radius);
    syncLabel('bm-radius-val', _state.radius, 'px');
    setControl('bm-maxwidth', _state.maxWidth);
    syncLabel('bm-maxwidth-val', _state.maxWidth, 'px');
    setControl('bm-padding', _state.padding);
    syncLabel('bm-padding-val', _state.padding, 'px');
    setControl('bm-bg-color', _state.bgColor);
    setControl('bm-text-color', _state.textColor);
    setControl('bm-border-width', _state.borderWidth);
    syncLabel('bm-border-val', _state.borderWidth, 'px');
    setControl('bm-border-color', _state.borderColor);
    setChecked('bm-shadow-enabled', _state.shadowEnabled);
    setControl('bm-shadow-size', _state.shadowSize);
    syncLabel('bm-shadow-val', _state.shadowSize, 'px');
    setControl('bm-shadow-blur', _state.shadowBlur);
    syncLabel('bm-shadow-blur-val', _state.shadowBlur, 'px');
    setControl('bm-shadow-angle', _state.shadowAngle);
    syncLabel('bm-shadow-angle-val', _state.shadowAngle, '°');
    setChecked('bm-tail-enabled', _state.tailEnabled);
    setControl('bm-tail-size', _state.tailSize);
    syncLabel('bm-tail-val', _state.tailSize, 'px');
    // 尖角位置分段按钮
    var seg = el('bm-tail-pos');
    if (seg) {
      var btns = seg.querySelectorAll('.bm-seg-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-pos') === _state.tailPos);
      }
    }
    setControl('bm-deco-size', _state.decoSize);
    syncLabel('bm-decosize-val', _state.decoSize, 'px');
    // 装饰锚点分段按钮
    var anchorSeg = el('bm-deco-anchor');
    if (anchorSeg) {
      var abtns = anchorSeg.querySelectorAll('.bm-seg-btn');
      for (var i = 0; i < abtns.length; i++) {
        abtns[i].classList.toggle('active', abtns[i].getAttribute('data-anchor') === _state.decoAnchor);
      }
    }
    setControl('bm-name', _state.editingId ? (getBubbleById(_state.editingId) || {}).name || '' : '');
    // 取消编辑按钮
    var cancelBtn = el('bm-save-cancel');
    if (cancelBtn) cancelBtn.style.display = _state.editingId ? 'block' : 'none';
    renderDecoCurrent();
  }
  /* 从控件读取当前配置 */
  function readControls() {
    _state.text = textVal('bm-text', '嗨，今天过得怎么样？');
    _state.radius = Math.round(intVal('bm-radius', 16));
    _state.maxWidth = Math.round(intVal('bm-maxwidth', 260));
    _state.padding = Math.round(intVal('bm-padding', 12));
    _state.bgColor = textVal('bm-bg-color', '#B8DCF0');
    _state.textColor = textVal('bm-text-color', '#3A4050');
    _state.borderWidth = Math.round(intVal('bm-border-width', 0));
    _state.borderColor = textVal('bm-border-color', '#4C9AFF');
    _state.shadowEnabled = boolVal('bm-shadow-enabled', true);
    _state.shadowSize = Math.round(intVal('bm-shadow-size', 8));
    _state.shadowBlur = Math.round(intVal('bm-shadow-blur', 16));
    _state.shadowAngle = Math.round(intVal('bm-shadow-angle', 0));
    _state.tailEnabled = boolVal('bm-tail-enabled', true);
    _state.tailSize = Math.round(intVal('bm-tail-size', 10));
    _state.decoSize = Math.round(intVal('bm-deco-size', 36));
  }

  /* ================= 装饰 ================= */
  function renderDecoCurrent() {
    var box = el('bm-deco-current');
    var thumb = el('bm-deco-thumb');
    var nameEl = el('bm-deco-name');
    if (!box || !thumb) return;
    if (_state.decoration && (_state.decoration.url || (_state.decoration.type === 'symbol' && _state.decoration.text))) {
      box.style.display = 'flex';
      if (_state.decoration.type === 'symbol' && _state.decoration.text) {
        thumb.innerHTML = '<span class="bm-deco-symbol-thumb">' + esc(_state.decoration.text) + '</span>';
        if (nameEl) nameEl.textContent = '装饰符号';
      } else {
        thumb.innerHTML = '<img src="' + _state.decoration.url + '" alt="装饰">';
        if (nameEl) nameEl.textContent = '装饰图片';
      }
    } else {
      box.style.display = 'none';
      thumb.innerHTML = '';
    }
  }
  function addDecoUrl(url) {
    url = (url || '').trim();
    if (!url) { toast('请粘贴图片 URL'); return; }
    _state.decoration = { type: 'image', url: url, size: _state.decoSize, anchor: _state.decoAnchor };
    renderPreview();
    renderDecoCurrent();
    setControl('bm-deco-url', '');
    toast('装饰已添加');
  }
  function addDecoSymbol() {
    var raw = (textVal('bm-deco-symbol', '') || '').trim();
    if (!raw) { toast('请输入文字或 emoji 作为装饰'); return; }
    _state.decoration = { type: 'symbol', text: raw, size: _state.decoSize, anchor: _state.decoAnchor };
    renderPreview();
    renderDecoCurrent();
    setControl('bm-deco-symbol', '');
    toast('符号装饰已添加');
  }
  function handleDecoFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    var isGif = /^image\/gif$/i.test(file.type) || /\.gif$/i.test((file.name || '').toLowerCase());
    var reader = new FileReader();
    reader.onload = function(e) {
      var url = e.target.result || '';
      // GIF 动图：保留原始 dataURL 不做 canvas 压缩（canvas 会丢失动画帧）
      if (isGif) {
        _state.decoration = { type: 'image', url: url, size: _state.decoSize, anchor: _state.decoAnchor };
        renderPreview();
        renderDecoCurrent();
        toast('装饰已添加');
        return;
      }
      // 本地图片压缩到 200KB 内，避免撑爆 localStorage
      var img = new Image();
      img.onload = function() {
        try {
          var maxSide = 200;
          var w = img.width, h = img.height;
          var scale = 1;
          if (Math.max(w, h) > maxSide) scale = maxSide / Math.max(w, h);
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/png');
          if (dataUrl.length > 200 * 1024) dataUrl = url; // 压缩失败则用原图
          _state.decoration = { type: 'image', url: dataUrl, size: _state.decoSize, anchor: _state.decoAnchor };
          renderPreview();
          renderDecoCurrent();
          toast('装饰已添加');
        } catch (err) {
          _state.decoration = { type: 'image', url: url, size: _state.decoSize, anchor: _state.decoAnchor };
          renderPreview();
          renderDecoCurrent();
          toast('装饰已添加');
        }
      };
      img.onerror = function() {
        _state.decoration = { type: 'image', url: url, size: _state.decoSize, anchor: _state.decoAnchor };
        renderPreview();
        renderDecoCurrent();
        toast('装饰已添加');
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }

  /* ================= 事件绑定 ================= */
  function bindEvents() {
    var bindInput = function(id, valId, suffix, onChange) {
      var node = el(id);
      if (!node) return;
      node.addEventListener('input', function() {
        readControls();
        if (valId) syncLabel(valId, node.value, suffix);
        if (onChange) onChange();
        renderPreview();
      });
    };
    // 文本实时预览
    bindInput('bm-text', null, null, null);
    // 滑块参数
    bindInput('bm-radius', 'bm-radius-val', 'px', null);
    bindInput('bm-maxwidth', 'bm-maxwidth-val', 'px', null);
    bindInput('bm-padding', 'bm-padding-val', 'px', null);
    bindInput('bm-border-width', 'bm-border-val', 'px', null);
    bindInput('bm-shadow-size', 'bm-shadow-val', 'px', null);
    bindInput('bm-shadow-blur', 'bm-shadow-blur-val', 'px', null);
    bindInput('bm-shadow-angle', 'bm-shadow-angle-val', '°', null);
    bindInput('bm-tail-size', 'bm-tail-val', 'px', null);
    bindInput('bm-deco-size', 'bm-decosize-val', 'px', null);
    // 颜色选择器
    ['bm-bg-color', 'bm-text-color', 'bm-border-color'].forEach(function(id) {
      var node = el(id);
      if (!node) return;
      node.addEventListener('input', function() { readControls(); renderPreview(); });
    });
    // 开关
    ['bm-shadow-enabled', 'bm-tail-enabled'].forEach(function(id) {
      var node = el(id);
      if (!node) return;
      node.addEventListener('change', function() { readControls(); renderPreview(); });
    });
    // 尖角位置分段按钮
    var seg = el('bm-tail-pos');
    if (seg) {
      seg.addEventListener('click', function(e) {
        var btn = e.target.closest ? e.target.closest('.bm-seg-btn') : null;
        if (!btn) return;
        _state.tailPos = btn.getAttribute('data-pos') === 'bl' ? 'bl' : 'br';
        var btns = seg.querySelectorAll('.bm-seg-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].classList.toggle('active', btns[i] === btn);
        }
        renderPreview();
      });
    }
    // 装饰锚点分段按钮
    var anchorSeg = el('bm-deco-anchor');
    if (anchorSeg) {
      anchorSeg.addEventListener('click', function(e) {
        var btn = e.target.closest ? e.target.closest('.bm-seg-btn') : null;
        if (!btn) return;
        var a = btn.getAttribute('data-anchor');
        if (!a) return;
        _state.decoAnchor = a;
        var btns = anchorSeg.querySelectorAll('.bm-seg-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].classList.toggle('active', btns[i] === btn);
        }
        renderPreview();
      });
    }
    // 装饰上传
    var fileInput = el('bm-deco-file');
    if (fileInput) {
      fileInput.addEventListener('change', function() {
        handleDecoFile(fileInput.files && fileInput.files[0]);
        fileInput.value = '';
      });
    }
    var uploadBtn = el('bm-deco-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function() { if (fileInput) fileInput.click(); });
    }
    var urlAddBtn = el('bm-deco-url-add');
    if (urlAddBtn) {
      urlAddBtn.addEventListener('click', function() { addDecoUrl(textVal('bm-deco-url', '')); });
    }
    var urlInput = el('bm-deco-url');
    if (urlInput) {
      urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addDecoUrl(urlInput.value);
      });
    }
    // 符号装饰
    var symbolAddBtn = el('bm-deco-symbol-add');
    if (symbolAddBtn) {
      symbolAddBtn.addEventListener('click', function() { addDecoSymbol(); });
    }
    var symbolInput = el('bm-deco-symbol');
    if (symbolInput) {
      symbolInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addDecoSymbol();
      });
    }
    var removeBtn = el('bm-deco-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        _state.decoration = null;
        renderPreview();
        renderDecoCurrent();
        toast('已移除装饰');
      });
    }
    // 保存 / 取消编辑
    var saveBtn = el('bm-save');
    if (saveBtn) saveBtn.addEventListener('click', saveBubble);
    var cancelBtn = el('bm-save-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);
    // 商城页按钮
    var newBtn = el('bs-new-maker');
    if (newBtn) newBtn.addEventListener('click', openNew);
    var cssSave = el('bs-css-save');
    if (cssSave) cssSave.addEventListener('click', saveCssBubble);
    var assignCancel = el('bs-assign-cancel');
    if (assignCancel) assignCancel.addEventListener('click', closeAssign);
    var assignSave = el('bs-assign-save');
    if (assignSave) assignSave.addEventListener('click', saveAssign);
    var assignOverlay = el('bs-assign-overlay');
    if (assignOverlay) {
      assignOverlay.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'bs-assign-overlay') closeAssign();
      });
    }
    var renameCancel = el('bs-rename-cancel');
    if (renameCancel) renameCancel.addEventListener('click', closeRename);
    var renameSave = el('bs-rename-save');
    if (renameSave) renameSave.addEventListener('click', doRename);
    var renameOverlay = el('bs-rename-overlay');
    if (renameOverlay) {
      renameOverlay.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'bs-rename-overlay') closeRename();
      });
    }
    var renameInput = el('bs-rename-input');
    if (renameInput) {
      renameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doRename(); });
    }
  }

  /* ================= 保存 / 编辑 ================= */
  function saveBubble() {
    readControls();
    var name = (textVal('bm-name', '') || '').trim();
    if (!name) { toast('请先输入气泡名称'); el('bm-name') && el('bm-name').focus(); return; }
    var list = getBubbles();
    var cfg = {
      id: _state.editingId || ('bub_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
      name: name,
      source: 'maker',
      radius: _state.radius,
      maxWidth: _state.maxWidth,
      padding: _state.padding,
      bgColor: _state.bgColor,
      textColor: _state.textColor,
      borderWidth: _state.borderWidth,
      borderColor: _state.borderColor,
      shadowEnabled: _state.shadowEnabled,
      shadowSize: _state.shadowSize,
      shadowBlur: _state.shadowBlur,
      shadowAngle: _state.shadowAngle,
      tailEnabled: _state.tailEnabled,
      tailSize: _state.tailSize,
      tailPos: _state.tailPos,
      decoration: _state.decoration ? {
        type: _state.decoration.type === 'symbol' ? 'symbol' : 'image',
        url: _state.decoration.url || undefined,
        text: _state.decoration.type === 'symbol' ? (_state.decoration.text || '') : undefined,
        size: _state.decoSize,
        anchor: isValidAnchor(_state.decoAnchor) ? _state.decoAnchor : 'tr'
      } : null,
      createdAt: _state.editingId ? ((getBubbleById(_state.editingId) || {}).createdAt || Date.now()) : Date.now()
    };
    if (_state.editingId) {
      var idx = -1;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === _state.editingId) { idx = i; break; }
      }
      if (idx >= 0) list[idx] = cfg;
      else list.push(cfg);
    } else {
      list.push(cfg);
    }
    setBubbles(list);
    try { rebuildAllStyles(); } catch (e) {}
    toast('气泡已保存至气泡商城');
    _state.editingId = null;
    // 跳转到商城展示
    if (window.Navigation && typeof Navigation.navigateTo === 'function') {
      Navigation.navigateTo('bubble-shop');
    } else if (window.renderBubbleShop) {
      window.renderBubbleShop();
    }
  }
  function cancelEdit() {
    _state.editingId = null;
    _state.decoration = null;
    _state.tailPos = 'br';
    _state.decoAnchor = 'tr';
    resetStateDefaults();
    applyCfgToControls();
    renderPreview();
    toast('已取消编辑');
  }
  function resetStateDefaults() {
    var d = defaultCfg();
    _state.radius = d.radius;
    _state.maxWidth = d.maxWidth;
    _state.padding = d.padding;
    _state.bgColor = d.bgColor;
    _state.textColor = d.textColor;
    _state.borderWidth = d.borderWidth;
    _state.borderColor = d.borderColor;
    _state.shadowEnabled = d.shadowEnabled;
    _state.shadowSize = d.shadowSize;
    _state.shadowBlur = d.shadowBlur;
    _state.shadowAngle = d.shadowAngle;
    _state.tailEnabled = d.tailEnabled;
    _state.tailSize = d.tailSize;
    _state.decoSize = 36;
    _state.decoAnchor = 'tr';
    _state.text = '嗨，今天过得怎么样？';
  }

  /* ================= 制作页渲染入口 ================= */
  function renderBubbleMaker() {
    var wrap = el('page-bubble-maker');
    if (!wrap) return;
    if (!_bound) { bindEvents(); _bound = true; }
    // 编辑模式：控件保持当前 _state；新进入：重置默认
    if (!_state.editingId && !_state._fromEdit) {
      resetStateDefaults();
      _state.decoration = null;
      _state.tailPos = 'br';
      _state.decoAnchor = 'tr';
    }
    _state._fromEdit = false;
    applyCfgToControls();
    renderPreview();
  }

  /* ================= 商城页 ================= */
  function renderBubbleShop() {
    if (!_bound) { bindEvents(); _bound = true; }
    var makerGrid = el('bs-grid-all');
    var cssGrid = el('bs-grid-css');
    var list = getBubbles();
    var makers = [];
    var cssList = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].source === 'css') cssList.push(list[i]);
      else makers.push(list[i]);
    }
    // 我的气泡
    if (makerGrid) {
      if (!makers.length) {
        makerGrid.innerHTML = '<div class="bs-empty">还没有气泡，点击右上角「+ 制作新气泡」开始创作</div>';
      } else {
        var mh = '';
        for (var m = 0; m < makers.length; m++) {
          var mc = makers[m];
          mh += '<div class="bs-card">'
            + '<div class="bs-card-preview">' + miniBubbleStripHtml(mc) + '</div>'
            + '<div class="bs-card-name">' + esc(mc.name) + '</div>'
            + '<div class="bs-card-actions">'
            + '<button class="bs-card-btn" onclick="BubbleMakerAssign(\'' + mc.id + '\')">指派</button>'
            + '<button class="bs-card-btn primary" onclick="BubbleMakerOpenEdit(\'' + mc.id + '\')">编辑</button>'
            + '<button class="bs-card-btn danger" onclick="BubbleMakerDelete(\'' + mc.id + '\')">删除</button>'
            + '</div>'
            + '</div>';
        }
        makerGrid.innerHTML = mh;
      }
    }
    // CSS 气泡
    if (cssGrid) {
      if (!cssList.length) {
        cssGrid.innerHTML = '<div class="bs-empty">还没有 CSS 气泡，粘贴 CSS 代码创建</div>';
      } else {
        var ch = '';
        for (var c = 0; c < cssList.length; c++) {
          var cc = cssList[c];
          ch += '<div class="bs-card">'
            + '<div class="bs-card-preview">' + miniBubbleStripHtml(cc) + '</div>'
            + '<div class="bs-card-name">' + esc(cc.name) + '</div>'
            + '<div class="bs-card-actions">'
            + '<button class="bs-card-btn" onclick="BubbleMakerAssign(\'' + cc.id + '\')">指派</button>'
            + '<button class="bs-card-btn danger" onclick="BubbleMakerDelete(\'' + cc.id + '\')">删除</button>'
            + '</div>'
            + '</div>';
        }
        cssGrid.innerHTML = ch;
      }
    }
  }
  /* 商城预览：横条（左对方 / 右我方） */
  function miniBubbleStripHtml(cfg) {
    return '<div class="bs-strip">'
      + '<div class="bs-strip-side bs-strip-other">' + miniBubbleSingle(cfg, true) + '</div>'
      + '<div class="bs-strip-side bs-strip-self">' + miniBubbleSingle(cfg, false) + '</div>'
      + '</div>';
  }
  function miniBubbleSingle(cfg, isOther) {
    if (cfg.source === 'css') {
      try { ensureCssBubbleStyle(cfg); } catch (e) {}
      if (cfg.wechat) {
        var m = isOther ? 'recv message message-received' : 'sent message message-sent';
        return '<div class="bs-mini-msg ' + m + ' bub-css-' + cfg.id + '">气泡</div>';
      }
      return '<div class="bs-mini-bubble bub-css-' + cfg.id + ' ' + (cfg.cssClass || '') + '">气泡</div>';
    }
    var shadow = cfg.shadowEnabled ? ('box-shadow:' + shadowCssVal(cfg, 0.12) + ';') : '';
    var border = cfg.borderWidth > 0 ? (cfg.borderWidth + 'px solid ' + cfg.borderColor) : 'none';
    var tail = '';
    if (cfg.tailEnabled) {
      var ts = cfg.tailSize;
      var tailPos = isOther ? (cfg.tailPos === 'bl' ? 'br' : 'bl') : cfg.tailPos;
      var side = tailPos === 'bl' ? 'left' : 'right';
      var borderProp = side === 'left' ? 'border-right' : 'border-left';
      var tailColor = (cfg.borderWidth > 0) ? cfg.borderColor : cfg.bgColor;
      tail = '<span style="position:absolute;top:50%;transform:translateY(-50%);' + side + ':-' + ts + 'px;width:0;height:0;'
        + borderProp + ':' + ts + 'px solid ' + tailColor + ';'
        + 'border-top:' + Math.round(ts * 0.62) + 'px solid transparent;'
        + 'border-bottom:' + Math.round(ts * 0.62) + 'px solid transparent;"></span>';
    }
    var deco = '';
    if (cfg.decoration && (cfg.decoration.url || (cfg.decoration.type === 'symbol' && cfg.decoration.text))) {
      var sz = clampNum(cfg.decoration.size, 16, 80);
      var dcfg = { size: sz, anchor: isValidAnchor(cfg.decoration.anchor) ? cfg.decoration.anchor : 'tr' };
      if (cfg.decoration.type === 'symbol' && cfg.decoration.text) {
        deco = '<span style="' + decoStyleFor(dcfg) + 'font-size:' + sz + 'px;line-height:1;white-space:nowrap;text-align:center;">' + esc(cfg.decoration.text).replace(/\s+/g, ' ') + '</span>';
      } else {
        deco = '<span style="' + decoStyleFor(dcfg) + 'width:' + sz + 'px;height:' + sz + 'px;background-image:url(' + cfg.decoration.url + ');background-size:contain;background-repeat:no-repeat;background-position:center;"></span>';
      }
    }
    return '<div class="bs-mini-bubble" style="border-radius:' + cfg.radius + 'px;max-width:' + cfg.maxWidth + 'px;padding:' + cfg.padding + 'px;background:' + cfg.bgColor + ';color:' + cfg.textColor + ';border:' + border + ';' + shadow + '">气泡' + tail + deco + '</div>';
  }

  /* ================= 商城操作 ================= */
  function openNew() {
    _state.editingId = null;
    resetStateDefaults();
    _state.decoration = null;
    _state.tailPos = 'br';
    _state.decoAnchor = 'tr';
    _state._fromEdit = false;
    applyCfgToControls();
    renderPreview();
    if (window.Navigation) Navigation.navigateTo('bubble-maker');
  }
  function openEdit(id) {
    var cfg = getBubbleById(id);
    if (!cfg) return;
    _state.editingId = id;
    _state.radius = cfg.radius;
    _state.maxWidth = cfg.maxWidth;
    _state.padding = cfg.padding;
    _state.bgColor = cfg.bgColor;
    _state.textColor = cfg.textColor;
    _state.borderWidth = cfg.borderWidth;
    _state.borderColor = cfg.borderColor;
    _state.shadowEnabled = cfg.shadowEnabled;
    _state.shadowSize = cfg.shadowSize;
    _state.shadowBlur = cfg.shadowBlur;
    _state.shadowAngle = typeof cfg.shadowAngle === 'number' ? cfg.shadowAngle : 0;
    _state.tailEnabled = cfg.tailEnabled;
    _state.tailSize = cfg.tailSize;
    _state.tailPos = cfg.tailPos;
    _state.decoration = cfg.decoration ? {
      type: cfg.decoration.type === 'symbol' ? 'symbol' : 'image',
      url: cfg.decoration.url,
      text: cfg.decoration.type === 'symbol' ? (cfg.decoration.text || '') : undefined,
      size: cfg.decoration.size,
      anchor: isValidAnchor(cfg.decoration.anchor) ? cfg.decoration.anchor : 'tr'
    } : null;
    _state.decoSize = cfg.decoration ? cfg.decoration.size : 36;
    _state.decoAnchor = cfg.decoration ? (isValidAnchor(cfg.decoration.anchor) ? cfg.decoration.anchor : 'tr') : 'tr';
    _state.text = '嗨，今天过得怎么样？';
    _state._fromEdit = true;
    if (window.Navigation) Navigation.navigateTo('bubble-maker');
  }
  function deleteBubble(id) {
    var cfg = getBubbleById(id);
    if (!cfg) return;
    if (!window.confirm('确定删除气泡「' + (cfg.name || '') + '」吗？')) return;
    var list = getBubbles();
    var next = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) next.push(list[i]);
    }
    setBubbles(next);
    // 清理指派引用
    var assign = getAssignments();
    var changed = false;
    for (var k in assign) {
      if (assign[k] === id) { delete assign[k]; changed = true; }
    }
    if (changed) setAssignments(assign);
    try { rebuildAllStyles(); } catch (e) {}
    renderBubbleShop();
    toast('已删除气泡');
  }
  function renameBubble(id) {
    var cfg = getBubbleById(id);
    if (!cfg) return;
    _state._renameId = id;
    var overlay = el('bs-rename-overlay');
    var input = el('bs-rename-input');
    if (overlay) overlay.style.display = 'flex';
    if (input) { input.value = cfg.name || ''; input.focus(); }
  }
  function closeRename() {
    var overlay = el('bs-rename-overlay');
    if (overlay) overlay.style.display = 'none';
  }
  function doRename() {
    var id = _state._renameId;
    var input = el('bs-rename-input');
    if (!id || !input) return;
    var name = (input.value || '').trim();
    if (!name) { toast('请输入名称'); return; }
    var list = getBubbles();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list[i].name = name; break; }
    }
    setBubbles(list);
    closeRename();
    renderBubbleShop();
    toast('名称已更新');
  }

  /* ================= CSS 代码导入 ================= */
  function cssNameExists(name, list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return true;
    }
    return false;
  }
  function saveCssBubble() {
    var codeEl = el('bs-css-code');
    if (!codeEl) return;
    var code = (codeEl.value || '').trim();
    if (!code) {
      toast('请先粘贴 CSS 代码');
      return;
    }
    // 提取类名：取代码中第一个 .xxx 类选择器
    var clsMatch = code.match(/\.([A-Za-z_][\w-]*)/);
    if (!clsMatch) {
      toast('CSS 中未找到类名，请粘贴形如 .my-bubble { ... } 的代码');
      return;
    }
    var cssClass = clsMatch[1];
    // 微信风格检测：同时含 .message-sent 与 .message-received 选择器（带前瞻避免误判 message-sentinel 等前缀类）
    var wechat = /\.message-sent(?=[\s,{.:])/.test(code) && /\.message-received(?=[\s,{.:])/.test(code);
    var list = getBubbles();
    // 同名自动编号
    var baseName = cssClass;
    var name = baseName;
    var seq = 2;
    while (cssNameExists(name, list)) {
      name = baseName + ' ' + seq;
      seq++;
    }
    var cfg = {
      id: 'bub_css_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name,
      source: 'css',
      cssCode: code,
      cssClass: wechat ? 'message' : cssClass,
      wechat: !!wechat,
      createdAt: Date.now()
    };
    // 先写入，再读取校验（防假成功）
    list.push(cfg);
    setBubbles(list);
    var saved = getBubbles().some(function(b) { return b.id === cfg.id; });
    if (!saved) {
      // 回滚
      var rollback = getBubbles().filter(function(b) { return b.id !== cfg.id; });
      setBubbles(rollback);
      toast('保存失败，请重试');
      return;
    }
    try { rebuildAllStyles(); } catch (e) {}
    if (codeEl) codeEl.value = '';
    renderBubbleShop();
    toast('CSS 气泡已保存至气泡商城');
  }

  /* ================= 指派 ================= */
  var _assignOpen = false;
  function openAssign(id) {
    var cfg = getBubbleById(id);
    if (!cfg) return;
    var overlay = el('bs-assign-overlay');
    var nameEl = el('bs-assign-name');
    var box = el('bs-assign-targets');
    if (!overlay || !box) return;
    _assignOpen = true;
    if (nameEl) nameEl.textContent = '「' + (cfg.name || '') + '」';
    box.innerHTML = '';
    var assign = getAssignments();
    var bubbles = getBubbles();
    var allPartners = [];
    try { allPartners = Storage.getPartnerProfiles() || []; } catch (e) {}

    var targets = [{ key: 'self', label: '我方', sub: '我的消息' }];
    for (var i = 0; i < allPartners.length; i++) {
      targets.push({ key: allPartners[i].id, label: allPartners[i].nickname || '角色', sub: '对方 / 角色' });
    }

    for (var t = 0; t < targets.length; t++) {
      var tr = targets[t];
      var row = document.createElement('div');
      row.className = 'bs-assign-item';
      row.setAttribute('data-key', tr.key);
      var label = document.createElement('span');
      label.className = 'bs-assign-label';
      label.innerHTML = esc(tr.label) + '<small>' + esc(tr.sub) + '</small>';
      var sel = document.createElement('select');
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '默认气泡（不指定）';
      sel.appendChild(opt0);
      for (var b = 0; b < bubbles.length; b++) {
        var o = document.createElement('option');
        o.value = bubbles[b].id;
        o.textContent = bubbles[b].name;
        if (assign[tr.key] === bubbles[b].id) o.selected = true;
        sel.appendChild(o);
      }
      row.appendChild(label);
      row.appendChild(sel);
      box.appendChild(row);
    }
    overlay.style.display = 'flex';
  }
  function closeAssign() {
    var overlay = el('bs-assign-overlay');
    if (overlay) overlay.style.display = 'none';
    _assignOpen = false;
  }
  function saveAssign() {
    if (!_assignOpen) return;
    var box = el('bs-assign-targets');
    var rows = box.querySelectorAll('.bs-assign-item');
    var assign = getAssignments();
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-key');
      var sel = rows[i].querySelector('select');
      if (!key || !sel) continue;
      if (sel.value) assign[key] = sel.value;
      else delete assign[key];
    }
    setAssignments(assign);
    closeAssign();
    toast('指派已保存');
  }

  /* ================= 初始化 ================= */
  function init() {
    try { rebuildAllStyles(); } catch (e) {}
    window.addEventListener('mirror-storage-synced', function() {
      try { rebuildAllStyles(); } catch (e) {}
    });
    window.addEventListener('mirror-storage-restored', function() {
      try { rebuildAllStyles(); } catch (e) {}
    });
  }

  /* ================= 对外接口 ================= */
  return {
    getBubbles: getBubbles,
    getAssignments: getAssignments,
    buildBubbleExt: buildBubbleExt,
    rebuildAllStyles: rebuildAllStyles,
    renderBubbleMaker: renderBubbleMaker,
    renderBubbleShop: renderBubbleShop,
    openNew: openNew,
    openEdit: openEdit,
    deleteBubble: deleteBubble,
    openAssign: openAssign,
    openRename: renameBubble,
    saveRename: doRename,
    init: init
  };
})();

/* ===== window 挂载（供 navigation.js / 内联 onclick 调用） ===== */
window.BubbleMaker = BubbleMaker;
window.renderBubbleMaker = function() { BubbleMaker.renderBubbleMaker(); };
window.renderBubbleShop = function() { BubbleMaker.renderBubbleShop(); };
window.BubbleMakerOpenNew = function() { BubbleMaker.openNew(); };
window.BubbleMakerOpenEdit = function(id) { BubbleMaker.openEdit(id); };
window.BubbleMakerDelete = function(id) { BubbleMaker.deleteBubble(id); };
window.BubbleMakerAssign = function(id) { BubbleMaker.openAssign(id); };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { BubbleMaker.init(); });
} else {
  BubbleMaker.init();
}
