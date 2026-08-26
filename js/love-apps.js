/* ============================================================
   love-apps.js — 恋爱主题应用
   1. 恋爱日记 LoveDiaryApp  —— 情侣/双人日记，本地持久化
   2. 心动测试 LoveTestApp   —— 恋爱性格测试（6 题 → 恋爱人格）
   3. 每日情话 DailySweetApp —— 随机情话 + 复制分享
   4. 恋爱运势 LoveFortuneApp —— 今日桃花/缘分指数 + 幸运信息
   设计语言：毛玻璃卡片 + 主题变量，与全站一致
   ============================================================ */
(function () {
  'use strict';

  var DIARY_KEY = 'love_diary_entries';

  function toast(msg) {
    if (window.Core && typeof Core.toast === 'function') {
      Core.toast(msg);
      return;
    }
    try { alert(msg); } catch (e) {}
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fDate(d) {
    var days = ['日', '一', '二', '三', '四', '五', '六'];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + days[d.getDay()];
  }

  /* ============================================================
     1. 恋爱日记
     ============================================================ */
  window.LoveDiaryApp = {
    _get: function () {
      try { return Storage.get(DIARY_KEY, []); } catch (e) { return []; }
    },
    _save: function (list) {
      try { Storage.set(DIARY_KEY, list); } catch (e) {}
    },
    add: function () {
      var input = document.getElementById('love-diary-input');
      if (!input) return;
      var text = (input.value || '').trim();
      if (!text) { toast('先写下点什么吧'); return; }
      var moodSel = document.getElementById('love-diary-mood');
      var list = this._get();
      var now = new Date();
      list.unshift({
        id: Date.now(),
        text: text,
        mood: moodSel ? moodSel.value : '💗',
        date: fDate(now)
      });
      this._save(list);
      input.value = '';
      this.render();
      toast('已记下这一天');
    },
    remove: function (id) {
      var list = this._get().filter(function (e) { return e.id !== id; });
      this._save(list);
      this.render();
      toast('已删除这条日记');
    },
    render: function () {
      var list = this._get();
      var container = document.getElementById('love-diary-list');
      var hint = document.getElementById('love-diary-date-hint');
      if (hint) hint.textContent = fDate(new Date());
      if (!container) return;
      if (!list.length) {
        container.innerHTML = '<div class="love-empty">还没有日记，写下第一条吧</div>';
        return;
      }
      var html = list.map(function (e) {
        return '<div class="love-diary-item glass-card">' +
          '<div class="love-diary-item-head">' +
            '<span class="love-diary-mood">' + (e.mood || '💗') + '</span>' +
            '<span class="love-diary-date"></span>' +
            '<button class="love-diary-del" data-id="' + e.id + '"><i class="fas fa-trash-alt"></i></button>' +
          '</div>' +
          '<div class="love-diary-text"></div>' +
        '</div>';
      }).join('');
      container.innerHTML = html;
      // 用户内容一律 textContent 填充，防注入
      var items = container.querySelectorAll('.love-diary-item');
      items.forEach(function (el, idx) {
        el.querySelector('.love-diary-date').textContent = list[idx].date || '';
        el.querySelector('.love-diary-text').textContent = list[idx].text || '';
        el.querySelector('.love-diary-del').addEventListener('click', function () {
          LoveDiaryApp.remove(list[idx].id);
        });
      });
    }
  };

  window.renderLoveDiary = function () {
    window.LoveDiaryApp.render();
  };

  /* ============================================================
     2. 心动测试
     ============================================================ */
  var TEST_QUESTIONS = [
    { q: '约会时 TA 迟到了半小时，你通常会？', options: ['笑着等，顺便点杯奶茶', '有点小生气但见面就好了', '发消息问清楚在哪，担心出事'] },
    { q: '你更向往哪种恋爱状态？', options: ['时刻黏在一起，越近越好', '各自独立但心里有彼此', '有共同爱好一起成长'] },
    { q: '两个人意见不合时，你的第一反应是？', options: ['先照顾 TA 的情绪，慢慢说', '当场把事情聊透', '给彼此一点空间再谈'] },
    { q: '你最喜欢的告白方式是？', options: ['当面认真说出来', '写一封信或发一段长消息', '用行动默默证明'] },
    { q: '恋爱里你最看重什么？', options: ['真诚与安全感', '新鲜感和仪式感', '默契与共同成长'] },
    { q: 'TA 突然情绪低落，你会？', options: ['立刻陪在身边不多问', '准备小惊喜逗 TA 开心', '先安静倾听，等 TA 愿意说'] }
  ];

  var TEST_RESULTS = [
    {
      type: '温柔守护型恋人',
      icon: '🛡️',
      desc: '你把安全感当作爱的语言。TA 的情绪波动总能被你第一时间察觉，你习惯先照顾对方再照顾自己。这样的你像冬日里的暖炉，不耀眼却让人离不开。',
      tags: ['高共情', '细节控', '安全感拉满', '值得托付']
    },
    {
      type: '浪漫冒险型恋人',
      icon: '🎈',
      desc: '恋爱在你眼里是一场永不落幕的冒险。你擅长制造惊喜，愿意为一句心动就跨越山海。你的热情像夏天，让人忍不住想靠近，也让人担心错过。',
      tags: ['仪式感之王', '行动派', '惊喜制造机', '热烈鲜活']
    },
    {
      type: '灵魂共鸣型恋人',
      icon: '🌙',
      desc: '你追求的是精神层面的同频。比起形式上的浪漫，你更在意两个人能不能聊到一块儿。在你看来，最好的告白是"我懂你"，最浪漫的事是彼此成就。',
      tags: ['深度交流', '彼此成就', '通透清醒', '长久陪伴']
    }
  ];

  window.LoveTestApp = {
    _state: { step: 0, answers: [], finished: false },

    _typeIndex: function () {
      var answers = this._state.answers;
      var count = [0, 0, 0];
      answers.forEach(function (a) { count[a]++; });
      var max = Math.max(count[0], count[1], count[2]);
      // 平票时优先 1（浪漫）→ 0（守护）→ 2（共鸣）
      if (count[1] === max) return 1;
      if (count[0] === max) return 0;
      return 2;
    },

    _renderQuestion: function (container) {
      var self = this;
      var idx = this._state.step;
      var total = TEST_QUESTIONS.length;
      var q = TEST_QUESTIONS[idx];
      var html =
        '<div class="love-test-progress"><div class="love-test-progress-bar" style="width:' +
          Math.round(((idx) / total) * 100) + '%"></div></div>' +
        '<div class="love-test-card glass-card">' +
          '<div class="love-test-step">第 ' + (idx + 1) + ' / ' + total + ' 题</div>' +
          '<div class="love-test-question">' + q.q + '</div>' +
          q.options.map(function (opt, oi) {
            return '<button class="love-test-option" data-oi="' + oi + '">' + opt + '</button>';
          }).join('') +
        '</div>';
      container.innerHTML = html;
      container.querySelectorAll('.love-test-option').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var oi = parseInt(btn.getAttribute('data-oi'), 10);
          self._state.answers.push(oi);
          self._state.step++;
          if (self._state.step >= total) {
            self._state.finished = true;
            self.render();
          } else {
            self._renderQuestion(container);
          }
        });
      });
    },

    _renderResult: function (container) {
      var self = this;
      var r = TEST_RESULTS[this._typeIndex()];
      var html =
        '<div class="love-test-result">' +
          '<div class="love-test-result-icon">' + r.icon + '</div>' +
          '<div class="love-test-result-title">你的恋爱人格是</div>' +
          '<div class="love-test-result-type">' + r.type + '</div>' +
          '<div class="love-test-result-desc">' + r.desc + '</div>' +
          '<div class="love-test-result-tags">' +
            r.tags.map(function (t) { return '<span class="love-test-tag">' + t + '</span>'; }).join('') +
          '</div>' +
          '<div class="love-test-nav">' +
            '<button class="glass-btn" id="love-test-restart"><i class="fas fa-undo"></i> 再测一次</button>' +
          '</div>' +
        '</div>';
      container.innerHTML = html;
      var btn = document.getElementById('love-test-restart');
      if (btn) {
        btn.addEventListener('click', function () {
          self._state = { step: 0, answers: [], finished: false };
          self.render();
        });
      }
    },

    render: function () {
      var container = document.getElementById('love-test-container');
      if (!container) return;
      if (!this._state.finished) {
        this._renderQuestion(container);
      } else {
        this._renderResult(container);
      }
    }
  };

  window.renderLoveTest = function () {
    window.LoveTestApp.render();
  };

  /* ============================================================
     3. 每日情话
     ============================================================ */
  var SWEET_QUOTES = [
    '遇见你之后，星河皆可摘，万物皆可期。',
    '别人问我喜欢什么，我又要开始形容你了。',
    '你是年少的欢喜，倒过来也是。',
    '想把世界上最好的都给你，却发现世界上最好的就是你。',
    '我看过一千个关于秋天的句子，都不及这一刻慵懒的你。',
    '你是我在这人间最想留住的小幸运。',
    '山野万里，你是我藏在微风里的欢喜。',
    '月亮不会奔你而来，但我可以。',
    '所有的晦暗都留给过往，从遇见你开始，凛冬散尽，星河长明。',
    '你是无意穿堂风，偏偏孤倨引山洪。',
    '我的世界原本荒芜寸草不生，后来你来走了一遭，奇迹般万物生长。',
    '草在结它的种子，风在摇它的叶子，我们站着，不说话，就十分美好。',
    '如果全世界都对你恶语相加，那我就对你说上一世情话。',
    '你是我猝不及防的心动，也是我始料未及的惊鸿。',
    '海底月是天上月，眼前人是心上人。',
    '这世间青山灼灼，星光杳杳，晚风渐渐，也抵不过你眉目间的星辰。',
    '我写了很多情话，落款都是你。',
    '风止于秋水，我止于你。',
    '你的名字，是我写过最短的情诗。',
    '我见众生皆草木，唯你是青山。',
    '人间太吵了，你来我心里住吧。',
    '你是我的，半截的诗，不许别人更改一个字。',
    '愿岁月可回首，且以深情共白头。',
    '我在贩卖日落，你像神明一样慷慨地将光洒向我。',
    '十里清风，万顷星河，你是我藏在心底的温柔。',
    '我的心里原本荒凉，遇见你之后，开出了漫山遍野的花。',
    '你不用多好，我喜欢就好；我没有很好，你不嫌弃就好。',
    '酸甜苦辣，与你分享；三餐四季，与你共度。',
    '只许一生一世人，只做一世一双人。',
    '想牵你的手，从心动，到古稀，到尽头。',
    '你是我的今天，以及所有的明天。',
    '我喜欢你，像风走了八千里，不问归期。',
    '初见是惊鸿一瞥，南柯一梦是你；等待是山重水复，怦然心动是你。',
    '我携满天星辰赠你，仍觉满天星辰不及你。',
    '你的笑像西瓜最中间那一勺的口感。',
    '这一生，风雨飘摇，还好有你，是我唯一的港湾。',
    '我这一生都是坚定的唯物主义者，唯有你，我希望有来生。',
    '从前的日色变得慢，车、马、邮件都慢，一生只够爱一个人。',
    '你眼里的星河，是我见过最美的宇宙。',
    '喜欢是乍见之欢，爱是久处不厌，而我，对你两者都是。'
  ];

  window.DailySweetApp = {
    _lastIdx: -1,
    _getQuote: function () {
      var idx;
      if (SWEET_QUOTES.length <= 1) {
        idx = 0;
      } else {
        do {
          idx = Math.floor(Math.random() * SWEET_QUOTES.length);
        } while (idx === this._lastIdx);
      }
      this._lastIdx = idx;
      return SWEET_QUOTES[idx];
    },
    next: function () {
      var q = document.getElementById('sweet-quote');
      if (q) q.textContent = '「 ' + this._getQuote() + ' 」';
      var s = document.getElementById('sweet-source');
      if (s) s.textContent = '—— 拾心界 · 每日情话';
    },
    copy: function () {
      var q = document.getElementById('sweet-quote');
      if (!q) return;
      var text = q.textContent.replace(/[「」]/g, '').trim();
      if (!text) { toast('暂时没有情话可复制'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          toast('情话已复制，快去发给 TA 吧');
        }).catch(function () {
          toast('复制失败，请手动复制');
        });
      } else {
        // 降级方案：临时 textarea 复制
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('情话已复制，快去发给 TA 吧'); } catch (e) { toast('复制失败，请手动复制'); }
        document.body.removeChild(ta);
      }
    },
    render: function () {
      this.next();
    }
  };

  window.renderDailySweet = function () {
    window.DailySweetApp.render();
  };

  /* ============================================================
     4. 恋爱运势
     ============================================================ */
  var FORTUNE_COLORS = ['珊瑚粉', '雾霾蓝', '香芋紫', '薄荷绿', '奶杏色', '樱花粉', '奶油白', '蜜桃橘'];
  var FORTUNE_ADVICE = [
    '主动约 TA 看一场日落，黄昏的光线最衬心意。',
    '今天适合说真话，把憋了很久的想念讲出来。',
    '给 TA 准备一个小惊喜，不用贵重，走心就够。',
    '少一点猜测，多一点直球，爱要大声说出来。',
    '一起做顿饭吧，烟火气是最浪漫的情话。',
    '今天的你自带光芒，走到哪里都会发光，记得对 TA 笑一笑。',
    '适合写一封手写信，字里行间都是温度。',
    '把手机放一放，认真听 TA 说说话，胜过千句情话。',
    '今天的幸运藏在细节里，帮 TA 记得一件小事。',
    '勇敢一点，缘分会在你不经意的时候开花结果。'
  ];

  function seededRandom(seed) {
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  window.LoveFortuneApp = {
    _seed: null,
    _fortune: null,

    _generate: function (seed) {
      var r1 = seededRandom(seed);
      var r2 = seededRandom(seed + 1);
      var r3 = seededRandom(seed + 2);
      var r4 = seededRandom(seed + 3);
      return {
        peach: Math.floor(r1 * 40) + 60,          // 桃花指数 60-99
        fate: Math.floor(r2 * 40) + 60,           // 缘分指数 60-99
        color: FORTUNE_COLORS[Math.floor(r3 * FORTUNE_COLORS.length)],
        num: Math.floor(r4 * 89) + 1,             // 幸运数字 1-89
        advice: FORTUNE_ADVICE[Math.floor(seededRandom(seed + 4) * FORTUNE_ADVICE.length)]
      };
    },

    _daySeed: function () {
      var now = new Date();
      return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    },

    _getFortune: function () {
      if (!this._fortune) {
        this._fortune = this._generate(this._seed === null ? this._daySeed() : this._seed);
      }
      return this._fortune;
    },

    reborn: function () {
      this._seed = Date.now();
      this._fortune = null;
      this.render();
      toast('今日运势已重新占卜');
    },

    render: function () {
      var container = document.getElementById('love-fortune-container');
      if (!container) return;
      var f = this._getFortune();
      var html =
        '<div class="fortune-card glass-card">' +
          '<div class="fortune-date">' + fDate(new Date()) + ' · 今日恋爱运势</div>' +
          '<div class="fortune-score-row">' +
            '<div class="fortune-score-item">' +
              '<span class="fortune-score-label">桃花指数</span>' +
              '<div class="fortune-score-track"><div class="fortune-score-bar" style="width:' + f.peach + '%"></div></div>' +
              '<span class="fortune-score-num">' + f.peach + '</span>' +
            '</div>' +
            '<div class="fortune-score-item">' +
              '<span class="fortune-score-label">缘分指数</span>' +
              '<div class="fortune-score-track"><div class="fortune-score-bar" style="width:' + f.fate + '%"></div></div>' +
              '<span class="fortune-score-num">' + f.fate + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="fortune-info-grid">' +
            '<div class="fortune-info-item"><div class="fortune-info-label">幸运色</div><div class="fortune-info-value">' + f.color + '</div></div>' +
            '<div class="fortune-info-item"><div class="fortune-info-label">幸运数字</div><div class="fortune-info-value">' + f.num + '</div></div>' +
            '<div class="fortune-info-item"><div class="fortune-info-label">恋爱关键词</div><div class="fortune-info-value">' + (f.peach + f.fate >= 150 ? '甜蜜爆表' : '稳稳升温') + '</div></div>' +
          '</div>' +
          '<div class="fortune-advice"><strong>今日建议：</strong>' + f.advice + '</div>' +
        '</div>' +
        '<div class="fortune-actions">' +
          '<button class="glass-btn primary" onclick="LoveFortuneApp.reborn()"><i class="fas fa-magic"></i> 重新占卜</button>' +
        '</div>';
      container.innerHTML = html;
    }
  };

  window.renderLoveFortune = function () {
    window.LoveFortuneApp.render();
  };
})();

