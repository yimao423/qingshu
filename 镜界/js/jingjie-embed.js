/* ============================================================================
 * 镜界嵌入桥接（镜界侧）
 * 检测是否被 iframe 嵌入（window.self !== window.top）
 * 嵌入时显示首页顶部的「返回拾心界」按钮
 * 点击后 postMessage + 兜底调用父级 __shxjBackJingJie__
 * 独立打开时不显示按钮，不影响原有功能
 * ==========================================================================*/
(function () {
  'use strict';

  var BTN_ID = 'btn-back-shxj';
  var btnNode = null;

  function getButton() {
    if (btnNode && document.body && document.body.contains(btnNode)) return btnNode;
    btnNode = document.getElementById(BTN_ID);
    return btnNode;
  }

  function isEmbedded() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return false;
    }
  }

  function backToShixinjie() {
    // 主通道：postMessage 通知父窗口
    try {
      if (window.parent) {
        window.parent.postMessage({ type: 'back-to-shixinjie' }, '*');
      }
    } catch (e) { /* 忽略 */ }

    // 兜底：父级暴露的全局回退函数
    try {
      var p = (typeof window.parent !== 'undefined' && window.parent) ? window.parent : (window.top || null);
      if (p && typeof p['__shxjBackJingJie__'] === 'function') {
        p['__shxjBackJingJie__']();
      }
    } catch (e) { /* 忽略 */ }
  }

  // 嵌入态整体布局优化（仅被拾心界嵌入时生效）：
  // 1) 返回按钮改为左上角小圆形箭头钮，与镜界内部返回钮风格统一、不突兀；
  // 2) 首页首屏顶部空白压缩，让「今日卦运」等内容上移；
  // 3) 牌意/设置等各页面顶栏顶部空白统一压缩，整体更和谐。
  function applyCompactLayout() {
    // —— 返回按钮：绝对定位到首页标题区左上角，先确保定位容器为 relative ——
    var header = document.querySelector('#page-home .pt-12');
    if (header) {
      header.style.position = 'relative';
      header.style.paddingTop = '24px';
      header.style.paddingBottom = '6px';
    }
    var btn = getButton();
    if (btn) {
      btn.style.position = 'absolute';
      btn.style.top = '28px';
      btn.style.left = '12px';
      btn.style.zIndex = '50';
      btn.style.margin = '0';
      btn.style.padding = '0';
      btn.style.width = '36px';
      btn.style.height = '36px';
      btn.style.borderRadius = '9999px';
      btn.style.fontSize = '0'; // 兜底隐藏可能遗留的文字
    }

    // —— 首页首屏模块间距收紧 ——
    var fortune = document.querySelector('#page-home > .px-5.mt-4');
    if (fortune) fortune.style.marginTop = '14px';

    // —— 统一压缩各页面顶栏顶部空白（牌意/设置/我的牌组等 pt-8 顶栏）——
    var headers = document.querySelectorAll('#app .page > .px-5.pt-8');
    for (var i = 0; i < headers.length; i++) {
      headers[i].style.paddingTop = '6px';
      headers[i].style.paddingBottom = '4px';
    }
  }

  // 嵌入态「拾心界皮肤」（仅被拾心界嵌入时生效）：
  // 1) 除欢迎页（#splash-screen 有独立 .splash-bg 背景）外，整个界面背景改为与镜界欢迎页
  //    同款的渐变（--theme-bg-splash，跟随当前主题），并隐藏自带径向光斑，视觉更显层次；
  // 2) 各区域顶栏 / 底栏遵循拾心界主界面的沉浸式规则：顶栏去掉下描边与硬阴影融于背景，
  //    底栏改为「透明底 + 页面同渐变固定」实现与背景像素级无缝，去掉上描边、毛玻璃与阴影；
  // 3) 功能卡片 / 面板统一去掉描边。
  // 所有覆盖仅在嵌入态注入，独立打开镜界时保持原有玻璃拟态风格。
  function applyShixinjieSkin() {
    if (document.getElementById('shxj-skin-style')) return;
    // 背景直接用欢迎页渐变变量，随主题自动联动
    var splashGradient = 'var(--theme-bg-splash)';

    var style = document.createElement('style');
    style.id = 'shxj-skin-style';
    style.textContent =
      '/* ===== 嵌入态拾心界皮肤：背景 / 顶底栏沉浸 / 去描边 ===== */' +
      'html, body {' +
      '  background: ' + splashGradient + ' fixed !important;' +
      '}' +
      '.bg-pattern { background-image: none !important; }' +
      /* 页面容器去掉自带纯色底（bg-bg-main），避免浅色底板盖住渐变造成颜色分层 */
      '.bg-bg-main { background-color: transparent !important; }' +
      /* 各区域顶栏：背景改为欢迎页同款渐变 fixed（不透明度100%且与底图像素级无缝，
         去掉半透明白/毛玻璃产生的灰白雾感遮罩），并去下描边与硬阴影 */
      '.page-header-solid, .divine-top-bar, .deck-detail-header {' +
      '  background: ' + splashGradient + ' fixed !important;' +
      '  -webkit-backdrop-filter: none !important;' +
      '  backdrop-filter: none !important;' +
      '  border-bottom: none !important;' +
      '  box-shadow: none !important;' +
      '}' +
      /* 标题行/小头部（今日卦运标题行、占卜结果头部、记录项头部）：
         不铺渐变背景，保持透明融入所在卡片，去掉加深横向色带 */
      '.daily-fortune-header, .rd-header, .divine-record-header {' +
      '  background: transparent !important;' +
      '  -webkit-backdrop-filter: none !important;' +
      '  backdrop-filter: none !important;' +
      '  border-bottom: none !important;' +
      '  box-shadow: none !important;' +
      '}' +
      /* 底栏：透明底 + 页面同渐变 fixed，无缝沉浸；去上描边、去毛玻璃与阴影 */
      '.nav-bottom {' +
      '  border-top: none !important;' +
      '  background-color: transparent !important;' +
      '  background-image: ' + splashGradient + ' !important;' +
      '  background-attachment: fixed !important;' +
      '  background-repeat: no-repeat !important;' +
      '  -webkit-backdrop-filter: none !important;' +
      '  backdrop-filter: none !important;' +
      '  box-shadow: none !important;' +
      '}' +
      /* 功能卡片 / 面板：去掉描边 */
      '.glass-card, .glass-section, .divine-config-panel,' +
      '.random-divine-panel, .divine-record-item, .spread-detail-section {' +
      '  border: none !important;' +
      '}' +
      /* 首页「最近占卜记录」列表项：去掉浅灰玻璃条底与阴影，纯文字融入渐变背景
         （只在首页生效，不影响占卜记录详情页的条目卡片） */
      '#page-home .divine-record-item {' +
      '  background: transparent !important;' +
      '  -webkit-backdrop-filter: none !important;' +
      '  backdrop-filter: none !important;' +
      '  box-shadow: none !important;' +
      '  padding: 10px 2px;' +
      '}' +
      '#page-home .divine-record-item:hover {' +
      '  background: rgba(255,255,255,0.16) !important;' +
      '  box-shadow: none !important;' +
      '  transform: none !important;' +
      '}' +
      /* 创建牌组/创建牌阵底部的「确认创建」按钮：抬高脱离底栏，避免与 nav 视觉相连；
         对应表单底部留白同步加大，防止内容被悬浮按钮遮挡 */
      '#page-create > .fixed.bottom-20,' +
      '#page-create-spread > .fixed.bottom-20 {' +
      '  bottom: 7.5rem !important;' +
      '}' +
      '#page-create > .px-5.mt-2.pb-20,' +
      '#page-create-spread > .px-5.mt-2.pb-20 {' +
      '  padding-bottom: 8rem !important;' +
      '}';

    document.head.appendChild(style);
  }

  function init() {
    var el = getButton();
    if (!el) return;
    var embedded = isEmbedded();
    el.style.display = embedded ? 'flex' : 'none';
    if (embedded) {
      applyCompactLayout();
      applyShixinjieSkin();
    }
  }

  window.backToShixinjie = backToShixinjie;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
