/* ==== app.js ==== */
/* ===== 疯狗龙的情书 - 主应用逻辑 ===== */

const App = {
  init() {
    ThemeManager.init();
    Storage.setFontSize(Storage.getFontSize());
    this.initSplash();
    Navigation.init();
    JournalCard.render();
    // 全站来电：应用启动即启动"允许对方主动拨打"定时器（不限于聊天界面）
    startSimulateCallTimer();
    // 全站主动发送：应用启动即启动（不限于聊天界面），保证到点必发
    if (Storage.getProactiveSend()) {
      startProactiveTimer();
    }
    // 时空信箱：全站定时调度（对方主动来信 / 回信到点自动送达，不限于信箱页面）
    if (window.MailboxApp && typeof MailboxApp.startScheduler === 'function') {
      MailboxApp.startScheduler();
    }
    // 后台保活：若已开启则播放静音音频（无手势时等用户首次点击后恢复）
    if (Storage.getBackgroundKeepAlive()) {
      startKeepAliveAudio();
    }
  },
  
  /* === 欢迎页 === */
  initSplash() {
    const progress = document.getElementById('splash-progress');
    const progressDot = document.getElementById('splash-progress-dot');
    const splash = document.getElementById('splash-screen');
    const app = document.getElementById('app');
    
    if (!progress || !splash || !app) return;
    
    let val = 0;
    const interval = setInterval(() => {
      val += 2;
      if (val > 100) val = 100;
      progress.style.width = val + '%';
      if (progressDot) progressDot.style.left = val + '%';
      
      if (val >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          splash.classList.add('fade-out');
          app.classList.add('active');
          
          setTimeout(() => {
            splash.style.display = 'none';
          }, 700);
        }, 300);
      }
    }, 30);
  },
  
  /* === 播放提示音 === */
  playSound(type) {
    // 根据音效设置播放：接收/发送各自使用用户选择的音效（内置或自定义上传）
    try {
      if (!Storage.getSoundEnabled()) return;
      var soundId = type === 'receive' ? Storage.getReceiveSound() : Storage.getSendSound();
      if (!soundId) soundId = 'msg';

      // 自定义上传音效：从 IndexedDB 读取后播放
      if (soundId.indexOf('custom_') === 0) {
        var vol = Math.max(0, Math.min(1, (Storage.getSoundVolume() || 80) / 100));
        var playCustom = function(data) {
          if (!data) return;
          var audio = new Audio(data);
          audio.volume = vol;
          audio.play().catch(function() {});
        };
        if (window.SoundFileDB) {
          SoundFileDB.get(soundId).then(function(data) {
            if (data) { playCustom(data); return; }
            var legacy = Storage.getCustomSounds().filter(function(s) { return s.id === soundId; })[0];
            if (legacy && legacy.data) playCustom(legacy.data);
          }).catch(function() {});
        } else {
          var legacy2 = Storage.getCustomSounds().filter(function(s) { return s.id === soundId; })[0];
          if (legacy2 && legacy2.data) playCustom(legacy2.data);
        }
        return;
      }

      // 内置音效：复用音效合成器（与预览一致）
      if (typeof previewSound === 'function') {
        previewSound(soundId);
      }
    } catch(e) {}
  }
};