/* ============================================================
   5. 情侣默契挑战 (LoveMatch)
   玩法：先答自己的答案，再让 TA 猜你的答案，对比契合度
   ============================================================ */
(function () {
  var MATCH_QUESTIONS = [
    { id: 'm1', q: '你最想和 TA 一起做的事？', opts: ['海边看日落', '一起做饭', '一场说走就走的旅行', '宅家一起追剧'] },
    { id: 'm2', q: 'TA 心情不好时最需要什么？', opts: ['安静地陪着', '一顿美食投喂', '听 TA 把话说完', '讲个笑话逗 TA 笑'] },
    { id: 'm3', q: '你们第一次约会最可能去哪里？', opts: ['电影院', '咖啡馆', '游乐园', '公园散步'] },
    { id: 'm4', q: '你最喜欢 TA 的哪个特质？', opts: ['温柔体贴', '幽默有趣', '靠谱稳重', '阳光开朗'] },
    { id: 'm5', q: '周末宅家时你更想？', opts: ['一起打游戏', '一起看一部电影', '一起收拾小窝', '各自安静做自己的事'] },
    { id: 'm6', q: 'TA 生气时你通常会怎么哄？', opts: ['先主动道歉', '买个小礼物', '撒娇卖萌求原谅', '等 TA 消气再沟通'] },
    { id: 'm7', q: '对你们来说最有纪念意义的地方是？', opts: ['初次相遇的地方', '第一次约会的地方', '常去的那家餐厅', '一起旅行过的城市'] },
    { id: 'm8', q: '你觉得恋爱里最重要的一件事是？', opts: ['信任', '沟通', '仪式感', '陪伴'] },
    { id: 'm9', q: '如果一起去旅行，你更想？', opts: ['精心规划好行程', '随性走到哪算哪', '主打美食探店', '拍很多好看的照片'] },
    { id: 'm10', q: '深夜睡不着时你希望 TA？', opts: ['陪你聊到睡着', '讲个睡前故事', '唱首歌哄你睡', '安静陪着不说话'] }
  ];
  var ROUND_SIZE = 5;
  var STORAGE_KEY = 'sxz_love_match_stats_v1';

  var LoveMatchApp = {
    phase: 'intro',
    round: [],
    idx: 0,
    mine: {},
    guess: {},
    lock: false,
    resultScore: 0,
    resultMatched: 0,
    stats: { best: 0, times: 0, lastScore: 0, lastDate: '' },

    _esc: function (s) {
      return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
    },

    _loadStats: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.stats = JSON.parse(raw);
      } catch (e) {}
    },

    _saveStats: function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats)); } catch (e) {}
    },

    _pickRound: function () {
      var pool = MATCH_QUESTIONS.slice();
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      this.round = pool.slice(0, Math.min(ROUND_SIZE, pool.length));
      this.idx = 0;
      this.mine = {};
      this.guess = {};
      this.resultScore = 0;
      this.resultMatched = 0;
    },

    start: function () {
      this._pickRound();
      this.phase = 'mine';
      this.render();
    },

    chooseMine: function (qid, opt) {
      if (this.lock || this.phase !== 'mine') return;
      this.mine[qid] = opt;
      this._advance();
    },

    chooseGuess: function (qid, opt) {
      if (this.lock || this.phase !== 'guess') return;
      this.guess[qid] = opt;
      this._advance();
    },

    _advance: function () {
      var self = this;
      this.lock = true;
      setTimeout(function () {
        self.lock = false;
        if (self.idx < self.round.length - 1) {
          self.idx++;
          self.render();
        } else if (self.phase === 'mine') {
          self.phase = 'guess';
          self.idx = 0;
          self.render();
        } else if (self.phase === 'guess') {
          self.phase = 'result';
          self._record();
          self.render();
        }
      }, 260);
    },

    _record: function () {
      var matched = 0;
      for (var i = 0; i < this.round.length; i++) {
        var item = this.round[i];
        if (this.mine[item.id] && this.guess[item.id] === this.mine[item.id]) matched++;
      }
      this.resultMatched = matched;
      this.resultScore = Math.round(matched / this.round.length * 100);
      this.stats.times++;
      this.stats.lastScore = this.resultScore;
      if (this.resultScore > this.stats.best) this.stats.best = this.resultScore;
      var d = new Date();
      this.stats.lastDate = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      this._saveStats();
    },

    _scoreText: function () {
      var s = this.resultScore;
      if (s === 100) return '灵魂共鸣，你们简直是天生一对！';
      if (s >= 80) return '默契爆棚，TA 真的很懂你！';
      if (s >= 60) return '心有灵犀，大部分答案都猜中啦～';
      if (s >= 40) return '渐入佳境，多聊聊会更默契哦';
      return '还需要磨合，但爱就是慢慢靠近呀';
    },

    _statsHtml: function () {
      return '<div class="match-stats">' +
        '<div class="match-stat-item glass-card"><div class="match-stat-num">' + this.stats.best + '%</div><div class="match-stat-label">最佳默契</div></div>' +
        '<div class="match-stat-item glass-card"><div class="match-stat-num">' + this.stats.times + ' 次</div><div class="match-stat-label">累计挑战</div></div>' +
        '<div class="match-stat-item glass-card"><div class="match-stat-num">' + (this.stats.lastScore || '-') + '%</div><div class="match-stat-label">最近一次</div></div>' +
      '</div>';
    },

    _questionHtml: function (roleText, prefix) {
      var item = this.round[this.idx];
      var num = this.idx + 1;
      var total = this.round.length;
      var pct = Math.round(num / total * 100);
      var opts = '';
      for (var i = 0; i < item.opts.length; i++) {
        var o = item.opts[i];
        opts += '<button class="match-option" onclick="LoveMatchApp.' + prefix + '(\'' + item.id + '\', \'' + this._esc(o) + '\')">' + o + '</button>';
      }
      return '<div class="match-progress">' +
          '<div class="match-progress-track"><div class="match-progress-bar" style="width:' + pct + '%"></div></div>' +
          '<span class="match-progress-text">' + num + '/' + total + '</span>' +
        '</div>' +
        '<div class="match-question glass-card">' +
          '<div class="match-question-role">' + roleText + '</div>' +
          '<div class="match-question-title">' + item.q + '</div>' +
          '<div class="match-options">' + opts + '</div>' +
        '</div>';
    },

    render: function () {
      var container = document.getElementById('love-match-container');
      if (!container) return;
      this._loadStats();

      var html = this._statsHtml();

      if (this.phase === 'intro') {
        html += '<div class="match-intro glass-card">' +
          '<div class="match-intro-icon"><i class="fas fa-heart"></i></div>' +
          '<div class="match-intro-title">情侣默契挑战</div>' +
          '<div class="match-intro-desc">两个人各答一遍同样的问题：你先说出自己的答案，再让 TA 猜你的答案。看看你们有多懂彼此～<br>每轮 ' + ROUND_SIZE + ' 题，答完自动出默契指数。</div>' +
          '<div class="match-actions" style="margin-top:14px"><button class="glass-btn primary" onclick="LoveMatchApp.start()"><i class="fas fa-play"></i> 开始挑战</button></div>' +
        '</div>';
      } else if (this.phase === 'mine') {
        html += '<div class="match-tip">第一轮 · 请认真选出你自己的答案</div>' + this._questionHtml('第 ' + (this.idx + 1) + ' 题 · 你先答', 'chooseMine');
      } else if (this.phase === 'guess') {
        html += '<div class="match-tip">第二轮 · 换 TA 来猜猜你会选什么</div>' + this._questionHtml('第 ' + (this.idx + 1) + ' 题 · 换 TA 猜', 'chooseGuess');
      } else {
        var compare = '';
        for (var i = 0; i < this.round.length; i++) {
          var item = this.round[i];
          var ok = this.guess[item.id] === this.mine[item.id];
          compare += '<div class="match-compare-item glass-card">' +
            '<div class="match-compare-q">' + (i + 1) + '. ' + item.q + '</div>' +
            '<div class="match-compare-row"><span class="mark ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✗') + '</span><span class="match-compare-answer">你的答案：' + this.mine[item.id] + '</span></div>' +
            '<div class="match-compare-row"><span></span><span class="match-compare-answer">TA 的猜测：' + this.guess[item.id] + '</span></div>' +
          '</div>';
        }
        html += '<div class="match-result glass-card">' +
          '<div class="match-result-score">' + this.resultScore + '%</div>' +
          '<div class="match-result-label">默契指数 · ' + this.resultMatched + '/' + this.round.length + ' 题命中</div>' +
          '<div class="match-result-comment">' + this._scoreText() + '</div>' +
        '</div>' +
        '<div class="match-compare">' + compare + '</div>' +
        '<div class="match-actions">' +
          '<button class="glass-btn primary" onclick="LoveMatchApp.again()"><i class="fas fa-redo-alt"></i> 再来一轮</button>' +
        '</div>';
      }

      container.innerHTML = html;
    }
  };

  window.LoveMatchApp = LoveMatchApp;
  window.renderLoveMatch = function () {
    window.LoveMatchApp.render();
  };
})();
