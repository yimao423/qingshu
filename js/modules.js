/* ==== modules.js ==== */
/* ===== 拾心界 - 8大功能模块 ===== */

/* ===================================================
   2. 月经记录 (Period)
   =================================================== */
let periodViewDate = new Date();
let _periodFlow = 1;          // 记录弹窗当前选中流量
let _periodPain = 0;          // 记录弹窗当前选中疼痛强度
let _periodEditDate = '';     // 记录弹窗当前编辑日期
let _periodMarkToday = true;  // 记录弹窗"今天来月经"开关
let _periodConfirmCb = null;    // 记录卡片内嵌确认回调

/* 生理算法：严格对标月经生理规则（美柚/大姨妈同款） */
const PeriodCalc = {
  // 日期解析（兼容 Date 与 'YYYY-MM-DD' 字符串）
  parse(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  },
  fmt(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
  },
  addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  },
  diffDays(a, b) {
    const da = a instanceof Date ? new Date(a.getFullYear(), a.getMonth(), a.getDate()) : this.parse(a);
    const db = b instanceof Date ? new Date(b.getFullYear(), b.getMonth(), b.getDate()) : this.parse(b);
    return Math.round((db - da) / 86400000);
  },

  // 周期设置（统一存储持久化，兼容旧 localStorage 键），经期默认 7 天
  getSettings() {
    try {
      const s = Storage.get('periodSettings', null);
      if (s && s.cycleLength) return s;
    } catch (e) {}
    // 兼容旧版直连 localStorage 键（迁移到统一存储）
    try {
      const old = JSON.parse(localStorage.getItem('periodSettings') || 'null');
      if (old && old.cycleLength) {
        Storage.set('periodSettings', old);
        localStorage.removeItem('periodSettings');
        return old;
      }
    } catch (e2) {}
    return { cycleLength: 28, periodLength: 7 };
  },
  saveSettings(s) { Storage.set('periodSettings', s); },

  // 平均周期 = 相邻经期起始日间隔均值
  calcAvgCycle() {
    const records = Storage.getPeriodRecords();
    const starts = records.map(r => this.parse(r.startDate)).sort((a, b) => a - b);
    if (starts.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < starts.length; i++) sum += this.diffDays(starts[i - 1], starts[i]);
    return Math.round(sum / (starts.length - 1));
  },

  // 经期天数 = 最近一次记录 endDate - startDate + 1
  calcPeriodLength() {
    const records = Storage.getPeriodRecords();
    if (!records.length) return null;
    const sorted = [...records].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return this.diffDays(sorted[0].startDate, sorted[0].endDate) + 1;
  },

  // 预估排卵日 = 最近一次经期结束日 + 9 天
  // 排卵期规则：经期结束后第 4 天为排卵期第 1 天（结束日+4），排卵期共 6 天，第 6 天为排卵日（结束日+4+5 = 结束日+9）
  // 依赖最近一次经期记录（startDate/endDate），无记录时返回 null
  calcOvulationDay() {
    const records = Storage.getPeriodRecords();
    if (!records.length) return null;
    const sorted = [...records].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const lastEnd = this.parse(sorted[0].endDate);
    return this.addDays(lastEnd, 9);
  },

  // 预估下次月经首日 = 预估排卵日 + 黄体期固定 14 天（排卵日当天过后往后第 14 天）
  // 依赖 calcOvulationDay，无经期记录时返回 null
  predictNextPeriodStart() {
    const ov = this.calcOvulationDay();
    if (!ov) return null;
    return this.addDays(ov, 14);
  },

  // 排卵期 = 经期结束后第 4 天起共 6 天（结束日+4 ~ 结束日+9），第 6 天为排卵日
  calcOvulationWindow() {
    const ov = this.calcOvulationDay();
    if (!ov) return null;
    return { start: this.addDays(ov, -5), end: ov };
  },

  // 预测经期区间 = 预测起始日 + 经期天数
  predictPeriodRange() {
    const next = this.predictNextPeriodStart();
    if (!next) return null;
    const len = this.calcPeriodLength() || this.getSettings().periodLength;
    return { start: next, end: this.addDays(next, len - 1) };
  }
};

function renderPeriod() {
  const cal = document.getElementById('period-calendar');
  if (cal) cal.innerHTML = renderPeriodCalendar(periodViewDate);
  const legend = document.getElementById('period-legend');
  if (legend) legend.innerHTML = renderPeriodLegend();
  const overview = document.getElementById('period-overview');
  if (overview) overview.innerHTML = renderPeriodOverview();
  syncPeriodRecordCard();
}

function syncPeriodRecordCard() {
  // 进行中经期：常驻显示今天记录卡片；否则隐藏
  const card = document.getElementById('period-record-card');
  if (!card) return;
  const todayStr = PeriodCalc.fmt(new Date());
  const records = Storage.getPeriodRecords();
  const active = records.find(r => todayStr >= r.startDate && todayStr <= r.endDate);
  if (active) renderPeriodRecordCard(todayStr);
  else card.style.display = 'none';
}

