/* ==== theme.js ==== */
/* ===== 疯狗龙的情书 - 主题管理 ===== */

const ThemeManager = {
  themes: [
    { id: 'default', name: '浅蓝', color: '#B8DCF0' },
    { id: 'light-pink', name: '浅粉', color: '#F0C0D0' },
    { id: 'light-purple', name: '浅紫', color: '#D8C0E8' },
    { id: 'light-red', name: '浅红', color: '#F0B0B8' },
    { id: 'light-orange', name: '浅橙', color: '#F5C898' },
    { id: 'light-yellow', name: '浅黄', color: '#F5E0A0' },
    { id: 'light-green', name: '浅绿', color: '#B0D8C0' },
    { id: 'white', name: '纯白', color: '#D0D0D0' },
    { id: 'black', name: '暗夜', color: '#5A5A6A' }
  ],

  currentTheme: 'default',
  customColor: null,

  init() {
    this.currentTheme = Storage.get('theme', 'default');
    this.customColor = Storage.get('customThemeColor', null);
    this.apply();
  },

  apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this.currentTheme);
    if (this.currentTheme === 'custom' && this.customColor) {
      this.applyCustomVars(this.customColor);
    } else {
      this.clearCustomVars();
    }
    this.updateBgEdges();
    Storage.set('theme', this.currentTheme);
  },

  // 从当前背景渐变中自动提取顶部/底部颜色，供顶栏与底部导航沉浸式使用
  updateBgEdges() {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const grad = cs.getPropertyValue('--bg-gradient').trim();
    const colors = grad.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || [];
    if (colors.length >= 2) {
      root.style.setProperty('--bg-top', colors[0]);
      root.style.setProperty('--bg-bottom', colors[colors.length - 1]);
    } else {
      root.style.removeProperty('--bg-top');
      root.style.removeProperty('--bg-bottom');
    }
    // 计算毛玻璃半透层叠加当前背景后的不透明色（顶栏沉浸用）
    const glass = cs.getPropertyValue('--glass-bg').trim();
    const top = this.parseColor(colors[0] || '');
    const g = this.parseColor(glass);
    if (top && g) {
      const r = Math.round(g.r * g.a + top.r * (1 - g.a));
      const gg = Math.round(g.g * g.a + top.g * (1 - g.a));
      const b = Math.round(g.b * g.a + top.b * (1 - g.a));
      root.style.setProperty('--glass-solid', `rgb(${r},${gg},${b})`);
    } else {
      root.style.removeProperty('--glass-solid');
    }
  },

  parseColor(str) {
    if (!str) return null;
    let m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    m = str.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
        a: h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
      };
    }
    return null;
  },

  set(themeId) {
    if (this.themes.find(t => t.id === themeId)) {
      this.currentTheme = themeId;
      this.apply();
    }
  },

  setCustom() {
    this.currentTheme = 'custom';
    this.apply();
  },

  getCurrent() {
    if (this.currentTheme === 'custom') {
      return { id: 'custom', name: '自定义', color: this.customColor || '#B8DCF0' };
    }
    return this.themes.find(t => t.id === this.currentTheme) || this.themes[0];
  },

  /* ---- 自定义主题 ---- */

  // 实时预览：临时应用自定义主色（不保存）
  previewCustom(color) {
    this.applyCustomVars(color);
    this.updateBgEdges();
    const hexEl = document.getElementById('custom-theme-hex');
    if (hexEl) hexEl.textContent = color.toUpperCase();
  },

  // 保存自定义主题
  saveCustom() {
    const colorInput = document.getElementById('custom-theme-color');
    const color = colorInput ? colorInput.value : '#B8DCF0';
    this.customColor = color;
    Storage.set('customThemeColor', color);
    this.currentTheme = 'custom';
    this.apply();
    this.renderThemeSelector(document.querySelector('.theme-grid'));
    Core.toast('自定义主题已保存');
  },

  // 恢复默认主题
  resetCustom() {
    this.customColor = null;
    Storage.remove('customThemeColor');
    this.currentTheme = 'default';
    this.apply();
    this.renderThemeSelector(document.querySelector('.theme-grid'));
    const colorInput = document.getElementById('custom-theme-color');
    if (colorInput) colorInput.value = '#B8DCF0';
    const hexEl = document.getElementById('custom-theme-hex');
    if (hexEl) hexEl.textContent = '#B8DCF0';
    Core.toast('已恢复默认主题');
  },

  // 根据主色生成配套浅色变体并应用到 CSS 变量
  applyCustomVars(color) {
    const root = document.documentElement;
    const rgb = this.hexToRgb(color);
    const light = this.lighten(color, 0.85);
    const dark = this.darken(color, 0.75);
    const bg = this.lighten(color, 0.95);
    const bgEnd = this.lighten(color, 0.9);
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-rgb', rgb);
    root.style.setProperty('--primary-light', light);
    root.style.setProperty('--panel-light', this.lighten(color, 0.95));
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--primary-bg', bg);
    root.style.setProperty('--bg-gradient', `linear-gradient(160deg, ${light}, ${bg} 55%, ${bgEnd})`);
    root.style.setProperty('--nav-active', color);
    root.style.setProperty('--nav-icon-active-bg', `rgba(${rgb}, 0.55)`);
    root.style.setProperty('--nav-label-active', color);
    root.style.setProperty('--magic-color', color);
    root.style.setProperty('--magic-rgb', rgb);
    root.style.setProperty('--magic-glow', `rgba(${rgb}, 0.30)`);
  },

  // 清除自定义主题的 inline CSS 变量
  clearCustomVars() {
    const root = document.documentElement;
    [
      '--primary', '--primary-rgb', '--primary-light', '--panel-light', '--primary-dark', '--primary-bg',
      '--bg-gradient', '--nav-active', '--nav-icon-active-bg', '--nav-label-active',
      '--magic-color', '--magic-rgb', '--magic-glow'
    ].forEach(v => root.style.removeProperty(v));
  },

  /* ---- 颜色工具 ---- */

  hexToRgb(hex) {
    const h = hex.replace('#', '');
    return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
  },

  // 向白色混合生成浅色
  lighten(hex, ratio) {
    const h = hex.replace('#', '');
    const r = Math.round(parseInt(h.substring(0, 2), 16) + (255 - parseInt(h.substring(0, 2), 16)) * ratio);
    const g = Math.round(parseInt(h.substring(2, 4), 16) + (255 - parseInt(h.substring(2, 4), 16)) * ratio);
    const b = Math.round(parseInt(h.substring(4, 6), 16) + (255 - parseInt(h.substring(4, 6), 16)) * ratio);
    return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
  },

  // 向黑色混合生成深色
  darken(hex, ratio) {
    const h = hex.replace('#', '');
    const r = Math.round(parseInt(h.substring(0, 2), 16) * ratio);
    const g = Math.round(parseInt(h.substring(2, 4), 16) * ratio);
    const b = Math.round(parseInt(h.substring(4, 6), 16) * ratio);
    return `#${this.toHex(r)}${this.toHex(g)}${this.toHex(b)}`;
  },

  toHex(n) {
    return n.toString(16).padStart(2, '0');
  },

  renderThemeSelector(container) {
    if (!container) return;
    let html = '<div class="theme-grid">';
    this.themes.forEach(t => {
      const active = t.id === this.currentTheme ? ' active' : '';
      html += `
        <div class="theme-option${active}" data-theme="${t.id}" onclick="ThemeManager.set('${t.id}');ThemeManager.renderThemeSelector(document.querySelector('.theme-grid'));Core.toast('主题已切换')">
          <div class="theme-swatch" style="background:${t.color}"></div>
          <div class="theme-name">${t.name}</div>
        </div>
      `;
    });
    // 自定义主题选项（保存过自定义主题后显示）
    if (this.customColor) {
      const active = this.currentTheme === 'custom' ? ' active' : '';
      html += `
        <div class="theme-option${active}" data-theme="custom" onclick="ThemeManager.setCustom();ThemeManager.renderThemeSelector(document.querySelector('.theme-grid'));Core.toast('已应用自定义主题')">
          <div class="theme-swatch" style="background:${this.customColor}"></div>
          <div class="theme-name">自定义</div>
        </div>
      `;
    }
    html += '</div>';
    container.outerHTML = html;
  }
};

window.ThemeManager = ThemeManager;


