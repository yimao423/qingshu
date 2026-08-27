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
   5. 家庭菜谱 (RecipeApp) v2
   布局：左侧竖向可滑侧边栏分类 + 右侧内容区（玻璃拟态）
   功能：菜谱库（搜索/分类/详情/收藏）
        + 日常饮食记录（按日期+餐次记录、时间轴、删除、localStorage 持久化）
        + 对方角色点评（复用 Storage.getPartnerProfiles 角色体系）
   ============================================================ */
(function () {
  'use strict';

  /* ---- 内置菜谱数据（30 道家常菜） ---- */
  var RECIPES = [
    { id: 'r01', name: '番茄炒蛋', category: '快手菜', emoji: '🍅', time: '10分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#FF9A9E,#FECFEF)',
      ingredients: ['鸡蛋 3个', '番茄 2个', '盐 适量', '白糖 少许', '葱花 少许'],
      steps: ['番茄洗净切块，鸡蛋打散加少许盐搅匀。', '热锅倒油，倒入蛋液炒至凝固盛出。', '锅中留底油，下番茄翻炒出汁。', '加盐和白糖调味，倒回鸡蛋翻炒均匀。', '撒葱花出锅装盘。'] },
    { id: 'r02', name: '红烧肉', category: '家常菜', emoji: '🥩', time: '60分钟', difficulty: '中等', serves: '4人份', color: 'linear-gradient(135deg,#FCCF31,#F55555)',
      ingredients: ['五花肉 500克', '姜 3片', '葱 1段', '八角 2个', '冰糖 适量', '生抽 2勺', '老抽 1勺', '料酒 2勺'],
      steps: ['五花肉切块，冷水下锅加料酒焯水后捞出。', '锅中少许油放冰糖，小火炒出糖色。', '下五花肉翻炒上色，加姜葱八角爆香。', '加生抽老抽和水没过肉，小火炖40分钟。', '大火收汁，撒葱花出锅。'] },
    { id: 'r03', name: '可乐鸡翅', category: '家常菜', emoji: '🍗', time: '30分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#FBC2EB,#A6C1EE)',
      ingredients: ['鸡翅中 8个', '可乐 1罐', '姜 3片', '生抽 2勺', '老抽 少许', '料酒 1勺'],
      steps: ['鸡翅两面划刀，冷水下锅加料酒焯水。', '锅中少油，鸡翅煎至两面金黄。', '加姜片、生抽、老抽翻炒上色。', '倒入可乐没过鸡翅，大火烧开后转小火焖15分钟。', '大火收浓汤汁即可。'] },
    { id: 'r04', name: '鱼香肉丝', category: '家常菜', emoji: '🥢', time: '25分钟', difficulty: '中等', serves: '3人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['里脊肉 200克', '木耳 适量', '胡萝卜 半根', '青椒 1个', '豆瓣酱 1勺', '醋 2勺', '糖 1勺', '生抽 1勺', '水淀粉 适量'],
      steps: ['里脊肉切丝，加少许盐和水淀粉腌制。', '木耳、胡萝卜、青椒切丝备用。', '调鱼香汁：醋、糖、生抽加水淀粉。', '热锅滑熟肉丝盛出。', '下豆瓣酱炒出红油，放配菜翻炒，倒回肉丝淋鱼香汁炒匀。'] },
    { id: 'r05', name: '宫保鸡丁', category: '家常菜', emoji: '🥜', time: '25分钟', difficulty: '中等', serves: '3人份', color: 'linear-gradient(135deg,#A18CD1,#FBC2EB)',
      ingredients: ['鸡胸肉 200克', '花生米 80克', '干辣椒 6个', '花椒 少许', '葱 2根', '生抽 2勺', '醋 2勺', '糖 1勺', '水淀粉 适量'],
      steps: ['鸡胸肉切丁腌制，花生米炸熟备用。', '调宫保汁：生抽、醋、糖、水淀粉。', '热锅下鸡丁滑炒至变色盛出。', '爆香干辣椒、花椒、葱段。', '倒回鸡丁和花生，淋宫保汁翻炒均匀。'] },
    { id: 'r06', name: '糖醋排骨', category: '家常菜', emoji: '🍖', time: '45分钟', difficulty: '中等', serves: '4人份', color: 'linear-gradient(135deg,#FCCF31,#F55555)',
      ingredients: ['肋排 500克', '姜 3片', '料酒 2勺', '生抽 2勺', '老抽 1勺', '醋 3勺', '冰糖 3勺', '熟芝麻 少许'],
      steps: ['排骨焯水后沥干。', '锅中少油炒糖色，下排骨翻炒上色。', '加姜片、料酒、生抽、老抽翻炒。', '加热水没过排骨，小火炖30分钟。', '加醋和冰糖大火收汁，撒白芝麻。'] },
    { id: 'r07', name: '麻婆豆腐', category: '家常菜', emoji: '🌶️', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#F6D365,#FDA085)',
      ingredients: ['嫩豆腐 1块', '牛肉末 80克', '豆瓣酱 1勺', '花椒粉 少许', '蒜末 适量', '生抽 1勺', '水淀粉 适量', '葱花 少许'],
      steps: ['豆腐切块，加盐开水浸泡去豆腥。', '热油炒香牛肉末、豆瓣酱和蒜末。', '加一小碗水烧开，放入豆腐轻推煮3分钟。', '分两次勾芡收汁。', '撒花椒粉和葱花出锅。'] },
    { id: 'r08', name: '红烧茄子', category: '家常菜', emoji: '🍆', time: '20分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#84FAB0,#8FD3F4)',
      ingredients: ['长茄子 2根', '蒜 4瓣', '青红椒 各半个', '生抽 2勺', '老抽 少许', '糖 1勺', '豆瓣酱 半勺', '水淀粉 适量'],
      steps: ['茄子切滚刀块，撒盐腌出水后攥干。', '热油煎软茄子盛出。', '爆香蒜末和豆瓣酱。', '下茄子、青红椒，加生抽老抽糖调味。', '勾薄芡翻炒均匀出锅。'] },
    { id: 'r09', name: '木须肉', category: '家常菜', emoji: '🥚', time: '20分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#FBC2EB,#A6C1EE)',
      ingredients: ['里脊肉 150克', '鸡蛋 2个', '木耳 适量', '黄瓜 半根', '黄花菜 少许', '盐 适量', '生抽 1勺'],
      steps: ['肉片腌制，鸡蛋炒散盛出。', '热锅滑炒肉片至变色。', '下木耳、黄花菜、黄瓜翻炒。', '倒回鸡蛋，加盐和生抽炒匀。'] },
    { id: 'r10', name: '青椒肉丝', category: '家常菜', emoji: '🫑', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['里脊肉 150克', '青椒 2个', '姜丝 少许', '盐 适量', '生抽 1勺', '水淀粉 适量'],
      steps: ['里脊切丝，加少许盐和水淀粉腌制。', '青椒切丝。', '热锅滑炒肉丝至变色盛出。', '下青椒丝翻炒断生，倒回肉丝加盐和生抽炒匀。'] },
    { id: 'r11', name: '回锅肉', category: '家常菜', emoji: '🥓', time: '25分钟', difficulty: '中等', serves: '3人份', color: 'linear-gradient(135deg,#FCCF31,#F55555)',
      ingredients: ['五花肉 300克', '青蒜 2根', '豆瓣酱 1勺', '豆豉 少许', '甜面酱 半勺', '姜片 适量', '料酒 1勺'],
      steps: ['五花肉加姜片料酒煮至八分熟，放凉切片。', '锅中少油下肉片煸炒至微卷出油。', '下豆瓣酱、豆豉、甜面酱炒出红油。', '下青蒜段大火翻炒断生出锅。'] },
    { id: 'r12', name: '蒜蓉西兰花', category: '快手菜', emoji: '🥦', time: '12分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#84FAB0,#8FD3F4)',
      ingredients: ['西兰花 1颗', '蒜 4瓣', '盐 适量', '蚝油 1勺', '水淀粉 适量'],
      steps: ['西兰花掰小朵，盐水浸泡后焯水。', '沥干摆盘。', '热油爆香蒜末。', '加蚝油、盐和少许水烧开，勾薄芡淋在西兰花上。'] },
    { id: 'r13', name: '酸辣土豆丝', category: '快手菜', emoji: '🥔', time: '12分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#F6D365,#FDA085)',
      ingredients: ['土豆 2个', '干辣椒 4个', '花椒 少许', '白醋 2勺', '盐 适量', '蒜片 适量'],
      steps: ['土豆切细丝，冲洗去淀粉后泡水。', '热油爆香干辣椒、花椒、蒜片。', '下土豆丝大火快炒。', '沿锅边淋白醋，加盐炒至断生出锅。'] },
    { id: 'r14', name: '清炒时蔬', category: '快手菜', emoji: '🥬', time: '10分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['时令绿叶菜 400克', '蒜 3瓣', '盐 适量', '食用油 适量'],
      steps: ['青菜洗净沥干，蒜切末。', '热锅热油下蒜末爆香。', '下青菜大火快炒。', '加盐调味，炒至断生即可出锅。'] },
    { id: 'r15', name: '蚝油生菜', category: '快手菜', emoji: '🥗', time: '8分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['生菜 2棵', '蚝油 2勺', '生抽 1勺', '蒜 3瓣', '糖 少许', '水淀粉 适量'],
      steps: ['生菜洗净，开水焯烫10秒捞出摆盘。', '热油爆香蒜末。', '加蚝油、生抽、糖和半碗水煮开。', '勾薄芡淋在生菜上。'] },
    { id: 'r16', name: '西红柿鸡蛋汤', category: '汤羹', emoji: '🍲', time: '15分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#FF9A9E,#FECFEF)',
      ingredients: ['番茄 2个', '鸡蛋 2个', '葱花 少许', '盐 适量', '香油 几滴', '水淀粉 适量'],
      steps: ['番茄切块，鸡蛋打散。', '热油炒番茄出汁，加开水煮开。', '淋入蛋液成蛋花。', '加盐调味，勾薄芡撒葱花滴香油。'] },
    { id: 'r17', name: '紫菜蛋花汤', category: '汤羹', emoji: '🍥', time: '10分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['紫菜 1小把', '鸡蛋 2个', '虾皮 少许', '葱花 少许', '盐 适量', '香油 几滴'],
      steps: ['锅中加水煮开，放入紫菜和虾皮。', '淋入打散的蛋液成蛋花。', '加盐调味。', '关火撒葱花滴香油。'] },
    { id: 'r18', name: '玉米排骨汤', category: '汤羹', emoji: '🌽', time: '60分钟', difficulty: '中等', serves: '4人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['肋排 500克', '甜玉米 2根', '胡萝卜 1根', '姜 3片', '盐 适量', '枸杞 少许'],
      steps: ['排骨焯水去浮沫。', '玉米切段，胡萝卜切块。', '排骨和姜片加足开水，大火烧开后小火炖30分钟。', '下玉米、胡萝卜再炖20分钟。', '加盐和枸杞，再煮5分钟。'] },
    { id: 'r19', name: '冬瓜丸子汤', category: '汤羹', emoji: '🍈', time: '30分钟', difficulty: '中等', serves: '3人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['猪肉馅 200克', '冬瓜 300克', '鸡蛋清 1个', '姜末 少许', '盐 适量', '胡椒粉 少许', '香油 几滴'],
      steps: ['肉馅加姜末、蛋清、盐和少许水搅打上劲。', '冬瓜去皮切片。', '水微开时下入丸子，撇去浮沫。', '下冬瓜煮至透明。', '加盐、胡椒粉调味，滴香油出锅。'] },
    { id: 'r20', name: '酸辣汤', category: '汤羹', emoji: '🥘', time: '20分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#F6D365,#FDA085)',
      ingredients: ['豆腐 半块', '木耳 适量', '胡萝卜 半根', '鸡蛋 1个', '白醋 3勺', '白胡椒粉 适量', '盐 适量', '水淀粉 适量'],
      steps: ['豆腐、木耳、胡萝卜切丝。', '锅中烧水，下配菜煮开。', '淋入蛋液成蛋花。', '加盐调底味，淋白醋和胡椒粉。', '勾芡出锅。'] },
    { id: 'r21', name: '银耳莲子羹', category: '甜品', emoji: '🫕', time: '90分钟', difficulty: '中等', serves: '4人份', color: 'linear-gradient(135deg,#84FAB0,#8FD3F4)',
      ingredients: ['干银耳 1朵', '莲子 30克', '红枣 6颗', '冰糖 适量', '枸杞 少许'],
      steps: ['银耳提前泡发，撕成小朵。', '银耳、莲子加足量水煮开。', '转小火慢炖50分钟至出胶。', '加红枣、冰糖再炖20分钟。', '关火前撒枸杞。'] },
    { id: 'r22', name: '红糖糍粑', category: '甜品', emoji: '🍡', time: '30分钟', difficulty: '中等', serves: '3人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['糯米粉 200克', '温水 适量', '红糖 50克', '黄豆粉 少许', '食用油 适量'],
      steps: ['糯米粉加温水揉成光滑面团。', '搓成小长条。', '锅中少油煎至两面金黄鼓起。', '红糖加水小火熬成糖浆。', '淋在糍粑上，撒黄豆粉。'] },
    { id: 'r23', name: '红豆沙小圆子', category: '甜品', emoji: '🍡', time: '60分钟', difficulty: '简单', serves: '4人份', color: 'linear-gradient(135deg,#A18CD1,#FBC2EB)',
      ingredients: ['红豆 150克', '糯米小圆子 150克', '冰糖 适量', '清水 适量'],
      steps: ['红豆提前泡一夜，加水煮至软烂。', '加冰糖调味煮成红豆沙。', '另起锅煮小圆子至浮起。', '捞出圆子放入红豆沙中即可。'] },
    { id: 'r24', name: '蛋炒饭', category: '主食', emoji: '🍚', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['隔夜米饭 2碗', '鸡蛋 2个', '火腿丁 适量', '玉米粒 适量', '葱花 适量', '盐 适量', '生抽 1勺'],
      steps: ['鸡蛋打散，热油炒碎盛出。', '锅中放油，下米饭炒散。', '加火腿丁和玉米粒翻炒。', '倒回鸡蛋，加盐和生抽炒匀。', '撒葱花出锅。'] },
    { id: 'r25', name: '葱油拌面', category: '主食', emoji: '🍜', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['细面条 200克', '小葱 1把', '生抽 3勺', '老抽 1勺', '糖 1勺', '食用油 适量'],
      steps: ['小葱切段，冷油下锅小火熬成焦黄葱油。', '加生抽、老抽、糖小火煮开成酱汁。', '面条煮熟过凉水沥干。', '淋上葱油酱汁拌匀，摆上葱段。'] },
    { id: 'r26', name: '拍黄瓜', category: '凉菜', emoji: '🥒', time: '10分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#96E6A1,#D4FC79)',
      ingredients: ['黄瓜 2根', '蒜 4瓣', '醋 2勺', '生抽 1勺', '香油 少许', '盐 适量', '糖 少许'],
      steps: ['黄瓜拍碎切段，加盐腌5分钟倒掉水分。', '蒜末加醋、生抽、糖、香油调成料汁。', '淋在黄瓜上拌匀。', '冷藏片刻更入味。'] },
    { id: 'r27', name: '凉拌木耳', category: '凉菜', emoji: '🍄', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#FBC2EB,#A6C1EE)',
      ingredients: ['干木耳 20克', '蒜 3瓣', '小米椒 1个', '香菜 适量', '生抽 2勺', '醋 2勺', '香油 少许', '糖 少许'],
      steps: ['木耳泡发洗净，开水焯2分钟过凉水。', '蒜末、小米椒加生抽、醋、糖、香油调汁。', '淋在木耳上拌匀。', '撒香菜段。'] },
    { id: 'r28', name: '皮蛋瘦肉粥', category: '早餐', emoji: '🥣', time: '45分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#FF9A9E,#FECFEF)',
      ingredients: ['大米 1杯', '皮蛋 2个', '瘦肉 100克', '姜丝 少许', '葱花 少许', '盐 适量', '白胡椒粉 少许'],
      steps: ['大米提前浸泡，加水熬成浓稠白粥。', '瘦肉切丝加盐腌制，皮蛋切丁。', '粥中加入皮蛋和肉丝煮5分钟。', '加姜丝、盐、白胡椒粉调味。', '撒葱花出锅。'] },
    { id: 'r29', name: '葱花鸡蛋饼', category: '早餐', emoji: '🫓', time: '15分钟', difficulty: '简单', serves: '2人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['面粉 150克', '鸡蛋 2个', '小葱 3根', '盐 适量', '清水 适量', '食用油 适量'],
      steps: ['面粉加水调成可流动面糊，打入鸡蛋打匀。', '加葱花和盐拌匀。', '平底锅刷油，舀一勺面糊摊匀。', '小火煎至两面金黄。', '出锅卷起切块。'] },
    { id: 'r30', name: '南瓜小米粥', category: '早餐', emoji: '🎃', time: '40分钟', difficulty: '简单', serves: '3人份', color: 'linear-gradient(135deg,#FFE259,#FFA751)',
      ingredients: ['南瓜 200克', '小米 80克', '红枣 4颗', '冰糖 适量', '清水 适量'],
      steps: ['南瓜去皮切小块。', '小米淘洗干净，与南瓜一同下锅。', '加足量水大火煮开，转小火熬30分钟。', '加红枣、冰糖煮至软烂。', '搅拌一下即可盛出。'] }
  ];

  var FAV_KEY = 'sxz_recipe_favs_v1';
  var DIET_KEY = 'sxz_recipe_diet_v1';
  var MEALS = ['早餐', '午餐', '晚餐', '加餐'];

  function toast(msg) {
    if (window.Core && typeof Core.toast === 'function') { Core.toast(msg); return; }
    try { alert(msg); } catch (e) {}
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, "\\'");
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function nowHM() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  var RecipeApp = {
    mode: 'recipes',
    tab: 'all',
    keyword: '',
    view: 'list',
    currentId: null,
    favs: {},
    diet: [],
    mealSel: '早餐',
    dietDate: '',
    commentTargetId: null,
    commentRole: null,

    /* ============ 收藏 ============ */
    _loadFavs: function () {
      this.favs = {};
      try {
        var raw = localStorage.getItem(FAV_KEY);
        if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') this.favs = o; }
      } catch (e) {}
    },

    _saveFavs: function () {
      try { localStorage.setItem(FAV_KEY, JSON.stringify(this.favs)); } catch (e) {}
    },

    isFav: function (id) { return !!this.favs[id]; },

    toggleFav: function (id, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (this.favs[id]) { delete this.favs[id]; } else { this.favs[id] = 1; }
      this._saveFavs();
      var r = this.findById(id);
      toast((this.favs[id] ? '已收藏' : '已取消收藏') + '：' + (r ? r.name : ''));
      this.render();
    },

    /* ============ 菜谱查询 ============ */
    findById: function (id) {
      for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) return RECIPES[i];
      return null;
    },

    /* ============ 视图切换 ============ */
    setCategory: function (key) {
      this.mode = 'recipes';
      this.tab = key;
      this.keyword = '';
      var el = document.getElementById('recipe-search-input');
      if (el) el.value = '';
      this.render();
    },

    showDiet: function () {
      this.mode = 'diet';
      this.render();
    },

    showRecipes: function () {
      this.mode = 'recipes';
      this.render();
    },

    onSearch: function () {
      var el = document.getElementById('recipe-search-input');
      this.keyword = (el && el.value) || '';
      this.render();
    },

    openDetail: function (id) {
      this.view = 'detail';
      this.currentId = id;
      this.render();
    },

    backToList: function () {
      this.view = 'list';
      this.currentId = null;
      this.render();
    },

    /* ============ 菜谱过滤 ============ */
    _filtered: function () {
      var kw = (this.keyword || '').trim().toLowerCase();
      var out = [];
      for (var i = 0; i < RECIPES.length; i++) {
        var r = RECIPES[i];
        if (this.tab === 'favs' && !this.favs[r.id]) continue;
        if (this.tab !== 'all' && this.tab !== 'favs' && r.category !== this.tab) continue;
        if (kw) {
          var hay = (r.name + ' ' + r.category + ' ' + r.ingredients.join(' ')).toLowerCase();
          if (hay.indexOf(kw) === -1) continue;
        }
        out.push(r);
      }
      return out;
    },

    _tabTitle: function () {
      if (this.tab === 'favs') return '⭐ 我的收藏';
      if (this.tab === 'all') return '全部菜谱';
      return this.tab + '菜谱';
    },

    /* ============ 左侧竖向侧边栏 ============ */
    _sidebarHtml: function () {
      var cats = [
        { key: 'all', label: '全部', icon: 'fa-images' },
        { key: '家常菜', label: '家常菜', icon: 'fa-house' },
        { key: '快手菜', label: '快手菜', icon: 'fa-bolt' },
        { key: '汤羹', label: '汤羹', icon: 'fa-tint' },
        { key: '甜品', label: '甜品', icon: 'fa-gift' },
        { key: '主食', label: '主食', icon: 'fa-database' },
        { key: '凉菜', label: '凉菜', icon: 'fa-tree' },
        { key: '早餐', label: '早餐', icon: 'fa-sun' }
      ];
      var html = '<div class="recipe-sidebar">';
      for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        var act = (this.mode === 'recipes' && this.tab === c.key) ? ' active' : '';
        html += '<button class="recipe-sb-item' + act + '" onclick="RecipeApp.setCategory(\'' + c.key + '\')">' +
          '<i class="fas ' + c.icon + '"></i><span>' + c.label + '</span></button>';
      }
      html += '<div class="recipe-sidebar-sep"></div>';
      var favAct = (this.mode === 'recipes' && this.tab === 'favs') ? ' active' : '';
      html += '<button class="recipe-sb-item' + favAct + '" onclick="RecipeApp.setCategory(\'favs\')">' +
        '<i class="fas fa-star"></i><span>我的收藏</span></button>';
      var dietAct = (this.mode === 'diet') ? ' active' : '';
      html += '<button class="recipe-sb-item' + dietAct + '" onclick="RecipeApp.showDiet()">' +
        '<i class="fas fa-book-open"></i><span>饮食记录</span></button>';
      html += '</div>';
      return html;
    },

    /* ============ 菜谱卡片 ============ */
    _cardHtml: function (r) {
      var fav = this.isFav(r.id);
      return '<div class="recipe-card glass-card" onclick="RecipeApp.openDetail(\'' + r.id + '\')">' +
        '<div class="recipe-cover" style="background:' + r.color + '"><span class="recipe-cover-emoji">' + r.emoji + '</span></div>' +
        '<button class="recipe-fav' + (fav ? ' on' : '') + '" onclick="RecipeApp.toggleFav(\'' + r.id + '\', event)"><i class="fas fa-star"></i></button>' +
        '<div class="recipe-card-body">' +
          '<div class="recipe-name">' + r.name + '</div>' +
          '<div class="recipe-tags"><span class="recipe-tag">⏱ ' + r.time + '</span><span class="recipe-tag">' + r.difficulty + '</span><span class="recipe-tag">' + r.serves + '</span></div>' +
          '<div class="recipe-cat">' + r.category + '</div>' +
        '</div>' +
      '</div>';
    },

    /* ============ 菜谱列表（右侧内容区） ============ */
    _recipesHtml: function () {
      var list = this._filtered();
      var html = '<div class="recipe-search">' +
          '<i class="fas fa-search"></i>' +
          '<input type="text" id="recipe-search-input" placeholder="搜索菜名或食材" oninput="RecipeApp.onSearch()" value="' + escHtml(this.keyword) + '">' +
        '</div>' +
        '<div class="recipe-list-head"><span class="recipe-list-title">' + this._tabTitle() + '</span><span class="recipe-list-count">共 ' + list.length + ' 道</span></div>';
      if (!list.length) {
        html += '<div class="recipe-empty"><i class="fas fa-book-open"></i>' + (this.tab === 'favs' ? '还没有收藏菜谱，点击卡片右上角星标收藏吧' : '没有找到匹配的菜谱，换个关键词试试') + '</div>';
        return html;
      }
      var grid = '<div class="recipe-grid">';
      for (var i = 0; i < list.length; i++) grid += this._cardHtml(list[i]);
      grid += '</div>';
      return html + grid;
    },

    /* ============ 菜谱详情 ============ */
    _detailHtml: function () {
      var r = this.findById(this.currentId);
      if (!r) { this.view = 'list'; return this._recipesHtml(); }
      var fav = this.isFav(r.id);
      var ing = '';
      for (var i = 0; i < r.ingredients.length; i++) ing += '<div class="recipe-ingredient">' + r.ingredients[i] + '</div>';
      var steps = '';
      for (var j = 0; j < r.steps.length; j++) {
        steps += '<div class="recipe-step"><span class="recipe-step-num">' + (j + 1) + '</span><span>' + r.steps[j] + '</span></div>';
      }
      return '<div class="recipe-detail">' +
        '<button class="glass-btn recipe-back" onclick="RecipeApp.backToList()"><i class="fas fa-chevron-left"></i> 返回菜谱列表</button>' +
        '<div class="recipe-detail-cover glass-card" style="background:' + r.color + '"><span class="recipe-detail-emoji">' + r.emoji + '</span></div>' +
        '<div class="recipe-detail-title">' + r.name + '</div>' +
        '<div class="recipe-detail-meta">' +
          '<span><i class="fas fa-clock"></i> ' + r.time + '</span>' +
          '<span><i class="fas fa-tachometer-alt"></i> 难度：' + r.difficulty + '</span>' +
          '<span><i class="fas fa-users"></i> ' + r.serves + '</span>' +
        '</div>' +
        '<div class="recipe-detail-fav-row">' +
          '<button class="recipe-detail-fav' + (fav ? ' on' : '') + '" onclick="RecipeApp.toggleFav(\'' + r.id + '\', event)"><i class="fas fa-star"></i> ' + (fav ? '已收藏' : '收藏') + '</button>' +
        '</div>' +
        '<div class="recipe-section-title"><i class="fas fa-clipboard-list"></i> 用料清单</div>' +
        '<div class="recipe-ingredients glass-card">' + ing + '</div>' +
        '<div class="recipe-section-title"><i class="fas fa-clipboard-check"></i> 做法步骤</div>' +
        '<div class="recipe-steps">' + steps + '</div>' +
      '</div>';
    },

    /* ============ 日常饮食记录 ============ */
    _loadDiet: function () {
      this.diet = [];
      try {
        var raw = localStorage.getItem(DIET_KEY);
        if (raw) {
          var arr = JSON.parse(raw);
          if (Object.prototype.toString.call(arr) === '[object Array]') this.diet = arr;
        }
      } catch (e) {}
    },

    _saveDiet: function () {
      try { localStorage.setItem(DIET_KEY, JSON.stringify(this.diet)); } catch (e) {}
    },

    getDiet: function (id) {
      for (var i = 0; i < this.diet.length; i++) if (this.diet[i].id === id) return this.diet[i];
      return null;
    },

    setMeal: function (m) {
      this.mealSel = m;
      var wrap = document.getElementById('recipe-diet-meals');
      if (wrap) {
        var btns = wrap.querySelectorAll('.recipe-diet-meal');
        for (var i = 0; i < btns.length; i++) {
          btns[i].className = 'recipe-diet-meal' + (btns[i].getAttribute('data-meal') === m ? ' active' : '');
        }
      }
    },

    _setDietDate: function (v) { this.dietDate = v; },

    addDiet: function () {
      var inp = document.getElementById('recipe-diet-text');
      var text = (inp && inp.value || '').trim();
      if (!text) { toast('先写下今天吃了什么吧～'); return; }
      var dateInp = document.getElementById('recipe-diet-date');
      var date = (dateInp && dateInp.value) || this.dietDate || todayStr();
      var rec = { id: 'd' + Date.now(), date: date, meal: this.mealSel, time: nowHM(), text: text, comments: [] };
      this.diet.push(rec);
      this._saveDiet();
      if (inp) inp.value = '';
      toast('已记录「' + date + ' ' + this.mealSel + '」');
      this.render();
    },

    delDiet: function (id) {
      var next = [];
      for (var i = 0; i < this.diet.length; i++) if (this.diet[i].id !== id) next.push(this.diet[i]);
      this.diet = next;
      this._saveDiet();
      toast('已删除该条记录');
      this.render();
    },

    _dietSorted: function () {
      var arr = this.diet.slice();
      arr.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (a.time || '') < (b.time || '') ? 1 : -1;
      });
      return arr;
    },

    _dietHtml: function () {
      if (!this.dietDate) this.dietDate = todayStr();
      var dateInp = '<input type="date" id="recipe-diet-date" class="recipe-diet-date" value="' + escHtml(this.dietDate) + '" onchange="RecipeApp._setDietDate(this.value)">';
      var meals = '<div class="recipe-diet-meals" id="recipe-diet-meals">';
      for (var i = 0; i < MEALS.length; i++) {
        var m = MEALS[i];
        meals += '<button class="recipe-diet-meal' + (this.mealSel === m ? ' active' : '') + '" data-meal="' + m + '" onclick="RecipeApp.setMeal(\'' + m + '\')">' + m + '</button>';
      }
      meals += '</div>';

      var composer = '<div class="recipe-diet-composer glass-card">' +
        '<div class="recipe-diet-composer-title"><i class="fas fa-clipboard-list"></i> 记一笔今天吃了啥</div>' +
        '<div class="recipe-diet-composer-row">' + dateInp + meals + '</div>' +
        '<input type="text" class="recipe-diet-input" id="recipe-diet-text" placeholder="如：番茄炒蛋 + 米饭 🍚" maxlength="60">' +
        '<button class="glass-btn primary recipe-diet-add" onclick="RecipeApp.addDiet()"><i class="fas fa-plus"></i> 添加记录</button>' +
      '</div>';

      var arr = this._dietSorted();
      var listHtml = '';
      if (!arr.length) {
        listHtml = '<div class="recipe-empty"><i class="fas fa-book-open"></i>还没有饮食记录，记下今天的一餐吧</div>';
      } else {
        listHtml = '<div class="recipe-diet-list">';
        var lastDay = '';
        for (var j = 0; j < arr.length; j++) {
          var it = arr[j];
          if (it.date !== lastDay) {
            lastDay = it.date;
            listHtml += '<div class="recipe-diet-day">' + (it.date === todayStr() ? '今天 · ' + it.date : it.date) + '</div>';
          }
          listHtml += this._dietItemHtml(it);
        }
        listHtml += '</div>';
      }

      return '<div class="recipe-diet-top"><button class="glass-btn recipe-diet-back" onclick="RecipeApp.showRecipes()"><i class="fas fa-chevron-left"></i> 返回菜谱库</button></div>' +
        '<div class="recipe-diet-page-title"><i class="fas fa-book-open"></i> 日常饮食记录</div>' +
        composer + listHtml;
    },

    _dietItemHtml: function (it) {
      var comments = it.comments || [];
      var html = '<div class="recipe-diet-item glass-card">' +
        '<div class="recipe-diet-item-head">' +
          '<span class="recipe-diet-meal-tag">' + escHtml(it.meal) + '</span>' +
          '<span class="recipe-diet-item-time">' + escHtml(it.time || '') + '</span>' +
          '<button class="recipe-diet-del" onclick="RecipeApp.delDiet(\'' + it.id + '\')" title="删除这条记录"><i class="fas fa-trash-alt"></i></button>' +
        '</div>' +
        '<div class="recipe-diet-item-text">' + escHtml(it.text) + '</div>';
      if (comments.length) {
        html += '<div class="recipe-comments">';
        for (var i = 0; i < comments.length; i++) {
          html += this._commentHtml(it.id, comments[i]);
        }
        html += '</div>';
      }
      html += '<button class="recipe-diet-comment-btn" onclick="RecipeApp.openComment(\'' + it.id + '\')"><i class="fas fa-comment-dots"></i> ' +
        (comments.length ? '点评 · ' + comments.length : '写点评') + '</button></div>';
      return html;
    },

    _commentHtml: function (recordId, c) {
      var av = '<div class="recipe-comment-avatar' + (c.avatarShape === 'square' ? ' square' : '') + '" style="background:' + c.avatarColor + '">' + escHtml(c.avatar || '?') + '</div>';
      if (c.avatarImage) {
        av = '<div class="recipe-comment-avatar' + (c.avatarShape === 'square' ? ' square' : '') + '" style="background:' + c.avatarColor + ';background-image:url(' + c.avatarImage + ');background-size:cover;background-position:center;background-repeat:no-repeat"></div>';
      }
      return '<div class="recipe-comment">' +
        av +
        '<div class="recipe-comment-body">' +
          '<div class="recipe-comment-name">' + escHtml(c.nickname || '角色') +
            '<button class="recipe-comment-del" onclick="RecipeApp.delComment(\'' + recordId + '\',\'' + c.id + '\')" title="删除点评"><i class="fas fa-times"></i></button>' +
          '</div>' +
          '<div class="recipe-comment-bubble">' + escHtml(c.text) + '</div>' +
        '</div>' +
      '</div>';
    },

    /* ============ 对方角色点评 ============ */
    _roleAvatarHtml: function (p, cls) {
      var shape = p.avatarShape === 'square' ? ' square' : '';
      if (p.avatarImage) {
        return '<div class="' + cls + shape + '" style="background:' + p.avatarColor + ';background-image:url(' + p.avatarImage + ');background-size:cover;background-position:center;background-repeat:no-repeat"></div>';
      }
      return '<div class="' + cls + shape + '" style="background:' + p.avatarColor + '">' + escHtml(p.avatar || '?') + '</div>';
    },

    _getRoles: function () {
      try {
        if (window.Storage && typeof Storage.getPartnerProfiles === 'function') {
          return Storage.getPartnerProfiles();
        }
      } catch (e) {}
      return [];
    },

    openComment: function (recordId) {
      var rec = this.getDiet(recordId);
      if (!rec) return;
      var roles = this._getRoles();
      if (!roles || !roles.length) {
        var panelNo = '<div class="glass-modal-title">点评饮食记录</div>' +
          '<div class="recipe-comment-empty">暂未配置任何角色，无法发起点评。<br>请先前往「设置 → 角色」添加另一半的角色。</div>' +
          '<div class="glass-modal-actions">' +
            '<button class="glass-btn primary" onclick="RecipeApp._closeCommentOverlay();Navigation.switchTab(\'settings\');"><i class="fas fa-users"></i> 去设置添加</button>' +
            '<button class="glass-btn" onclick="RecipeApp._closeCommentOverlay()">取消</button>' +
          '</div>';
        this._showOverlay(panelNo);
        return;
      }
      this.commentTargetId = recordId;
      this.commentRole = roles[0];
      var listHtml = '';
      for (var i = 0; i < roles.length; i++) {
        var p = roles[i];
        var active = i === 0 ? ' active' : '';
        listHtml += '<div class="recipe-role-option' + active + '" onclick="RecipeApp._pickRole(' + i + ')">' +
          this._roleAvatarHtml(p, 'recipe-role-avatar') +
          '<span class="recipe-role-name">' + escHtml(p.nickname) + '</span>' +
          '<span class="recipe-role-check"><i class="fas fa-check"></i></span>' +
        '</div>';
      }
      var panel = '<div class="glass-modal-title">选择角色点评</div>' +
        '<div class="recipe-role-list">' + listHtml + '</div>' +
        '<textarea class="recipe-comment-input" id="recipe-comment-text" rows="3" maxlength="120" placeholder="以这位角色的身份说点什么…"></textarea>' +
        '<div class="glass-modal-actions">' +
          '<button class="glass-btn" onclick="RecipeApp._closeCommentOverlay()">取消</button>' +
          '<button class="glass-btn primary" onclick="RecipeApp._sendComment()"><i class="fas fa-paper-plane"></i> 发布点评</button>' +
        '</div>';
      this._showOverlay(panel);
    },

    _pickRole: function (idx) {
      var roles = this._getRoles();
      if (!roles[idx]) return;
      this.commentRole = roles[idx];
      var opts = document.getElementsByClassName('recipe-role-option');
      for (var i = 0; i < opts.length; i++) {
        opts[i].className = 'recipe-role-option' + (i === idx ? ' active' : '');
      }
    },

    _sendComment: function () {
      var input = document.getElementById('recipe-comment-text');
      var text = (input && input.value || '').trim();
      if (!text) { toast('写点什么再发布吧～'); return; }
      var rec = this.getDiet(this.commentTargetId);
      if (!rec) { this._closeCommentOverlay(); return; }
      var role = this.commentRole || {};
      rec.comments = rec.comments || [];
      rec.comments.push({
        id: 'c' + Date.now(),
        partnerId: role.id || '',
        nickname: role.nickname || '角色',
        avatar: role.avatar || '?',
        avatarColor: role.avatarColor || '#C8B8E0',
        avatarImage: role.avatarImage || '',
        avatarShape: role.avatarShape || 'circle',
        text: text,
        ts: nowHM()
      });
      this._saveDiet();
      this._closeCommentOverlay();
      toast('点评已发布');
      this.render();
    },

    delComment: function (recordId, commentId) {
      var rec = this.getDiet(recordId);
      if (!rec) return;
      var next = [];
      var c = rec.comments || [];
      for (var i = 0; i < c.length; i++) if (c[i].id !== commentId) next.push(c[i]);
      rec.comments = next;
      this._saveDiet();
      toast('已删除点评');
      this.render();
    },

    _showOverlay: function (html) {
      this._closeCommentOverlay();
      var ov = document.createElement('div');
      ov.className = 'glass-modal-overlay';
      ov.id = 'recipe-comment-overlay';
      ov.onclick = function () { RecipeApp._closeCommentOverlay(); };
      ov.innerHTML = '<div class="glass-modal-panel" onclick="event.stopPropagation()">' + html + '</div>';
      document.body.appendChild(ov);
    },

    _closeCommentOverlay: function () {
      var ov = document.getElementById('recipe-comment-overlay');
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    },

    /* ============ 主渲染 ============ */
    render: function () {
      var container = document.getElementById('recipe-container');
      if (!container) return;
      this._loadFavs();
      this._loadDiet();

      if (this.view === 'detail') {
        container.innerHTML = '<div class="recipe-shell"><div class="recipe-main">' + this._detailHtml() + '</div></div>';
        return;
      }

      var mainHtml = this.mode === 'diet' ? this._dietHtml() : this._recipesHtml();
      container.innerHTML = '<div class="recipe-shell">' + this._sidebarHtml() +
        '<div class="recipe-main">' + mainHtml + '</div></div>';
      this._stickySidebar();
    },

    _stickySidebar: function () {
      var sb = document.querySelector('#recipe-container .recipe-sidebar');
      if (!sb) return;
      var safeTop = 0;
      try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--safe-top');
        if (v) safeTop = parseFloat(v) || 0;
      } catch (e) {}
      sb.style.position = 'sticky';
      sb.style.top = (safeTop + 64) + 'px';
      sb.style.maxHeight = (window.innerHeight - safeTop - 190) + 'px';
      sb.style.overflowY = 'auto';
    }
  };

  window.RecipeApp = RecipeApp;
  window.renderRecipe = function () {
    window.RecipeApp.render();
  };
})();