function renderPeriodOverview() {
  const records = Storage.getPeriodRecords();
  const settings = PeriodCalc.getSettings();

  if (!records.length) {
    return `
      <div class="period-overview-card">
        <div class="period-overview-head">
          <span class="period-overview-title">经期与周期</span>
        </div>
        <div class="period-overview-row">
          <span class="period-overview-row-label">默认周期</span>
          <span class="period-overview-row-value">${settings.cycleLength}<small> 天</small></span>
        </div>
        <div class="period-overview-row">
          <span class="period-overview-row-label">默认经期</span>
          <span class="period-overview-row-value">${settings.periodLength}<small> 天</small></span>
        </div>
        <div class="period-overview-hint">记录 2 次经期后自动推算平均值</div>
      </div>`;
  }

  // 近 6 个月记录统计
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  const recent = records.filter(r => PeriodCalc.parse(r.startDate) >= sixMonthsAgo);
  const pool = recent.length >= 2 ? recent : records;

  const starts = pool.map(r => PeriodCalc.parse(r.startDate)).sort((a, b) => a - b);
  let avgCycle = null;
  if (starts.length >= 2) {
    let sum = 0;
    for (let i = 1; i < starts.length; i++) sum += PeriodCalc.diffDays(starts[i - 1], starts[i]);
    avgCycle = Math.round(sum / (starts.length - 1));
  }
  const lens = pool.map(r => PeriodCalc.diffDays(r.startDate, r.endDate) + 1);
  const avgLen = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : null;

  const len = avgLen || settings.periodLength;
  const nextStart = PeriodCalc.predictNextPeriodStart();
  const ovDay = PeriodCalc.calcOvulationDay();

  let nextRow = '';
  if (nextStart) {
    const diff = PeriodCalc.diffDays(now, nextStart);
    nextRow = `<div class="period-overview-row">
      <span class="period-overview-row-label">下次经期</span>
      <span class="period-overview-row-value">${diff > 0 ? diff + ' 天后' : (diff === 0 ? '今天' : '已开始')}</span>
    </div>`;
  }
  let ovRow = '';
  if (ovDay) {
    const ovDiff = PeriodCalc.diffDays(now, ovDay);
    ovRow = `<div class="period-overview-row">
      <span class="period-overview-row-label">排卵日</span>
      <span class="period-overview-row-value">${ovDiff > 0 ? ovDiff + ' 天后' : (ovDiff === 0 ? '今天' : PeriodCalc.fmt(ovDay))}</span>
    </div>`;
  }
  const overviewHint = avgCycle
    ? `基于 ${pool.length} 次记录统计 · 排卵期/预测经期按最近一次经期推算`
    : '基于最近一次经期推算排卵期与预测经期';

  return `
    <div class="period-overview-card">
      <div class="period-overview-head">
        <span class="period-overview-title">经期与周期</span>
      </div>
      ${nextRow}
      ${ovRow}
      <div class="period-overview-row">
        <span class="period-overview-row-label">近 6 个月平均经期</span>
        <span class="period-overview-row-value">${len}<small> 天</small></span>
      </div>
      <div class="period-overview-row">
        <span class="period-overview-row-label">近 6 个月平均周期</span>
        <span class="period-overview-row-value">${avgCycle ? avgCycle + '<small> 天</small>' : '<small>记录中</small>'}</span>
      </div>
      <div class="period-overview-hint">${overviewHint}</div>
    </div>`;
}

function renderPeriodLegend() {
  return `
    <div class="period-legend-title">图例</div>
    <div class="period-legend-items">
      <span class="period-legend-item"><span class="period-legend-dot dot-period"></span>经期</span>
      <span class="period-legend-item"><span class="period-legend-dot dot-predict"></span>预测经期</span>
      <span class="period-legend-item"><span class="period-legend-dot dot-ovulation-day"></span>排卵日</span>
      <span class="period-legend-item"><span class="period-legend-dot dot-ovulation-window"></span>排卵期</span>
      <span class="period-legend-item"><span class="period-legend-dot dot-today"></span>今天</span>
    </div>`;
}

function renderPeriodCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = Core.formatDate(new Date());
  const records = Storage.getPeriodRecords();

  // 已记录经期日期集合 + 每日期流量
  const periodDays = new Set();
  const periodFlowMap = {};
  records.forEach(r => {
    let d = PeriodCalc.parse(r.startDate);
    const end = PeriodCalc.parse(r.endDate);
    while (d <= end) {
      const ds = PeriodCalc.fmt(d);
      periodDays.add(ds);
      periodFlowMap[ds] = r.flow;
      d = PeriodCalc.addDays(d, 1);
    }
  });

  // 预测经期区间
  const predictRange = PeriodCalc.predictPeriodRange();
  const predictDays = new Set();
  if (predictRange) {
    let d = predictRange.start;
    while (d <= predictRange.end) {
      predictDays.add(PeriodCalc.fmt(d));
      d = PeriodCalc.addDays(d, 1);
    }
  }

  // 排卵日 / 排卵期：按每条经期记录分别推算（历史月份同样附带显示）
  // 排卵日 = 经期结束日 + 9；排卵期 = 结束日 + 4 ~ 结束日 + 9 共 6 天（第 6 天为排卵日）
  const ovDayStrSet = new Set();
  const ovWinDays = new Set();
  records.forEach(r => {
    const end = PeriodCalc.parse(r.endDate);
    const ov = PeriodCalc.addDays(end, 9);
    ovDayStrSet.add(PeriodCalc.fmt(ov));
    let d = PeriodCalc.addDays(end, 4);
    while (d <= ov) {
      ovWinDays.add(PeriodCalc.fmt(d));
      d = PeriodCalc.addDays(d, 1);
    }
  });

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const dayHeaders = ['日', '一', '二', '三', '四', '五', '六'];

  let html = `<div class="period-cal-card">
    <div class="calendar-header">
      <span class="calendar-month">${year}年 ${monthNames[month]}</span>
      <div class="calendar-nav">
        <button onclick="changePeriodMonth(-1)"><i class="fas fa-chevron-left"></i></button>
        <button onclick="changePeriodMonth(1)"><i class="fas fa-chevron-right"></i></button>
      </div>
    </div>
    <div class="calendar-grid">`;

  dayHeaders.forEach(d => { html += `<div class="calendar-day-header">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day other-month"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    let cls = 'calendar-day';
    if (dateStr === todayStr) cls += ' today';
    // 颜色标记优先级：经期 > 排卵日 > 排卵期 > 预测经期
    if (periodDays.has(dateStr)) cls += ' period-day';
    else if (ovDayStrSet.has(dateStr)) cls += ' ovulation-day';
    else if (ovWinDays.has(dateStr)) cls += ' ovulation-window';
    else if (predictDays.has(dateStr)) cls += ' period-predict';
    let badge = '';
    if (periodDays.has(dateStr)) {
      const flow = Math.max(1, Math.min(3, periodFlowMap[dateStr] || 1));
      let drops = '';
      for (let i = 0; i < flow; i++) drops += '<i class="fas fa-tint"></i>';
      badge = `<span class="period-drop-badge">${drops}</span>`;
    }
    html += `<div class="${cls}" onclick="recordPeriodDay('${dateStr}')">${d}${badge}</div>`;
  }
  html += '</div></div>';
  return html;
}

function changePeriodMonth(delta) {
  periodViewDate = new Date(periodViewDate.getFullYear(), periodViewDate.getMonth() + delta, 1);
  renderPeriod();
}

function dropOptions() {
  const labels = ['少量', '中量', '大量'];
  let h = '';
  for (let i = 1; i <= 3; i++) {
    h += `<div class="period-drop-opt" data-flow="${i}" onclick="selectPeriodFlow(${i})">
      <span class="period-drop-icon">${'<i class="fas fa-tint"></i>'.repeat(i)}</span>
      <span class="period-drop-text">${labels[i - 1]}</span>
    </div>`;
  }
  return h;
}

function painOptions() {
  const labels = ['无痛', '轻微', '明显', '剧烈'];
  let h = '';
  for (let i = 0; i <= 3; i++) {
    const icons = i === 0 ? '<i class="far fa-circle"></i>' : '<i class="fas fa-bolt"></i>'.repeat(i);
    h += `<div class="period-pain-opt" data-pain="${i}" onclick="selectPeriodPain(${i})">
      <span class="period-pain-icon">${icons}</span>
      <span class="period-pain-text">${labels[i]}</span>
    </div>`;
  }
  return h;
}

function recordPeriodDay(dateStr) {
  renderPeriodRecordCard(dateStr);
}

function renderPeriodRecordCard(dateStr) {
  const card = document.getElementById('period-record-card');
  if (!card) return;
  _periodEditDate = dateStr;
  _periodPain = 0;
  const records = Storage.getPeriodRecords();
  const existing = records.find(r => dateStr >= r.startDate && dateStr <= r.endDate);
  const sorted = [...records].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const last = sorted[0];

  let html = '';
  if (existing) {
    _periodFlow = existing.flow || 1;
    _periodPain = existing.pain || 0;
    const dayNum = PeriodCalc.diffDays(existing.startDate, dateStr) + 1;
    html = `
      <div class="period-record-panel">
        <div class="period-record-title">经期第 ${dayNum} 天</div>
        <div class="period-record-date">${dateStr} · ${existing.startDate} 开始</div>
        ${dateStr === existing.startDate
          ? `<button class="period-cancel-btn" onclick="cancelPeriodRecord('${dateStr}')"><i class="fas fa-undo-alt"></i> 取消月经标注</button>`
          : `<button class="period-end-btn" onclick="endPeriodNow('${dateStr}')"><i class="fas fa-check-circle"></i> 结束经期（到 ${dateStr} 为止）</button>`}
        <div class="period-form-label">经期量 <span class="period-form-sub">点击水滴选择</span></div>
        <div class="period-drop-row">${dropOptions()}</div>
        <div class="period-form-label">疼痛强度 <span class="period-form-sub">点击闪电选择</span></div>
        <div class="period-pain-row">${painOptions()}</div>
        <div class="period-form-label">记录状态感受</div>
        <input type="text" id="period-feel-input" class="period-form-input" placeholder="如腹胀、腰酸、心情烦躁" maxlength="60" value="${Core.escapeHtml(existing.symptoms || '')}">
        <div class="period-record-actions">
          <button class="period-btn-cancel" onclick="closePeriodRecordPanel()">取消</button>
          <button class="period-btn-save" onclick="savePeriodRecord()">保存</button>
        </div>
      </div>`;
  } else {
    _periodFlow = last ? (last.flow || 1) : 1;
    _periodMarkToday = true;
    html = `
      <div class="period-record-panel">
        <div class="period-record-title">记录经期</div>
        <div class="period-record-date">${dateStr}</div>
        <div class="period-mark-row">
          <span class="period-mark-label">今天来月经了吗？</span>
          <div class="period-switch active" id="period-mark-switch" onclick="togglePeriodMark()"></div>
        </div>
        <div class="period-form-label">经期量 <span class="period-form-sub">点击水滴选择</span></div>
        <div class="period-drop-row">${dropOptions()}</div>
        <div class="period-form-label">疼痛强度 <span class="period-form-sub">点击闪电选择</span></div>
        <div class="period-pain-row">${painOptions()}</div>
        <div class="period-form-label">记录状态感受</div>
        <input type="text" id="period-feel-input" class="period-form-input" placeholder="如腹胀、腰酸、心情烦躁" maxlength="60">
        <div class="period-record-actions">
          <button class="period-btn-cancel" onclick="closePeriodRecordPanel()">取消</button>
          <button class="period-btn-save" onclick="savePeriodRecord()">保存</button>
        </div>
      </div>`;
  }
  card.innerHTML = html;
  card.style.display = 'block';
  selectPeriodFlow(_periodFlow);
  selectPeriodPain(_periodPain);
  updatePeriodMark();
}

function selectPeriodFlow(f) {
  _periodFlow = f;
  document.querySelectorAll('.period-drop-opt').forEach(el => {
    el.classList.toggle('active', +el.dataset.flow === f);
  });
}

function selectPeriodPain(p) {
  _periodPain = p;
  document.querySelectorAll('.period-pain-opt').forEach(el => {
    el.classList.toggle('active', +el.dataset.pain === p);
  });
}

function togglePeriodMark() {
  _periodMarkToday = !_periodMarkToday;
  updatePeriodMark();
}

function updatePeriodMark() {
  const sw = document.getElementById('period-mark-switch');
  if (sw) sw.classList.toggle('active', _periodMarkToday);
}

function savePeriodRecord() {
  const feelInput = document.getElementById('period-feel-input');
  const feel = (feelInput ? feelInput.value.trim() : '') || '无';
  const records = Storage.getPeriodRecords();
  const existing = records.find(r => _periodEditDate >= r.startDate && _periodEditDate <= r.endDate);

  if (existing) {
    existing.flow = _periodFlow;
    existing.pain = _periodPain;
    existing.symptoms = feel;
    Storage.setPeriodRecords(records);
    closePeriodRecordPanel();
    renderPeriod();
    Core.toast('记录已更新');
    return;
  }

  if (!_periodMarkToday) {
    closePeriodRecordPanel();
    Core.toast('未标记为经期，未保存');
    return;
  }

  const len = PeriodCalc.getSettings().periodLength;
  const endDate = PeriodCalc.addDays(PeriodCalc.parse(_periodEditDate), len - 1);
  records.push({
    id: Date.now(),
    startDate: _periodEditDate,
    endDate: PeriodCalc.fmt(endDate),
    flow: _periodFlow,
    pain: _periodPain,
    symptoms: feel
  });
  Storage.setPeriodRecords(records);
  closePeriodRecordPanel();
  renderPeriod();
  Core.toast(`已标记经期（默认 ${len} 天）`);
}

function endPeriodNow(dateStr) {
  const target = dateStr || PeriodCalc.fmt(new Date());
  const records = Storage.getPeriodRecords();
  const existing = records.find(r => target >= r.startDate && target <= r.endDate);
  if (!existing) {
    Core.toast('该日期不在经期内');
    return;
  }
  renderConfirmCard(
    '结束经期',
    `确定将本次经期结束于 ${target} 吗？`,
    () => {
      existing.endDate = target;
      Storage.setPeriodRecords(records);
      closePeriodRecordPanel();
      renderPeriod();
      Core.toast('经期已结束');
    },
    false
  );
}

function cancelPeriodRecord(dateStr) {
  const records = Storage.getPeriodRecords();
  const existing = records.find(r => dateStr >= r.startDate && dateStr <= r.endDate);
  if (!existing) {
    Core.toast('该日期不在经期内');
    return;
  }
  renderConfirmCard(
    '取消月经标注',
    `确定取消 ${existing.startDate} 开始的经期标注吗？该天的经期量、疼痛与感受数据将被清除。`,
    () => {
      Storage.setPeriodRecords(records.filter(r => r.id !== existing.id));
      closePeriodRecordPanel();
      renderPeriod();
      Core.toast('已取消月经标注');
    },
    true
  );
}

function renderConfirmCard(title, text, onConfirm, danger) {
  const card = document.getElementById('period-record-card');
  if (!card) return;
  _periodConfirmCb = onConfirm;
  const btnCls = danger ? 'period-confirm-danger-btn' : 'period-confirm-ok-btn';
  card.innerHTML = `
    <div class="period-record-panel">
      <div class="period-record-title">${title}</div>
      <div class="period-confirm-box">
        <div class="period-confirm-text">${text}</div>
        <div class="period-confirm-actions">
          <button class="period-confirm-back-btn" onclick="closePeriodRecordPanel()">返回</button>
          <button class="${btnCls}" onclick="doPeriodConfirm()">确认</button>
        </div>
      </div>
    </div>`;
  card.style.display = 'block';
}

function doPeriodConfirm() {
  const cb = _periodConfirmCb;
  _periodConfirmCb = null;
  if (cb) cb();
}

function closePeriodRecordPanel() {
  _periodConfirmCb = null;
  const card = document.getElementById('period-record-card');
  if (card) card.style.display = 'none';
}

/* 经期前三天每日提醒：由账号设置的对方角色发来关心语录 */
const PeriodReminder = {
  quotes: [
    '生理期快到了，这几天记得早点睡，别着凉，暖宝宝我已经帮你记在备忘录里啦。',
    '宝，预测经期就在眼前了，红糖水、暖水袋都安排上，难受了就随时找我。',
    '再过两天就是你的生理期了，这阵子少吃生冷，我会一直陪着你。',
    '亲爱的，经期倒计时开始啦，这两天别逞强，重活都交给我。',
    '预测你的经期快到了，记得照顾好自己，晚上盖好被子，别踢被子啦。'
  ],
  check() {
    try {
      const records = Storage.getPeriodRecords();
      if (!records || !records.length) return;
      const next = PeriodCalc.predictNextPeriodStart();
      if (!next) return;
      const today = new Date();
      const todayStr = PeriodCalc.fmt(today);
      const diff = PeriodCalc.diffDays(today, next);
      if (diff < 1 || diff > 3) return;
      let lastReminder = Storage.get('periodReminderDate', '');
      // 兼容旧版直连 localStorage 键
      if (!lastReminder) {
        try {
          const oldReminder = localStorage.getItem('periodReminderDate');
          if (oldReminder) {
            lastReminder = oldReminder;
            Storage.set('periodReminderDate', oldReminder);
            localStorage.removeItem('periodReminderDate');
          }
        } catch (e) {}
      }
      if (lastReminder === todayStr) return;
      Storage.set('periodReminderDate', todayStr);
      const partners = Storage.getPartnerProfiles();
      const p = partners && partners.length ? partners[0] : { nickname: 'TA', avatarColor: '#F0A868' };
      const quote = this.quotes[Math.floor(Math.random() * this.quotes.length)];
      this.show(p, quote, diff);
    } catch (e) {}
  },
  show(partner, quote, diff) {
    let overlay = document.getElementById('period-reminder-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'period-reminder-overlay';
      overlay.className = 'period-reminder-overlay';
      document.body.appendChild(overlay);
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const name = Core.escapeHtml(partner.nickname || 'TA');
    const initial = Core.escapeHtml((partner.nickname || 'TA').slice(0, 1));
    const avatar = partner.avatarImage
      ? `<div class="period-reminder-avatar"><img src="${partner.avatarImage}" alt=""></div>`
      : `<div class="period-reminder-avatar" style="background:${partner.avatarColor || '#F0A868'}">${initial}</div>`;
    overlay.innerHTML = `
      <div class="period-reminder-panel" onclick="event.stopPropagation()">
        <div class="period-reminder-head">
          ${avatar}
          <div>
            <div class="period-reminder-name">${name}</div>
            <div class="period-reminder-time">${hh}:${mm}</div>
          </div>
        </div>
        <div class="period-reminder-bubble">
          <div class="period-reminder-day-tag"><i class="fas fa-heart"></i> 经期前 ${diff} 天提醒</div>
          <div>${quote}</div>
        </div>
        <div class="period-reminder-actions">
          <button class="period-btn-cancel" onclick="closePeriodReminder()">知道了</button>
          <button class="period-btn-save" onclick="closePeriodReminder();Navigation.navigateTo('period')">去记录</button>
        </div>
      </div>`;
    overlay.style.display = 'flex';
    overlay.onclick = function() { closePeriodReminder(); };
  }
};

function closePeriodReminder() {
  const el = document.getElementById('period-reminder-overlay');
  if (el) el.style.display = 'none';
}

function checkPeriodReminder() {
  PeriodReminder.check();
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(checkPeriodReminder, 1200);
});

/* ===================================================
   3. 树洞 (Treehole)
   =================================================== */
function renderTreehole() {
  const container = document.getElementById('treehole-posts');
  if (!container) return;
  const posts = Storage.getTreeholePosts();
  let html = '';
  if (posts.length === 0) {
    html = '<div class="empty-state"><i class="fas fa-tree"></i><p>树洞空空如也，来说点什么吧</p></div>';
  } else {
    const sorted = [...posts].sort((a, b) => b.time - a.time);
    sorted.forEach(p => {
      html += `
        <div class="treehole-card glass-section">
          <div class="treehole-card-text">${p.text.replace(/\n/g, '<br>')}</div>
          <div class="treehole-card-footer">
            <span class="treehole-time">${Core.formatTime(p.time)}</span>
            <button class="treehole-like-btn" onclick="likeTreeholePost(${p.id})">
              <i class="far fa-heart"></i> <span>${p.likes || 0}</span>
            </button>
          </div>
        </div>`;
    });
  }
  container.innerHTML = html;
}

function postTreehole() {
  const input = document.getElementById('treehole-input');
  if (!input || !input.value.trim()) {
    Core.toast('请输入内容');
    return;
  }
  const posts = Storage.getTreeholePosts();
  posts.push({ id: Date.now(), text: input.value.trim(), time: Date.now(), likes: 0 });
  Storage.setTreeholePosts(posts);
  input.value = '';
  renderTreehole();
  Core.toast('已匿名发布');
}

function likeTreeholePost(id) {
  const posts = Storage.getTreeholePosts();
  const post = posts.find(p => p.id === id);
  if (post) {
    post.likes = (post.likes || 0) + 1;
    Storage.setTreeholePosts(posts);
    renderTreehole();
  }
}

/* ===================================================
   4. 音乐 (Music)
   =================================================== */
const MusicPlayer = {
  currentIndex: 0,
  playlist: [
    { title: 'Cosmic Love', artist: 'Shixin', album: '拾心界', cover: '🌌', duration: '4:21' },
    { title: '晴天', artist: '周杰伦', album: '叶惠美', cover: '☀️', duration: '4:29' },
    { title: '平凡之路', artist: '朴树', album: '平凡之路', cover: '🛣️', duration: '5:02' },
    { title: '七里香', artist: '周杰伦', album: '七里香', cover: '🌸', duration: '4:57' },
    { title: '倔强', artist: '五月天', album: '神的孩子都在跳舞', cover: '🌟', duration: '4:23' },
    { title: '起风了', artist: '买辣椒也用券', album: '起风了', cover: '🍃', duration: '5:25' },
    { title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', cover: '🌙', duration: '3:51' },
    { title: '光年之外', artist: '邓紫棋', album: '光年之外', cover: '✨', duration: '3:57' }
  ],
  isPlaying: false,

  /* ---- 播放引擎（Web Audio 合成轻柔背景音乐，无外部音频资源、离线可用） ---- */
  _audioCtx: null,
  _masterGain: null,
  _chordTimer: null,
  _progressTimer: null,
  _playElapsed: 0,     // 已累计播放秒数（暂停时保留）
  _playStartAt: 0,     // 本次开始播放时刻（时钟秒）
  _chordStep: 0,
  // C 大调经典和弦进行：C - G - Am - F（MIDI 音高）
  _chordProgression: [
    [60, 64, 67],
    [59, 62, 67],
    [57, 60, 64],
    [53, 57, 60]
  ],

  /* 统一时钟：优先 AudioContext（播放即走时），降级用 Date 模拟 */
  _clock() {
    return this._audioCtx ? this._audioCtx.currentTime : (Date.now() / 1000);
  },

  _durationSec() {
    const d = this.playlist[this.currentIndex].duration || '0:00';
    const p = String(d).split(':');
    return ((parseInt(p[0], 10) || 0) * 60) + (parseInt(p[1], 10) || 0);
  },

  _fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  },

  _ensureEngine() {
    if (!this._audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this._audioCtx = new AC();
        this._masterGain = this._audioCtx.createGain();
        this._masterGain.gain.value = 0.10;
        this._masterGain.connect(this._audioCtx.destination);
      } catch (e) {
        this._audioCtx = null;
        return false;
      }
    }
    if (this._audioCtx.state === 'suspended') {
      try { this._audioCtx.resume(); } catch (e) {}
    }
    return true;
  },

  /* 弹奏一个轻柔和弦（sine 叠加 + 淡入淡出包络） */
  _playChord() {
    if (!this._audioCtx || !this._masterGain) return;
    const notes = this._chordProgression[this._chordStep % this._chordProgression.length];
    this._chordStep++;
    const now = this._audioCtx.currentTime;
    notes.forEach((midi, idx) => {
      try {
        const osc = this._audioCtx.createOscillator();
        const gain = this._audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        const t0 = now + idx * 0.22;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.32, t0 + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
        osc.connect(gain);
        gain.connect(this._masterGain);
        osc.start(t0);
        osc.stop(t0 + 2.0);
      } catch (e) {}
    });
  },

  _startEngineLoop() {
    this._playChord();
    this._chordTimer = setInterval(() => this._playChord(), 2000);
  },

  _stopEngineLoop() {
    if (this._chordTimer) { clearInterval(this._chordTimer); this._chordTimer = null; }
  },

  _getPosition() {
    const total = this._durationSec();
    let pos = this._playElapsed;
    if (this.isPlaying) {
      pos += this._clock() - this._playStartAt;
    }
    return Math.min(pos, total);
  },

  _startProgress() {
    this._updateProgress();
    this._progressTimer = setInterval(() => this._updateProgress(), 500);
  },

  _stopProgress() {
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
  },

  _updateProgress() {
    const total = this._durationSec();
    const pos = this._getPosition();
    const fill = document.getElementById('music-progress-fill');
    if (fill) fill.style.width = (total > 0 ? (pos / total * 100) : 0) + '%';
    const curEl = document.getElementById('music-time-cur');
    if (curEl) curEl.textContent = this._fmtTime(pos);
    const durEl = document.getElementById('music-time-dur');
    if (durEl) durEl.textContent = this._fmtTime(total);
    // 播放结束自动切下一首
    if (this.isPlaying && total > 0 && pos >= total - 0.05) {
      this.next();
    }
  },

  _playCurrent() {
    if (!this._ensureEngine()) {
      // 音频引擎不可用（极老浏览器/隐私模式）：进度条仍用 Date 时钟模拟
    }
    this._playElapsed = 0;
    this._playStartAt = this._clock();
    this._startEngineLoop();
    this._startProgress();
  },

  _pauseCurrent() {
    this._playElapsed = this._getPosition();
    this._stopEngineLoop();
    this._stopProgress();
  },

  /* 点击进度条跳转 */
  seekFromEvent(ev) {
    const bar = ev.currentTarget;
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const total = this._durationSec();
    this._playElapsed = ratio * total;
    this._playStartAt = this._clock();
    if (this.isPlaying) {
      this._stopEngineLoop();
      this._startEngineLoop();
      this._startProgress();
    } else {
      this._updateProgress();
    }
    this.render();
  },

  render() {
    const song = this.playlist[this.currentIndex];
    // 更新封面
    const cover = document.getElementById('music-cover-display');
    if (cover) cover.textContent = song.cover;
    // 更新信息
    const title = document.getElementById('music-title');
    const artist = document.getElementById('music-artist');
    if (title) title.textContent = song.title;
    if (artist) artist.textContent = song.artist + ' · ' + song.album;

    // 渲染播放列表（若存在列表容器）
    const listContainer = document.getElementById('music-playlist');
    if (listContainer) {
      let html = '';
      this.playlist.forEach((s, i) => {
        html += `<div class="music-list-item ${i === this.currentIndex ? 'active' : ''}" onclick="MusicPlayer.playIndex(${i})">
          <span class="music-list-cover">${s.cover}</span>
          <div class="music-list-info"><span class="music-list-title">${s.title}</span><span class="music-list-artist">${s.artist}</span></div>
          <span class="music-list-dur">${s.duration}</span>
        </div>`;
      });
      listContainer.innerHTML = html;
    }

    // 更新按钮
    const playBtn = document.getElementById('music-btn-play');
    if (playBtn) {
      playBtn.innerHTML = this.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    // 更新进度条与时间（小组件 / 播放页通用）
    const total = this._durationSec();
    const pos = this._getPosition();
    const fill = document.getElementById('music-progress-fill');
    if (fill) fill.style.width = (total > 0 ? (pos / total * 100) : 0) + '%';
    const curEl = document.getElementById('music-time-cur');
    if (curEl) curEl.textContent = this._fmtTime(pos);
    const durEl = document.getElementById('music-time-dur');
    if (durEl) durEl.textContent = this._fmtTime(total);
  },

  togglePlay() {
    if (this.isPlaying) {
      this._pauseCurrent();
      this.isPlaying = false;
    } else {
      this._playCurrent();
      this.isPlaying = true;
    }
    this.render();
  },

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    if (this.isPlaying) {
      this._stopEngineLoop();
      this._stopProgress();
      this._playCurrent();
    } else {
      this._playElapsed = 0;
    }
    this.render();
  },

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    if (this.isPlaying) {
      this._stopEngineLoop();
      this._stopProgress();
      this._playCurrent();
    } else {
      this._playElapsed = 0;
    }
    this.render();
  },

  playIndex(i) {
    this.currentIndex = i;
    if (this.isPlaying) {
      this._stopEngineLoop();
      this._stopProgress();
      this._playCurrent();
    } else {
      this._playElapsed = 0;
    }
    this.render();
  }
};

function renderMusic() {
  MusicPlayer.render();
}

/* ===================================================
   5. 小说 (Novel)
   =================================================== */
const NovelApp = {
  novels: [
    {
      id: 'novel_1',
      title: '小王子',
      author: '安托万·德·圣-埃克苏佩里',
      cover: '🦊',
      desc: '一个关于爱与责任的永恒童话',
      chapters: [
        { title: '第一章', text: '当我还只有六岁的时候，在一本描写原始森林的名叫《真实的故事》的书中，看到了一副精彩的插画，画的是一条蟒蛇正在吞食一只大野兽。这就是那副画的摹本。\n\n这本书中写道："这些蟒蛇把它们的猎获物不加咀嚼地囫囵吞下，尔后就不能再动弹了；它们就在长长的六个月的睡眠中消化这些食物。"\n\n当时，我对丛林中的奇遇想得很多，于是，我也用彩色铅笔画出了我的第一副图画。我的第一号作品。' },
        { title: '第二章', text: '我就这样孤独地生活着，没有一个能真正谈得来的人，一直到六年前在撒哈拉沙漠上发生了那次故障。我的发动机里有个东西损坏了。当时由于我既没有带机械师也没有带旅客，我就试图独自完成这个困难的维修工作。这对我来说是个生与死的问题。我随身带的水只够饮用一星期。\n\n第一天晚上我就睡在这远离人间烟火的大沙漠上。我比大海中伏在小木排上的遇难者还要孤独得多。而在第二天拂晓，当一个奇怪的小声音叫醒我的时候，你们可以想象我当时是多么吃惊。这小小的声音说道："请你给我画一只羊，好吗？"' },
        { title: '第三章', text: '我费了好长时间才弄清楚他是从哪里来的。小王子向我提出了很多问题，可是，对我提出的问题，他好像压根没有听见似的。他无意中吐露的一些话逐渐使我搞清了他的来历。\n\n例如，当他第一次瞅见我的飞机时，他问我道："这是个什么玩艺？""这不是玩艺。它能飞。这是飞机。是我的飞机。"我当时很骄傲地告诉他我能飞。于是他惊奇地说道："怎么？你是从天上掉下来的？" "是的"。我谦逊地答道。' }
      ]
    }
  ],
  currentNovelId: null,
  currentChapter: 0,

  renderShelf() {
    const container = document.getElementById('novel-shelf');
    if (!container) return;
    let html = '';
    this.novels.forEach(n => {
      html += `<div class="novel-cover-item" onclick="NovelApp.openNovel('${n.id}')">
        <div class="novel-cover-img">${n.cover}</div>
        <div class="novel-cover-title">${n.title}</div>
        <div class="novel-cover-author">${n.author}</div>
      </div>`;
    });
    container.innerHTML = html;
  },

  openNovel(id) {
    this.currentNovelId = id;
    this.currentChapter = 0;
    this.renderReader(id);
    Navigation.navigateTo('novel-reader');
  },

  renderReader() {
    const novel = this.novels.find(n => n.id === this.currentNovelId);
    if (!novel) return;
    const ch = novel.chapters[this.currentChapter];

    const titleEl = document.getElementById('novel-reader-title');
    const contentEl = document.getElementById('novel-reader-content');
    const chapEl = document.getElementById('novel-reader-chapter');
    const prevBtn = document.getElementById('novel-btn-prev');
    const nextBtn = document.getElementById('novel-btn-next');

    if (titleEl) titleEl.textContent = novel.title;
    if (chapEl) chapEl.textContent = ch.title;
    if (contentEl) {
      contentEl.innerHTML = ch.text.replace(/\n/g, '<br><br>');
      contentEl.scrollTop = 0;
    }
    if (prevBtn) prevBtn.style.visibility = this.currentChapter > 0 ? 'visible' : 'hidden';
    if (nextBtn) nextBtn.style.visibility = this.currentChapter < novel.chapters.length - 1 ? 'visible' : 'hidden';
  },

  nextChapter() {
    const novel = this.novels.find(n => n.id === this.currentNovelId);
    if (!novel || this.currentChapter >= novel.chapters.length - 1) return;
    this.currentChapter++;
    this.renderReader();
  },

  prevChapter() {
    if (this.currentChapter <= 0) return;
    this.currentChapter--;
    this.renderReader();
  }
};

function renderNovel() {
  NovelApp.renderShelf();
}

/* ===================================================
   6. 格言 (Quotes) — 首页显示 + 字卡页管理
   =================================================== */
function renderHomeQuote(el) {
  const quotes = Storage.getQuotes();
  if (quotes.length === 0) { el.textContent = ''; return; }
  const idx = Math.floor(Math.random() * quotes.length);
  el.textContent = '「' + quotes[idx] + '」';
}

function renderQuotes() {
  const container = document.getElementById('quotes-list');
  if (!container) return;
  const quotes = Storage.getQuotes();
  if (quotes.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-quote-right"></i><p>暂无格言，点击右下角添加</p></div>';
    return;
  }
  let html = '';
  quotes.forEach((q, i) => {
    html += `
      <div class="quote-item">
        <div class="quote-item-text">${Core.escapeHtml(q)}</div>
        <div class="quote-item-actions">
          <button onclick="editQuote(${i})" title="编辑"><i class="fas fa-pen"></i></button>
          <button class="danger" onclick="deleteQuote(${i})" title="删除"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function addQuote() {
  Core.formModal('添加格言', [
    { label: '格言内容', placeholder: '请输入格言' }
  ], function(values) {
    var text = values[0];
    if (!text) return;
    var quotes = Storage.getQuotes();
    quotes.push(text);
    Storage.setQuotes(quotes);
    renderQuotes();
    Core.toast('格言已添加');
  });
}

function editQuote(index) {
  var quotes = Storage.getQuotes();
  Core.formModal('编辑格言', [
    { label: '格言内容', placeholder: '请输入格言', value: quotes[index] }
  ], function(values) {
    var text = values[0];
    if (!text) return;
    quotes[index] = text;
    Storage.setQuotes(quotes);
    renderQuotes();
    Core.toast('格言已更新');
  });
}

function deleteQuote(index) {
  Core.confirm('删除格言', '确定删除这条格言吗？', () => {
    const quotes = Storage.getQuotes();
    quotes.splice(index, 1);
    Storage.setQuotes(quotes);
    renderQuotes();
    Core.toast('格言已删除');
  });
}

function importQuotesJSON() { importUniversalJSON('quotes'); }

function exportQuotesJSON() {
  var quotes = Storage.getQuotes();
  if (!quotes.length) { Core.toast('暂无格言可导出'); return; }
  var payload = { exportDate: new Date().toISOString(), type: 'quotes', total: quotes.length, quotes: quotes };
  var data = JSON.stringify(payload, null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = 'quotes_' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
  Core.toast('已导出 ' + quotes.length + ' 条格言');
}

function deduplicateQuotes() {
  var quotes = Storage.getQuotes();
  var seen = {}, deduped = [];
  quotes.forEach(function(q) { if (!seen[q]) { seen[q] = true; deduped.push(q); } });
  var removed = quotes.length - deduped.length;
  if (removed === 0) { Core.toast('未发现重复格言'); return; }
  Core.confirm('去重格言', '发现 ' + removed + ' 条重复，是否删除？', function() {
    Storage.setQuotes(deduped);
    renderQuotes();
    Core.toast('已删除 ' + removed + ' 条重复格言');
  });
}

/* ===================================================
   6.5 每日留言语录库 (Daily Quotes)
   =================================================== */
function renderDailyQuotes() {
  const container = document.getElementById('daily-quotes-list');
  if (!container) return;
  const quotes = Storage.getDailyQuotes();
  if (quotes.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>暂无每日留言语录，点击右下角添加</p></div>';
    return;
  }
  let html = '';
  quotes.forEach((q, i) => {
    html += `
      <div class="quote-item">
        <div class="quote-item-text">${Core.escapeHtml(q)}</div>
        <div class="quote-item-actions">
          <button onclick="editDailyQuote(${i})" title="编辑"><i class="fas fa-pen"></i></button>
          <button class="danger" onclick="deleteDailyQuote(${i})" title="删除"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function addDailyQuote() {
  Core.formModal('添加每日留言语录', [
    { label: '语录内容', placeholder: '请输入每日留言语录' }
  ], function(values) {
    var text = values[0];
    if (!text) return;
    var quotes = Storage.getDailyQuotes();
    quotes.push(text);
    Storage.setDailyQuotes(quotes);
    renderDailyQuotes();
    Core.toast('每日留言语录已添加');
  });
}

function editDailyQuote(index) {
  var quotes = Storage.getDailyQuotes();
  Core.formModal('编辑每日留言语录', [
    { label: '语录内容', placeholder: '请输入每日留言语录', value: quotes[index] }
  ], function(values) {
    var text = values[0];
    if (!text) return;
    quotes[index] = text;
    Storage.setDailyQuotes(quotes);
    renderDailyQuotes();
    Core.toast('每日留言语录已更新');
  });
}

function deleteDailyQuote(index) {
  Core.confirm('删除每日留言语录', '确定删除这条留言语录吗？', () => {
    const quotes = Storage.getDailyQuotes();
    quotes.splice(index, 1);
    Storage.setDailyQuotes(quotes);
    renderDailyQuotes();
    Core.toast('每日留言语录已删除');
  });
}

function importDailyQuotesJSON() { importUniversalJSON('dailyQuotes'); }
function exportDailyQuotesJSON() {
  var quotes = Storage.getDailyQuotes();
  if (!quotes.length) { Core.toast('暂无留言可导出'); return; }
  var payload = { exportDate: new Date().toISOString(), type: 'dailyQuotes', total: quotes.length, dailyQuotes: quotes };
  var data = JSON.stringify(payload, null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url;
  a.download = 'daily_quotes_' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
  Core.toast('已导出 ' + quotes.length + ' 条留言');
}

function deduplicateDailyQuotes() {
  var quotes = Storage.getDailyQuotes();
  var seen = {}, deduped = [];
  quotes.forEach(function(q) { if (!seen[q]) { seen[q] = true; deduped.push(q); } });
  var removed = quotes.length - deduped.length;
  if (removed === 0) { Core.toast('未发现重复留言'); return; }
  Core.confirm('去重留言', '发现 ' + removed + ' 条重复，是否删除？', function() {
    Storage.setDailyQuotes(deduped);
    renderDailyQuotes();
    Core.toast('已删除 ' + removed + ' 条重复留言');
  });
}

/* ===================================================
   7. 记事本 (Notepad)
   =================================================== */
function renderNotepad() {
  const container = document.getElementById('notepad-list');
  if (!container) return;
  const notes = Storage.getNotes();
  let html = '';
  if (notes.length === 0) {
    html = '<div class="empty-state"><i class="fas fa-pen-to-square"></i><p>暂无笔记，点击右下角创建</p></div>';
  } else {
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    sorted.forEach(n => {
      const preview = n.content.replace(/<[^>]*>/g, '').substring(0, 50);
      html += `
        <div class="notepad-item glass-section" onclick="openNote('${n.id}')">
          <div class="notepad-item-title">${n.title || '无标题'}</div>
          <div class="notepad-item-preview">${preview || '空内容'}</div>
          <div class="notepad-item-time">${Core.formatTime(n.updatedAt)}</div>
        </div>`;
    });
  }
  container.innerHTML = html;
}

function createNote() {
  const title = prompt('请输入笔记标题：', '新笔记');
  if (title === null) return;
  const notes = Storage.getNotes();
  const note = { id: Date.now().toString(), title: title.trim() || '无标题', content: '', updatedAt: Date.now() };
  notes.push(note);
  Storage.setNotes(notes);
  openNoteEditor(note.id);
}

function openNote(id) {
  const notes = Storage.getNotes();
  const note = notes.find(n => n.id === id);
  if (!note) return;
  Navigation.navigateTo('notepad-editor');
  setTimeout(() => {
    document.getElementById('note-editor-id').value = note.id;
    document.getElementById('note-editor-title').value = note.title;
    document.getElementById('note-editor-content').innerHTML = note.content;
  }, 100);
}

function openNoteEditor(id) {
  Navigation.navigateTo('notepad-editor');
  setTimeout(() => {
    document.getElementById('note-editor-id').value = id;
    const notes = Storage.getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
      document.getElementById('note-editor-title').value = note.title;
      document.getElementById('note-editor-content').innerHTML = note.content;
    }
  }, 100);
}

function saveNote() {
  const id = document.getElementById('note-editor-id').value;
  const title = document.getElementById('note-editor-title').value.trim();
  const content = document.getElementById('note-editor-content').innerHTML;
  const notes = Storage.getNotes();
  const note = notes.find(n => n.id === id);
  if (note) {
    note.title = title || '无标题';
    note.content = content;
    note.updatedAt = Date.now();
    Storage.setNotes(notes);
    Core.toast('笔记已保存');
    Navigation.goBack();
  }
}

function deleteNote(id) {
  Core.confirm('删除笔记', '确定删除这篇笔记吗？', () => {
    const notes = Storage.getNotes().filter(n => n.id !== id);
    Storage.setNotes(notes);
    Navigation.goBack();
    setTimeout(() => renderNotepad(), 200);
    Core.toast('笔记已删除');
  });
}

/* ===================================================
   8. 商城购物 (Shop)
   =================================================== */
const ShopApp = {
  products: [
    { id: 'p1', name: '拾心界水晶球', price: 128, icon: '🔮', desc: '精致水晶球摆件' },
    { id: 'p2', name: '星空投影灯', price: 89, icon: '🌌', desc: '房间秒变星空' },
    { id: 'p3', name: '手作香薰蜡烛', price: 45, icon: '🕯️', desc: '天然大豆蜡手工制作' },
    { id: 'p4', name: '猫咪陶瓷杯', price: 36, icon: '🐱', desc: '可爱猫咪造型马克杯' },
    { id: 'p5', name: '云朵抱枕', price: 59, icon: '☁️', desc: '超柔软云朵造型' },
    { id: 'p6', name: '复古蓝牙音箱', price: 199, icon: '📻', desc: '复古造型 音质出众' },
    { id: 'p7', name: '莫奈油画明信片', price: 22, icon: '🎨', desc: '印象派经典明信片套装' },
    { id: 'p8', name: '日式风铃', price: 68, icon: '🎐', desc: '清脆悦耳 夏日必备' }
  ],
  cart: [],

  init() {
    this.cart = Storage.getShopCart();
  },

  renderProducts() {
    const container = document.getElementById('shop-product-grid');
    if (!container) return;
    let html = '';
    this.products.forEach(p => {
      const inCart = this.cart.some(c => c.id === p.id);
      html += `
        <div class="shop-product glass-section" onclick="ShopApp.addToCart('${p.id}')">
          <div class="shop-product-icon">${p.icon}</div>
          <div class="shop-product-name">${p.name}</div>
          <div class="shop-product-desc">${p.desc}</div>
          <div class="shop-product-bottom">
            <span class="shop-product-price">¥${p.price}</span>
            <button class="shop-cart-btn ${inCart ? 'in-cart' : ''}" onclick="event.stopPropagation();ShopApp.addToCart('${p.id}')">
              <i class="fas ${inCart ? 'fa-check' : 'fa-cart-plus'}"></i>
            </button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  },

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    const existing = this.cart.find(c => c.id === productId);
    if (existing) {
      existing.qty++;
    } else {
      this.cart.push({ id: productId, name: product.name, price: product.price, icon: product.icon, qty: 1 });
    }
    Storage.setShopCart(this.cart);
    this.updateCartBadge();
    this.renderProducts();
    Core.toast('已加入购物车');
  },

  updateCartBadge() {
    const badge = document.getElementById('shop-cart-badge');
    if (badge) {
      const total = this.cart.reduce((s, c) => s + c.qty, 0);
      badge.textContent = total;
      badge.style.display = total > 0 ? 'inline' : 'none';
    }
  },

  renderCart() {
    const container = document.getElementById('shop-cart-list');
    const totalEl = document.getElementById('shop-cart-total');
    if (!container) return;
    if (this.cart.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>购物车是空的</p></div>';
      if (totalEl) totalEl.textContent = '¥0';
      return;
    }
    let html = '';
    let total = 0;
    this.cart.forEach((c, i) => {
      total += c.price * c.qty;
      html += `
        <div class="shop-cart-item">
          <span class="cart-item-icon">${c.icon}</span>
          <div class="cart-item-info"><span>${c.name}</span><span class="cart-item-price">¥${c.price} x ${c.qty}</span></div>
          <button onclick="ShopApp.removeFromCart(${i})" class="text-btn"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    });
    container.innerHTML = html;
    if (totalEl) totalEl.textContent = '¥' + total;
    this.updateCartBadge();
  },

  removeFromCart(index) {
    this.cart.splice(index, 1);
    Storage.setShopCart(this.cart);
    this.renderCart();
    this.renderProducts();
  },

  checkout() {
    if (this.cart.length === 0) { Core.toast('购物车是空的'); return; }
    const total = this.cart.reduce((s, c) => s + c.price * c.qty, 0);
    Core.toast('模拟下单成功！总计 ¥' + total);
    this.cart = [];
    Storage.setShopCart(this.cart);
    Navigation.goBack();
    setTimeout(() => this.renderProducts(), 200);
  }
};

function renderShop() {
  ShopApp.init();
  ShopApp.renderProducts();
  ShopApp.updateCartBadge();
}

function renderShopCart() {
  ShopApp.renderCart();
}

/* ===== 每日一言（daily-quotes）全局绑定 =====
   函数在本文件内定义，绑定放在文件末尾可避免 init.js 顶层引用未加载函数
   造成 ReferenceError、中断 renderWordCardStickers 等后续绑定。 */
window.renderDailyQuotes = renderDailyQuotes;
window.addDailyQuote = addDailyQuote;
window.editDailyQuote = editDailyQuote;
window.deleteDailyQuote = deleteDailyQuote;
window.importDailyQuotesJSON = importDailyQuotesJSON;
window.exportDailyQuotesJSON = exportDailyQuotesJSON;
window.deduplicateDailyQuotes = deduplicateDailyQuotes;

