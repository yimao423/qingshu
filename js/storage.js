/* ==== storage.js ==== */
/* ===== 疯狗龙的情书 - 本地存储管理 ===== */

/* ===== StickerDB: IndexedDB 表情包库（解决 localStorage 5MB 限制） ===== */
const StickerDB = {
  DB_NAME: 'MirrorStickers',
  DB_VERSION: 1,
  STORE_NAME: 'stickers',
  CAT_STORE_NAME: 'stickerCategories',
  _db: null,

  open: function() {
    if (this._db) return Promise.resolve(this._db);
    var self = this;
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE_NAME)) {
          db.createObjectStore(self.STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(self.CAT_STORE_NAME)) {
          db.createObjectStore(self.CAT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = function(e) {
        self._db = e.target.result;
        resolve(self._db);
      };
      req.onerror = function(e) {
        reject(e.target.error);
      };
    });
  },

  getAll: function() {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE_NAME, 'readonly');
        var store = tx.objectStore(self.STORE_NAME);
        var req = store.getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  // 返回随机一张表情包（用于自动回复），库为空返回 null
  getRandom: function() {
    return this.getAll().then(function(stickers) {
      if (!stickers || !stickers.length) return null;
      return stickers[Math.floor(Math.random() * stickers.length)];
    });
  },

  addMany: function(stickers) {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE_NAME, 'readwrite');
        var store = tx.objectStore(self.STORE_NAME);
        var count = 0;
        stickers.forEach(function(s) { store.add(s); count++; });
        tx.oncomplete = function() { resolve({ count: count }); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  },

  deleteMany: function(ids) {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE_NAME, 'readwrite');
        var store = tx.objectStore(self.STORE_NAME);
        ids.forEach(function(id) { store.delete(id); });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  },

  clearAll: function() {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.STORE_NAME, 'readwrite');
        var store = tx.objectStore(self.STORE_NAME);
        store.clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  },

  replaceAll: function(stickers) {
    var self = this;
    return this.clearAll().then(function() {
      return self.addMany(stickers);
    });
  },

  getCategories: function() {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.CAT_STORE_NAME, 'readonly');
        var store = tx.objectStore(self.CAT_STORE_NAME);
        var req = store.getAll();
        req.onsuccess = function() {
          resolve(req.result.map(function(r) { return r.name; }));
        };
        req.onerror = function() { reject(req.error); };
      });
    });
  },

  addCategory: function(name) {
    var self = this;
    return this.getCategories().then(function(cats) {
      if (cats.indexOf(name) !== -1) return Promise.resolve(cats);
      return self.open().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(self.CAT_STORE_NAME, 'readwrite');
          var store = tx.objectStore(self.CAT_STORE_NAME);
          store.add({ name: name });
          tx.oncomplete = function() {
            cats.push(name);
            resolve(cats);
          };
          tx.onerror = function() { reject(tx.error); };
        });
      });
    });
  },

  replaceCategories: function(names) {
    var self = this;
    return this.open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(self.CAT_STORE_NAME, 'readwrite');
        var store = tx.objectStore(self.CAT_STORE_NAME);
        store.clear();
        names.forEach(function(n) { store.add({ name: n }); });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  },

  /* 首次加载时迁移 localStorage 旧数据 */
  migrateIfNeeded: function() {
    var self = this;
    var oldStickers = null;
    try {
      var raw = localStorage.getItem('mirror_stickers');
      if (raw) { oldStickers = JSON.parse(raw); }
    } catch(e) {}

    var oldCats = null;
    try {
      var rawCats = localStorage.getItem('mirror_stickerCategories');
      if (rawCats) { oldCats = JSON.parse(rawCats); }
    } catch(e) {}

    if (!oldStickers && !oldCats) return Promise.resolve();

    return self.getAll().then(function(existing) {
      if (existing.length > 0) {
        /* 已有 IndexedDB 数据，跳过迁移，清理旧键 */
        localStorage.removeItem('mirror_stickers');
        localStorage.removeItem('mirror_stickerCategories');
        return Promise.resolve();
      }
      var promises = [];
      if (oldStickers && oldStickers.length) {
        promises.push(self.addMany(oldStickers));
      }
      if (oldCats && oldCats.length) {
        promises.push(self.replaceCategories(oldCats));
      }
      return Promise.all(promises).then(function() {
        localStorage.removeItem('mirror_stickers');
        localStorage.removeItem('mirror_stickerCategories');
      });
    });
  }
};

/* ============================================================
   AppKVDB: 通用 IndexedDB 键值镜像层（全局存储架构升级）
   覆盖所有仍走 localStorage 的 mirror_* 通用键（设置、月经记录、
   日记、树洞、记事本、字卡、收藏、商城等），作为权威持久层：
   - 每次 Storage.set 同步写 localStorage（保持现有同步 API 兼容）
     + 异步写 AppKVDB（无 5MB 配额、跟随设备永久保存）
   - 启动时双向智能同步：IDB 有而 localStorage 无/旧 → 回填，
     localStorage 更新 → 覆盖 IDB，避免任一方向覆盖丢数据
   ============================================================ */
var AppKVDB = (function() {
  var DB_NAME = 'mirror_app_kv_db';
  var DB_VER = 1;
  var STORE = 'kv';
  var _db = null;
  var _opening = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    if (!window.indexedDB) return Promise.reject(new Error('no indexedDB'));
    _opening = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = function(e) {
        _db = e.target.result;
        _opening = null;
        resolve(_db);
      };
      req.onerror = function() { _opening = null; reject(req.error); };
      req.onblocked = function() { _opening = null; reject(new Error('indexedDB blocked')); };
    });
    return _opening;
  }

  function put(record) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error); };
      });
    });
  }

  function get(key) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  function getAll() {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  function del(key) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  return { put: put, get: get, getAll: getAll, del: del };
})();
window.AppKVDB = AppKVDB;

/* ============================================================
   MessageDB: IndexedDB 持久化聊天记录
   （localStorage 容量约 5MB，图片/长对话易写满导致刷新后聊天记录丢失；
     IndexedDB 无容量限制，作为聊天记录的永久存储层，写入自动兜底）
   ============================================================ */
var MessageDB = (function() {
  var DB_NAME = 'mirror_message_db';
  var DB_VER = 1;
  var STORE = 'messages';
  var _db = null;
  var _opening = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    if (!window.indexedDB) return Promise.reject(new Error('no indexedDB'));
    _opening = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'chatId' });
        }
      };
      req.onsuccess = function(e) {
        _db = e.target.result;
        _opening = null;
        resolve(_db);
      };
      req.onerror = function() { _opening = null; reject(req.error); };
      req.onblocked = function() { _opening = null; reject(new Error('indexedDB blocked')); };
    });
    return _opening;
  }

  function set(chatId, messages) {
    // 串行写队列：保证写入顺序、减少并发事务堆积，降低刷新时事务未完成导致丢失的概率
    var write = _writeChain.then(function() {
      return _writeInternal(chatId, messages);
    });
    _writeChain = write.then(function() {}, function() {});
    return write;
  }

  var _writeChain = Promise.resolve();
  function _writeInternal(chatId, messages) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ chatId: chatId, messages: messages, updatedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error); };
      });
    });
  }

  /* 删除指定聊天的记录（清空聊天记录时同步清理 IndexedDB） */
  function del(chatId) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(chatId);
        tx.oncomplete = resolve;
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error); };
      });
    });
  }

  /* meta 记录（复用同一 store，key 前缀 __meta_）：用于持久化聊天列表等小数据 */
  function setMeta(key, value) {
    return set('__meta_' + key, value);
  }
  function getMeta(key) {
    return get('__meta_' + key);
  }

  function getAll() {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  function get(chatId) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(chatId);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  return { set: set, get: get, getAll: getAll, del: del, setMeta: setMeta, getMeta: getMeta };
})();
window.MessageDB = MessageDB;

const Storage = {
  PREFIX: 'mirror_',

  /* ===== 通用键 IndexedDB 镜像（全局存储架构升级） =====
     所有 mirror_* 通用键均双写 localStorage + AppKVDB：
     - localStorage 负责同步读取兼容（现有业务代码无需改动）
     - AppKVDB（IndexedDB）负责权威持久化，无 5MB 配额，跟随设备永久保存
     以下键已有专属 IndexedDB 存储（MessageDB/StickerDB/AlbumPhotoDB/
     AlbumMetaDB/CallBgDB 等），不纳入通用镜像，避免重复。 */
  _KV_SKIP_PREFIXES: ['msg_', 'chats', 'groupChats', 'albums', 'albums_ts', 'photos', 'stickers', 'stickerCategories', 'callBgImage', '__ts_', 'rp_'],

  _isKVMirrorable(key) {
    for (var i = 0; i < this._KV_SKIP_PREFIXES.length; i++) {
      var p = this._KV_SKIP_PREFIXES[i];
      if (key === p || key.indexOf(p) === 0) return false;
    }
    return true;
  },

  /* 启动时双向智能同步：localStorage <-> AppKVDB
     原则：仅"更新的一方"覆盖旧的一方；IDB 无记录时把 localStorage 迁入；
     localStorage 无/旧时回填 IDB。绝不无条件覆盖（避免刷新丢数据）。 */
  syncAllFromIDB() {
    if (!window.AppKVDB || !window.indexedDB) return Promise.resolve();
    var self = this;
    // 1) 先迁移 localStorage 中已有的 mirror_* 键到 IDB（双向比较）
    var lsKeys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(self.PREFIX) === 0 && self._isKVMirrorable(k.slice(self.PREFIX.length))) {
          lsKeys.push(k);
        }
      }
    } catch (e) {}
    var tasks = lsKeys.map(function(fullKey) {
      var key = fullKey.slice(self.PREFIX.length);
      var lsVal = null;
      try { lsVal = JSON.parse(localStorage.getItem(fullKey) || 'null'); }
      catch (e) { lsVal = null; }
      if (lsVal === null) return Promise.resolve();
      return AppKVDB.get(fullKey).then(function(record) {
        var dbTs = record && record.updatedAt ? record.updatedAt : 0;
        var lsTs = 0;
        try { lsTs = parseInt(localStorage.getItem(self.PREFIX + '__ts_' + key) || '0', 10) || 0; } catch (e) {}
        if (!record) {
          // IDB 无记录：迁移入 IDB（保留旧数据）
          return AppKVDB.put({ key: fullKey, value: lsVal, updatedAt: lsTs || Date.now() });
        }
        if (lsTs > dbTs) {
          // localStorage 更新：覆盖 IDB
          return AppKVDB.put({ key: fullKey, value: lsVal, updatedAt: lsTs });
        }
        // IDB 更新/相同：保持 IDB 为准，回填 localStorage（若缺失）
        if (localStorage.getItem(fullKey) === null) {
          try { localStorage.setItem(fullKey, JSON.stringify(record.value)); } catch (e2) {}
        }
        return Promise.resolve();
      }).catch(function() { return AppKVDB.put({ key: fullKey, value: lsVal, updatedAt: lsTs || Date.now() }); });
    });
    // 2) 反向：IDB 有而 localStorage 没有的键（清缓存/超限兜底），回填 localStorage
    return Promise.all(tasks).catch(function() {}).then(function() {
      return AppKVDB.getAll();
    }).then(function(records) {
      if (!records || !records.length) return;
      records.forEach(function(r) {
        if (!r || !r.key || r.key.indexOf(self.PREFIX) !== 0) return;
        var shortKey = r.key.slice(self.PREFIX.length);
        if (!self._isKVMirrorable(shortKey)) return;
        try {
          if (localStorage.getItem(r.key) === null) {
            localStorage.setItem(r.key, JSON.stringify(r.value));
          }
        } catch (e2) {}
      });
      // 同步完成后通知全局（业务可选择性监听做 UI 刷新）
      try {
        if (typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('mirror-storage-synced'));
        }
      } catch (e3) {}
    }).catch(function() {});
  },

  /* 申请持久化存储（navigator.storage.persist）：
     Safari/Chrome 支持时请求将站点存储标记为持久化，降低被系统清理概率 */
  requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(function() {});
      }
    } catch (e) {}
  },

  /* 检测 IndexedDB 在 file:// 等环境下的可用性。
     Chrome/Safari 的 file:// 下 IndexedDB 可用；Firefox 的 file:// 下可能被禁用；
     隐私模式下可能不可用。不可用时给出引导（本地起服务 / 降级 localStorage）。 */
  _checkIndexedDBAvailability() {
    var self = this;
    function showWarn(msg) {
      console.warn('[情书存储] ' + msg);
      try {
        if (window.Core && typeof Core.toast === 'function') {
          Core.toast(msg);
        }
      } catch (e) {}
    }
    try {
      if (!window.indexedDB) {
        showWarn('IndexedDB 不可用，将降级为 localStorage 存储（容量有限）。建议用本地服务访问：在网站目录执行 python3 -m http.server，然后访问 http://localhost:8000');
        return;
      }
      var dbName = '__love_letter_idb_probe__';
      var req = window.indexedDB.open(dbName, 1);
      var finished = false;
      req.onerror = function() {
        finished = true;
        showWarn('IndexedDB 打开失败，将降级为 localStorage 存储（容量有限）。建议用本地服务访问：在网站目录执行 python3 -m http.server，然后访问 http://localhost:8000');
      };
      req.onsuccess = function() {
        var db = req.result;
        try {
          var tx = db.transaction([], 'readonly');
          if (tx) { /* 事务可创建，视为可用 */ }
        } catch (e) {}
        try { db.close(); } catch (e2) {}
        try { window.indexedDB.deleteDatabase(dbName); } catch (e3) {}
        finished = true;
      };
      req.onblocked = function() {
        if (!finished) {
          console.warn('[情书存储] IndexedDB 探测被阻塞（可能隐私模式），继续使用现有存储通道');
        }
      };
      // 超时保护
      setTimeout(function() {
        if (!finished) {
          try { window.indexedDB.deleteDatabase(dbName); } catch (e) {}
        }
      }, 3000);
    } catch (e) {
      showWarn('IndexedDB 不可用，将降级为 localStorage 存储（容量有限）。建议用本地服务访问：在网站目录执行 python3 -m http.server，然后访问 http://localhost:8000');
    }
  },

  get(key, defaultValue = null) {
    try {
      const val = localStorage.getItem(this.PREFIX + key);
      if (val !== null) return JSON.parse(val);
    } catch (e) {
      return defaultValue;
    }
    // localStorage 无值（清缓存/超限）：异步从 AppKVDB 兜底恢复（保持同步 API 兼容）
    if (window.AppKVDB && this._isKVMirrorable(key)) {
      var self = this;
      AppKVDB.get(this.PREFIX + key).then(function(record) {
        if (!record || record.value === undefined) return;
        try {
          localStorage.setItem(self.PREFIX + key, JSON.stringify(record.value));
        } catch (e2) {}
        try {
          if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('mirror-storage-restored', { detail: { key: key, value: record.value } }));
          }
        } catch (e3) {}
      }).catch(function() {});
    }
    return defaultValue;
  },
  
  set(key, value) {
    var ok = false;
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
      ok = true;
    } catch (e) {
      console.warn('Storage.set failed:', e.message);
    }
    // 同步 IndexedDB 镜像（权威持久化）：localStorage 5MB 超限时数据仍不丢
    if (window.AppKVDB && this._isKVMirrorable(key)) {
      AppKVDB.put({ key: this.PREFIX + key, value: value, updatedAt: Date.now() }).catch(function() {});
    }
    // 时间戳键：用于启动双向同步比较版本（不阻塞业务）
    try {
      localStorage.setItem(this.PREFIX + '__ts_' + key, String(Date.now()));
    } catch (e2) {}
    return ok;
  },
  
  remove(key) {
    try {
      localStorage.removeItem(this.PREFIX + key);
    } catch (e) {}
    try {
      localStorage.removeItem(this.PREFIX + '__ts_' + key);
    } catch (e2) {}
    if (window.AppKVDB && this._isKVMirrorable(key)) {
      AppKVDB.del(this.PREFIX + key).catch(function() {});
    }
  },
  
  // === 聊天数据 ===
  // 内存消息缓存：localStorage 超限写入失败时，当前会话仍可正常渲染显示
  _msgCache: {},
  // 消息缓存更新时间戳（key: 'msg_<chatId>' -> 最近一次 setMessages 的内存时间；用于与 IndexedDB updatedAt 比较，避免旧数据覆盖新数据）
  _msgUpdatedAt: {},
  // 聊天列表内存缓存：localStorage 写失败时页面仍保持正确状态，刷新后从 IndexedDB 恢复
  _chatsCache: null,
  _groupChatsCache: null,
  _metaUpdatedAt: {},

  getChats() {
    if (this._chatsCache) return this._chatsCache;
    var fromLS = this.get('chats', null);
    if (fromLS !== null && Array.isArray(fromLS)) {
      this._chatsCache = fromLS;
      this._metaUpdatedAt['chats'] = 0;
      this._restoreMetaFromIDB('chats');
      return fromLS;
    }
    // localStorage 无数据：异步从 IndexedDB 恢复（localStorage 清空/超限后兜底）
    this._restoreMetaFromIDB('chats');
    return DefaultData.chats;
  },
  
  setChats(chats) {
    this._chatsCache = chats;
    this._metaUpdatedAt['chats'] = Date.now();
    this.set('chats', chats);
    // 同步 IndexedDB 持久化聊天列表：localStorage 超限时列表仍不丢失
    if (window.MessageDB) MessageDB.setMeta('chats', chats).catch(function() {});
  },

  // === 群聊数据 ===
  getGroupChats() {
    if (this._groupChatsCache) return this._groupChatsCache;
    var fromLS = this.get('groupChats', null);
    if (fromLS !== null && Array.isArray(fromLS)) {
      this._groupChatsCache = fromLS;
      this._metaUpdatedAt['groupChats'] = 0;
      this._restoreMetaFromIDB('groupChats');
      return fromLS;
    }
    this._restoreMetaFromIDB('groupChats');
    return [];
  },
  
  setGroupChats(groups) {
    this._groupChatsCache = groups;
    this._metaUpdatedAt['groupChats'] = Date.now();
    this.set('groupChats', groups);
    if (window.MessageDB) MessageDB.setMeta('groupChats', groups).catch(function() {});
  },

  /* 从 IndexedDB 恢复聊天列表/群聊列表（meta 记录），仅在 IDB 数据更新时覆盖 */
  _restoreMetaFromIDB(key) {
    if (!window.MessageDB || !key) return;
    var self = this;
    MessageDB.getMeta(key).then(function(record) {
      if (!record || !Array.isArray(record.messages)) return;
      var updatedAt = record.updatedAt || 0;
      if (updatedAt <= (self._metaUpdatedAt[key] || 0)) return;
      self._metaUpdatedAt[key] = updatedAt;
      var list = record.messages;
      if (key === 'chats') {
        self._chatsCache = list;
        self.set('chats', list);
      } else if (key === 'groupChats') {
        self._groupChatsCache = list;
        self.set('groupChats', list);
      }
      if (typeof Navigation !== 'undefined' && typeof Navigation._renderChatList === 'function') {
        Navigation._renderChatList();
      }
    }).catch(function() {});
  },
  
  getMessages(chatId) {
    var cacheKey = 'msg_' + chatId;
    if (this._msgCache[cacheKey]) return this._msgCache[cacheKey];
    var fromLS = this.get(cacheKey, null);
    if (fromLS !== null && Array.isArray(fromLS)) {
      this._msgCache[cacheKey] = fromLS;
      this._msgUpdatedAt[cacheKey] = 0;
      this._restoreFromIDB(chatId);
      return fromLS;
    }
    // localStorage 无数据：异步从 IndexedDB 兜底恢复（彻底修复刷新后聊天记录丢失）
    this._restoreFromIDB(chatId);
    return DefaultData.getMessages(chatId);
  },

  /* 合并两条消息数组（按 id 去重，按 time/id 升序），保留双方独有消息 */
  _mergeMessages(a, b) {
    var out = [];
    var seen = {};
    var pushAll = function(arr) {
      if (!Array.isArray(arr)) return;
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        if (!m) continue;
        var key = m.id || ('t' + (m.time || 0) + '_' + i);
        if (seen[key]) continue;
        seen[key] = true;
        out.push(m);
      }
    };
    pushAll(a);
    pushAll(b);
    out.sort(function(x, y) {
      var xt = x.time || 0, yt = y.time || 0;
      if (xt !== yt) return xt - yt;
      return (x.id || 0) - (y.id || 0);
    });
    return out;
  },

  /* 从 IndexedDB 异步恢复指定聊天的消息到内存缓存（localStorage 超限写入失败时的兜底） */
  _restoreFromIDB(chatId) {
    if (!window.MessageDB || !chatId) return;
    var self = this;
    var cacheKey = 'msg_' + chatId;
    MessageDB.get(chatId).then(function(record) {
      if (!record || !Array.isArray(record.messages)) return;
      // 仅当 IDB 数据比当前缓存更新时才覆盖，避免旧数据回填覆盖用户刚写的新数据
      var updatedAt = record.updatedAt || 0;
      var curUpdatedAt = self._msgUpdatedAt[cacheKey] || 0;
      if (updatedAt < curUpdatedAt) {
        // 内存缓存更新（用户刚发消息、IDB 可能还是旧快照）：合并双方，保留各自独有消息，写回 IDB 与 localStorage
        var merged = self._mergeMessages(self._msgCache[cacheKey], record.messages);
        self._msgCache[cacheKey] = merged;
        self._msgUpdatedAt[cacheKey] = Date.now();
        if (window.MessageDB) MessageDB.set(chatId, merged).catch(function() {});
        self.set(cacheKey, merged);
        var page2 = document.getElementById('page-chat-room');
        var curChatId2 = page2 ? page2.dataset.chatId : '';
        if (curChatId2 === chatId && typeof renderChatMessages === 'function') {
          renderChatMessages(chatId);
        }
        return;
      }
      self._msgCache[cacheKey] = record.messages;
      self._msgUpdatedAt[cacheKey] = updatedAt;
      // 尽力同步回 localStorage，下次启动可同步读取，减少异步窗口
      self.set(cacheKey, record.messages);
      var page = document.getElementById('page-chat-room');
      var curChatId = page ? page.dataset.chatId : '';
      if (curChatId === chatId && typeof renderChatMessages === 'function') {
        renderChatMessages(chatId);
      }
    }).catch(function() {});
  },
  
  setMessages(chatId, messages) {
    var cacheKey = 'msg_' + chatId;
    this._msgCache[cacheKey] = messages;
    this._msgUpdatedAt[cacheKey] = Date.now();
    this.set(cacheKey, messages);
    // 同步写入 IndexedDB 持久化：localStorage 容量有限（约5MB，图片消息易超限导致刷新丢失），IndexedDB 无此限制，保证聊天记录跟随设备永久保存
    if (window.MessageDB) {
      MessageDB.set(chatId, messages).catch(function() {});
    }
  },
  
  // === 字卡数据 ===
  getCards() {
    return this.get('cards', DefaultData.cards);
  },
  
  setCards(cards) {
    this.set('cards', cards);
  },
  
  getEmojis() {
    return this.get('emojis', DefaultData.emojis);
  },
  
  setEmojis(emojis) {
    this.set('emojis', emojis);
  },
  
  /* Emoji 分组排序（分组名数组，决定字卡列表与聊天面板的显示顺序） */
  getEmojiGroupOrder() {
    return this.get('emojiGroupOrder', []);
  },
  
  setEmojiGroupOrder(order) {
    this.set('emojiGroupOrder', order);
  },
  
  /* 最近使用的 emoji（聊天面板「最近使用」分区，最新在前，最多10个） */
  getRecentEmojis() {
    return this.get('recentEmojis', []);
  },
  
  setRecentEmojis(list) {
    this.set('recentEmojis', list);
  },
  
  getKaomojis() {
    return this.get('kaomojis', DefaultData.kaomojis);
  },
  
  setKaomojis(kaomojis) {
    this.set('kaomojis', kaomojis);
  },

  getPats() {
    return this.get('pats', DefaultData.pats);
  },
  
  setPats(pats) {
    this.set('pats', pats);
  },

  /* ===== 表情包（IndexedDB，异步方法） ===== */
  getStickersAsync: function() {
    return StickerDB.getAll();
  },

  addStickersAsync: function(stickers) {
    return StickerDB.addMany(stickers);
  },

  setStickersAsync: function(stickers) {
    return StickerDB.replaceAll(stickers);
  },

  getStickerCategoriesAsync: function() {
    return StickerDB.getCategories();
  },

  addStickerCategoryAsync: function(name) {
    return StickerDB.addCategory(name);
  },

  /* ===== 表情包（localStorage 旧版，已废弃，仅保留兼容） ===== */
  getStickers: function() {
    return this.get('stickers', DefaultData.stickers);
  },

  setStickers: function(stickers) {
    return this.set('stickers', stickers);
  },

  addStickers: function(stickers) {
    var all = this.getStickers();
    var merged = all.concat(stickers);
    var saved = this.setStickers(merged);
    if (!saved) { console.warn('Storage.addStickers: setStickers failed, possibly quota exceeded'); }
    return { stickers: merged, saved: saved };
  },

  getStickerCategories: function() {
    return this.get('stickerCategories', []);
  },

  setStickerCategories: function(cats) {
    this.set('stickerCategories', cats);
  },

  addStickerCategory: function(cat) {
    var cats = this.getStickerCategories();
    if (cats.indexOf(cat) === -1) {
      cats.push(cat);
      this.setStickerCategories(cats);
    }
    return cats;
  },

  // === 设置数据 ===
  getMyProfile() {
    var p = this.get('myProfile', null);
    if (!p) {
      p = { nickname: '我', avatar: '我', avatarColor: '#A8D8EA', avatarImage: '', avatarShape: 'circle' };
    }
    // 兼容旧数据：补全头像字段，避免聊天界面取不到图片头像
    if (p.avatarImage === undefined) p.avatarImage = '';
    if (p.avatarShape === undefined) p.avatarShape = 'circle';
    if (!p.avatarColor) p.avatarColor = '#A8D8EA';
    return p;
  },
  
  setMyProfile(profile) {
    this.set('myProfile', profile);
  },
  
  getPartnerProfile() {
    return this.get('partnerProfile', { nickname: '镜', avatar: '镜', avatarColor: '#C8B8E0' });
  },
  
  setPartnerProfile(profile) {
    this.set('partnerProfile', profile);
  },
  
  getPartnerProfiles() {
    var profiles = this.get('partnerProfiles', null);
    if (profiles === null) {
      var old = this.get('partnerProfile', null);
      if (old) {
        profiles = [{ id: 'partner_1', nickname: old.nickname, avatar: old.avatar, avatarColor: old.avatarColor, avatarImage: '', avatarShape: 'circle' }];
      } else {
        profiles = [];
      }
      this.set('partnerProfiles', profiles);
    }
    // 迁移旧数据：补全 avatarImage 和 avatarShape 字段
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].avatarImage === undefined) profiles[i].avatarImage = '';
      if (profiles[i].avatarShape === undefined) profiles[i].avatarShape = 'circle';
    }
    return profiles;
  },
  
  setPartnerProfiles(profiles) {
    this.set('partnerProfiles', profiles);
  },
  
  // 外观设置
  getFontSize() {
    return this.get('fontSize', 1);
  },
  
  setFontSize(size) {
    this.set('fontSize', size);
    document.documentElement.style.fontSize = (16 * size) + 'px';
  },
  
  // ===== 聊天设置 =====
  
  // --- 功能设置 - 交互 ---
  getReadReceipt() { return this.get('readReceipt', true); },
  setReadReceipt(v) { this.set('readReceipt', v); },
  getReadReceiptMode() { return this.get('readReceiptMode', 'icon'); },
  setReadReceiptMode(v) { this.set('readReceiptMode', v); },
  
  getReadIgnore() { return this.get('readIgnore', false); },
  setReadIgnore(v) { this.set('readIgnore', v); },
  
  getTypingIndicator() { return this.get('typingIndicator', true); },
  setTypingIndicator(v) { this.set('typingIndicator', v); },
  getTypingIndicatorText() { return this.get('typingIndicatorText', '对方正在输入…'); },
  setTypingIndicatorText(v) { this.set('typingIndicatorText', v); },
  getTypingSymbol() { return this.get('typingSymbol', '❤'); },
  setTypingSymbol(v) { this.set('typingSymbol', v); },
  
  // --- 拍一拍符号（我方发送 / 对方发送可分别自定义，默认爱心） ---
  getPatSelfSymbol() { return this.get('patSelfSymbol', '♥'); },
  setPatSelfSymbol(v) { this.set('patSelfSymbol', v); },
  getPatOtherSymbol() { return this.get('patOtherSymbol', '♥'); },
  setPatOtherSymbol(v) { this.set('patOtherSymbol', v); },
  
  getEnterToSend() { return this.get('enterToSend', true); },
  setEnterToSend(v) { this.set('enterToSend', v); },
  
  getShowRecallContent() { return this.get('showRecallContent', false); },
  setShowRecallContent(v) { this.set('showRecallContent', v); },
  
  // --- 功能设置 - 时间戳 ---
  getTimestampStyle() { return this.get('timestampStyle', 'time'); },
  setTimestampStyle(v) { this.set('timestampStyle', v); },
  
  // --- 节奏设置（单位：秒；旧版本为分钟，首次读取时自动迁移） ---
  _paceUnitMigrated: false,
  _ensurePaceSeconds() {
    if (this._paceUnitMigrated) return;
    this._paceUnitMigrated = true;
    if (this.get('paceUnitV2', false)) return;
    var rawMin = this.get('replyMinDelay', null);
    var rawMax = this.get('replyMaxDelay', null);
    var rawInterval = this.get('proactiveSendInterval', null);
    if (rawMin !== null) this.set('replyMinDelay', Math.max(1, Math.round(rawMin * 60)));
    if (rawMax !== null) this.set('replyMaxDelay', Math.max(1, Math.round(rawMax * 60)));
    if (rawInterval !== null) this.set('proactiveSendInterval', Math.max(1, Math.round(rawInterval * 60)));
    this.set('paceUnitV2', true);
  },
  getReplyMinDelay() { this._ensurePaceSeconds(); return this.get('replyMinDelay', 30); },
  setReplyMinDelay(v) { this.set('replyMinDelay', v); },
  
  getReplyMaxDelay() { this._ensurePaceSeconds(); return this.get('replyMaxDelay', 180); },
  setReplyMaxDelay(v) { this.set('replyMaxDelay', v); },
  
  getProactiveSend() { return this.get('proactiveSend', false); },
  setProactiveSend(v) { this.set('proactiveSend', v); },
  
  getProactiveSendInterval() { this._ensurePaceSeconds(); return this.get('proactiveSendInterval', 600); },
  setProactiveSendInterval(v) { this.set('proactiveSendInterval', v); },
  
  getSpellCardSend() { return this.get('spellCardSend', false); },
  setSpellCardSend(v) { this.set('spellCardSend', v); },
  
  getEmojiMixing() { return this.get('emojiMixing', false); },
  setEmojiMixing(v) { this.set('emojiMixing', v); },
  
  getKaomojiMixing() { return this.get('kaomojiMixing', false); },
  setKaomojiMixing(v) { this.set('kaomojiMixing', v); },

  getStickerMixing() { return this.get('stickerMixing', false); },
  setStickerMixing(v) { this.set('stickerMixing', v); },
  getRedPacketMixing() { return this.get('redpacketMixing', false); },
  setRedPacketMixing(v) { this.set('redpacketMixing', v); },
  getPatMixEnabled() { return this.get('patMixEnabled', true); },
  setPatMixEnabled(v) { this.set('patMixEnabled', v); },
  
  getSimulateCall() { return this.get('simulateCall', false); },
  setSimulateCall(v) { this.set('simulateCall', v); },
  getBackgroundKeepAlive() { return this.get('backgroundKeepAlive', false); },
  setBackgroundKeepAlive(v) { this.set('backgroundKeepAlive', v); },
  getBackgroundPush() { return this.get('backgroundPush', false); },
  setBackgroundPush(v) { this.set('backgroundPush', v); },
  getDreamTime() { return this.get('dreamTime', null); },
  setDreamTime(v) { this.set('dreamTime', v); },
  
  // --- 通话记录 ---
  getCallRecords() { return this.get('callRecords', []); },
  setCallRecords(v) { this.set('callRecords', v); },
  addCallRecord(record) {
    var records = this.getCallRecords();
    records.unshift(record);
    if (records.length > 100) records = records.slice(0, 100);
    this.setCallRecords(records);
    return records;
  },
  removeCallRecord(id) {
    var records = this.getCallRecords().filter(function(r) { return String(r.id) !== String(id); });
    this.setCallRecords(records);
    return records;
  },
  clearCallRecords() {
    this.setCallRecords([]);
  },
  
  // --- 通话设置 ---
  getCallBg() { return this.get('callBg', 0); },
  setCallBg(v) { this.set('callBg', v); },
  getCallBgImage() { return _callBgImageCache || this.get('callBgImage', ''); },
  setCallBgImage(v) {
    _callBgImageCache = v || '';
    this.set('callBgImage', _callBgImageCache);
    if (!v) { if (window.CallBgDB) CallBgDB.del('image').catch(function(){}); }
  },
  
  // --- 音效设置 ---
  getSoundEnabled() { return this.get('soundEnabled', true); },
  setSoundEnabled(v) { this.set('soundEnabled', v); },
  
  getSoundVolume() { return this.get('soundVolume', 80); },
  setSoundVolume(v) { this.set('soundVolume', v); },
  
  getReceiveSound() { return this.get('receiveSound', 'msg'); },
  setReceiveSound(v) { this.set('receiveSound', v); },
  
  getSendSound() { return this.get('sendSound', 'msg'); },
  setSendSound(v) { this.set('sendSound', v); },
  
  getCustomSounds() { return this.get('customSounds', []); },
  setCustomSounds(v) { this.set('customSounds', v); },

  // --- 保留旧版兼容（已不再在 UI 中使用，保留供 app.js 旧代码兼容） ---
  getNotify() { return this.get('notify', true); },
  setNotify(val) { this.set('notify', val); },
  getAutoReply() { return this.get('autoReply', true); },
  setAutoReply(val) { this.set('autoReply', val); },
  getChatBg() { return this.get('chatBg', 'default'); },
  setChatBg(val) { this.set('chatBg', val); },

  // --- 聊天专属设置（三点菜单） ---
  getPinnedChats() { return this.get('pinnedChats', []); },
  setPinnedChats(arr) { this.set('pinnedChats', arr); },

  isChatPinned(chatId) {
    return this.getPinnedChats().indexOf(chatId) !== -1;
  },

  togglePinChat(chatId) {
    var pinned = this.getPinnedChats();
    var idx = pinned.indexOf(chatId);
    if (idx !== -1) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(chatId);
    }
    this.setPinnedChats(pinned);
    return idx === -1; // true = 已置顶
  },

  getChatMuted(chatId) { return this.get('muted_' + chatId, false); },
  setChatMuted(chatId, val) { this.set('muted_' + chatId, val); },

  getChatBgCustom(chatId) { return this.get('chatBg_' + chatId, 'default'); },
  setChatBgCustom(chatId, val) { this.set('chatBg_' + chatId, val); },

  clearChatMessages(chatId) {
    this.remove('msg_' + chatId);
    delete this._msgCache['msg_' + chatId];
    delete this._msgUpdatedAt['msg_' + chatId];
    // 同步清理 IndexedDB 中的记录
    if (window.MessageDB) MessageDB.del(chatId).catch(function() {});
  },
  
  // === 日常记录 ===
  getDailyRecords() {
    return this.get('dailyRecords', []);
  },
  
  setDailyRecords(records) {
    this.set('dailyRecords', records);
  },
  
  addDailyRecord(date, text) {
    const records = this.getDailyRecords();
    records.push({ id: Date.now(), date, text, createdAt: Date.now() });
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.setDailyRecords(records);
    return records;
  },
  
  updateDailyRecord(id, text) {
    const records = this.getDailyRecords();
    const idx = records.findIndex(r => r.id === id);
    if (idx >= 0) {
      records[idx].text = text;
      records[idx].updatedAt = Date.now();
      this.setDailyRecords(records);
    }
  },
  
  deleteDailyRecord(id) {
    const records = this.getDailyRecords().filter(r => r.id !== id);
    this.setDailyRecords(records);
    return records;
  },
  
  getRecordsByDate(date) {
    return this.getDailyRecords().filter(r => r.date === date);
  },

  // === 相册（图集分组模型：albums 存元数据，照片原图存 IndexedDB） ===
  // === 相册（图集） ===
  // 相册内存缓存：localStorage 超限写入失败时，当前会话仍可正常渲染显示；setAlbums 后立即更新
  _albumsCache: null,

  /* 元数据瘦身：剥离照片 base64 data（原图已补写 IndexedDB AlbumPhotoDB），
     避免 localStorage 超限。仅当 IndexedDB 完全不可用（隐私模式/不支持）时
     才保留 data，作为降级路径（此时无更可靠的权威存储）。 */
  _slimAlbums(albums) {
    var idbAvailable = !!(window.indexedDB && window.AlbumPhotoDB);
    return (albums || []).map(function(a) {
      return {
        id: a.id,
        name: a.name,
        createdAt: a.createdAt || Date.now(),
        photos: (a.photos || []).map(function(p) {
          var slim = { id: p.id, time: p.time || 0 };
          if (!idbAvailable && p.data) slim.data = p.data;
          return slim;
        })
      };
    });
  },

  /* 从 IndexedDB 恢复相册元数据：localStorage 无数据或 IDB 有更新数据时覆盖恢复。
     合并策略：以数据更新的来源为准，同时保留另一方中 IDB 没有的照片（按 id 去重），
     避免 localStorage 与 IDB 各有一部分时互相覆盖丢图。 */
  _restoreAlbumsFromIDB() {
    if (!window.AlbumMetaDB) return;
    var self = this;
    AlbumMetaDB.get('albums').then(function(record) {
      if (!record || !record.value) return;
      var lsData = self.get('albums', null);
      var lsTs = parseInt(self.get('albums_ts', 0) || 0, 10) || 0;
      var idbTs = record.updatedAt || 0;
      var lsValid = lsData !== null && Array.isArray(lsData);
      var useIdb = !lsValid || idbTs > lsTs;
      var merged = self._mergeAlbums(useIdb ? record.value : lsData,
                                     useIdb ? lsData : record.value);
      // 内存缓存是本会话最新状态（可能包含 IDB 检查回调返回前用户刚上传的照片/新建图集），
      // 必须以它为最高优先级合并，防止异步恢复用旧 IDB 记录覆盖导致"提示成功但相册里没有"
      if (Array.isArray(self._albumsCache) && self._albumsCache.length) {
        merged = self._mergeAlbums(merged, self._albumsCache);
      }
      self._albumsCache = merged;
      if (useIdb) {
        // IDB 更新 → 回写 localStorage（瘦身），保证刷新后仍以 IDB 为准
        self.set('albums', self._slimAlbums(merged));
        self.set('albums_ts', idbTs);
      }
      // 若相册页正在渲染，立即刷新界面
      try { if (window.renderAlbum) window.renderAlbum(); } catch (e) {}
      try { if (window.renderAlbumDetail) window.renderAlbumDetail(); } catch (e) {}
    }).catch(function() {});
  },

  /* 合并两份相册数据：按图集 id 去重合并（以主为准，辅方补齐缺失图集/照片） */
  _mergeAlbums(main, extra) {
    var out = [];
    var seenA = {};
    function pushAlbum(a, isMain) {
      if (!a || !a.id || seenA[a.id]) return;
      seenA[a.id] = true;
      var copy = {
        id: a.id,
        name: a.name,
        createdAt: a.createdAt || Date.now(),
        photos: []
      };
      var seenP = {};
      (a.photos || []).forEach(function(p) {
        if (p && p.id && !seenP[p.id]) { seenP[p.id] = true; copy.photos.push(p); }
      });
      if (!isMain) {
        // 补足主数据中缺失的照片
        var extraA = (main || []).find(function(x) { return x.id === a.id; });
        (extraA && extraA.photos || []).forEach(function(p) {
          if (p && p.id && !seenP[p.id]) { seenP[p.id] = true; copy.photos.push(p); }
        });
      }
      out.push(copy);
    }
    (main || []).forEach(function(a) { pushAlbum(a, true); });
    (extra || []).forEach(function(a) { pushAlbum(a, false); });
    return out;
  },

  getAlbums() {
    // 注意：不能写 if (this._albumsCache)，空数组 [] 是 truthy 会短路跳过 IDB 恢复/迁移
    if (this._albumsCache !== null && this._albumsCache !== undefined) return this._albumsCache;
    var albums = this.get('albums', null);
    if (albums !== null && Array.isArray(albums)) {
      this._albumsCache = albums;
      // 后台兜底：IDB 有更新数据时恢复（不阻塞当前渲染）
      this._restoreAlbumsFromIDB();
      return albums;
    }
    // 首次使用（localStorage 无 albums）：
    // 先异步检查 IDB 是否已有相册元数据（此前迁移/写入成功但 localStorage 丢失），
    // 有则直接恢复，避免每次刷新都重新迁移生成新 id，导致已入 IDB 的照片无法被引用而"丢图"
    var self = this;
    var migrateFromPhotos = function() {
      var oldPhotos = self.get('photos', []);
      if (oldPhotos && oldPhotos.length) {
        var migrated = [{
          id: 'album_all',
          name: '全部照片',
          createdAt: Date.now(),
          photos: []
        }];
        oldPhotos.forEach(function(p) {
          if (!p || !p.data) return;
          var id = 'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          migrated[0].photos.push({ id: id, time: p.time || Date.now() });
          if (window.AlbumPhotoDB) {
            AlbumPhotoDB.set({ id: id, data: p.data }).catch(function() {});
          }
        });
        self._albumsCache = migrated;
        // 合并当前内存缓存（异步检查 IDB/迁移期间用户可能已上传新照片/新建图集），
        // 防止迁移结果覆盖本会话刚产生的数据；合并结果须传入 setAlbums 持久化
        var mergedAlbums = migrated;
        if (Array.isArray(self._albumsCache) && self._albumsCache.length) {
          // 过滤掉同步占位缓存的 pending_ 照片（无真实 data，仅用于过渡渲染）
          var realCache = self._albumsCache.map(function(a) {
            var copy = { id: a.id, name: a.name, createdAt: a.createdAt || Date.now(), photos: [] };
            (a.photos || []).forEach(function(p) {
              if (p && p.id && p.id.indexOf('pending_') !== 0) copy.photos.push(p);
            });
            return copy;
          });
          mergedAlbums = self._mergeAlbums(migrated, realCache);
        }
        self._albumsCache = mergedAlbums;
        // 迁移成功后移除旧平铺 photos 键，防止下次刷新重复迁移生成新 id
        if (self.setAlbums(mergedAlbums)) {
          self.set('photos', []);
        }
        // 异步迁移完成后刷新界面（同步占位缓存可能使用 pending_ 占位 id）
        try { if (window.renderAlbum) window.renderAlbum(); } catch (e) {}
        try { if (window.renderAlbumDetail) window.renderAlbumDetail(); } catch (e) {}
        return migrated;
      }
      // 无旧 photos：IDB 也确认无 albums，返回空
      try { if (window.renderAlbum) window.renderAlbum(); } catch (e) {}
      return [];
    };
    if (window.AlbumMetaDB) {
      AlbumMetaDB.get('albums').then(function(record) {
        if (record && record.value && Array.isArray(record.value) && record.value.length) {
          // IDB 已有相册元数据 → 以 IDB 为准恢复（覆盖当前可能重复迁移产生的缓存）
          self._restoreAlbumsFromIDB();
        } else {
          // IDB 无相册 → 执行旧 photos 迁移
          migrateFromPhotos();
        }
      }).catch(function() { migrateFromPhotos(); });
      // 同步返回：先按 localStorage / 旧 photos 占位渲染，异步确认后由恢复/迁移回调刷新
      var oldSync = this.get('photos', []);
      if (oldSync && oldSync.length) {
        // 仅构建占位缓存（不写 IDB、不生成最终 id），异步回调会以 IDB/迁移结果覆盖
        var preview = [{
          id: 'album_all',
          name: '全部照片',
          createdAt: Date.now(),
          photos: oldSync.filter(function(p) { return p && p.data; }).map(function(p) {
            return { id: 'pending_' + Math.random().toString(36).slice(2, 10), time: p.time || Date.now() };
          })
        }];
        this._albumsCache = preview;
        return preview;
      }
      return [];
    }
    return migrateFromPhotos();
  },

  setAlbums(albums) {
    // 无 IndexedDB 环境（隐私模式/不支持 file:// 的浏览器）：仅依赖 localStorage，
    // 保留内嵌 data（否则原图无处可存）；此时 localStorage 失败才代表存储不可用
    if (!window.indexedDB || !window.AlbumPhotoDB) {
      this._albumsCache = albums;
      var fallbackOk = this.set('albums', albums);
      return fallbackOk;
    }
    // 补写带 data 的照片到 IndexedDB（幂等），确保瘦身后原图不丢
    (albums || []).forEach(function(a) {
      (a.photos || []).forEach(function(p) {
        if (p && p.data) {
          AlbumPhotoDB.set({ id: p.id, data: p.data }).catch(function() {});
        }
      });
    });
    // 瘦身：照片元数据剥离 data 大字段（原图已补写 IndexedDB），避免 localStorage 超限
    var slim = this._slimAlbums(albums);
    var ts = Date.now();
    this._albumsCache = slim;
    // localStorage 仅作轻量镜像：写失败不影响功能与提示（IndexedDB 才是权威存储）
    try {
      this.set('albums', slim);
      this.set('albums_ts', ts);
    } catch (e) {
      console.warn('Storage.setAlbums: localStorage mirror write failed', e);
    }
    // IndexedDB 元数据兜底（权威持久化）：localStorage 超限/被清空时分组不丢失
    if (window.AlbumMetaDB) {
      AlbumMetaDB.set({ key: 'albums', value: slim, updatedAt: ts }).catch(function() {
        console.warn('Storage.setAlbums: AlbumMetaDB write failed');
      });
    }
    // 上传/保存成功与否以 IndexedDB 写入为准：IDB 可用即视为已持久化（原图 AlbumPhotoDB + 元数据 AlbumMetaDB），
    // 仅当 IDB 完全不可用且 localStorage 也写入失败时才返回 false（上层提示存储不可用）
    return true;
  },

  /* 启动时清理 localStorage 旧数据残留（修复"IndexedDB 已权威持久化但仍报存储空间不足"）：
     1) mirror_albums 中可能残留旧版内嵌 base64 data（超限元凶）：补写 IDB 后剥离写回瘦身版；
        若剥离后 localStorage 仍写不下（其他键占用），直接删除该键——权威数据在 IDB，刷新后自动恢复；
     2) mirror_photos 旧平铺照片键（迁移后应已清空，若残留大 data 一并清理）；
     3) 其他已知大体积旧键（mirror_chats 等消息镜像）不在本方法范围（消息已有 MessageDB 双向同步）。 */
  _purgeLegacyAlbumData() {
    var self = this;
    var idbAvailable = !!(window.indexedDB && window.AlbumPhotoDB);
    // 1) mirror_albums 瘦身
    var lsAlbums = this.get('albums', null);
    if (lsAlbums && Array.isArray(lsAlbums)) {
      var hasData = false;
      (lsAlbums || []).forEach(function(a) {
        (a.photos || []).forEach(function(p) {
          if (p && p.data) hasData = true;
        });
      });
      if (hasData) {
        // 补写 IDB（幂等），确保原图不丢
        if (idbAvailable) {
          (lsAlbums || []).forEach(function(a) {
            (a.photos || []).forEach(function(p) {
              if (p && p.data) {
                AlbumPhotoDB.set({ id: p.id, data: p.data }).catch(function() {});
              }
            });
          });
        }
        var slim = this._slimAlbums(lsAlbums);
        var ok = false;
        try { ok = this.set('albums', slim); } catch (e) { ok = false; }
        if (!ok && idbAvailable) {
          // localStorage 仍写不下：删除大键，权威数据在 IDB，刷新后由 _restoreAlbumsFromIDB 恢复
          try { localStorage.removeItem(this.PREFIX + 'albums'); } catch (e2) {}
          console.warn('Storage._purgeLegacyAlbumData: removed oversized mirror_albums (IDB authoritative)');
        }
        // 同步更新 IDB 元数据为瘦身版
        if (idbAvailable && window.AlbumMetaDB) {
          AlbumMetaDB.set({ key: 'albums', value: slim, updatedAt: Date.now() }).catch(function() {});
        }
      }
    }
    // 2) mirror_photos 旧平铺键清理（迁移完成后不应再需要；即便还有图，IDB 已补写）
    var lsPhotos = this.get('photos', null);
    if (lsPhotos && Array.isArray(lsPhotos) && lsPhotos.length) {
      if (idbAvailable) {
        var hasPhotoData = lsPhotos.some(function(p) { return p && p.data; });
        if (hasPhotoData) {
          lsPhotos.forEach(function(p) {
            if (p && p.data) {
              AlbumPhotoDB.set({ id: 'legacy_' + (p.id || ('p' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))), data: p.data }).catch(function() {});
            }
          });
        }
      }
      // 已迁移/补写：删除旧键，防止重复迁移与 localStorage 超限
      try { localStorage.removeItem(this.PREFIX + 'photos'); } catch (e3) {}
      try { localStorage.removeItem(this.PREFIX + '__ts_photos'); } catch (e4) {}
    }
  },
  getPhotos() { return this.get('photos', []); },
  setPhotos(photos) { this.set('photos', photos); },

  // === 月经记录 ===
  getPeriodRecords() { return this.get('periodRecords', []); },
  setPeriodRecords(records) { this.set('periodRecords', records); },

  // === 树洞 ===
  getTreeholePosts() { return this.get('treeholePosts', []); },
  setTreeholePosts(posts) { this.set('treeholePosts', posts); },

  // === 记事本 ===
  getNotes() { return this.get('notes', []); },
  setNotes(notes) { this.set('notes', notes); },

  // === 格言 ===
  getQuotes() { return this.get('quotes', [
    '爱不是彼此凝视，而是一起朝同一个方向看。',
    '世间万物，唯有你是我心之所向。',
    '你是我所有温柔的来源和归宿。',
    '星河滚烫，你是人间理想。',
    '白茶清欢无别事，我在等风也等你。',
    '愿有岁月可回首，且以深情共白头。',
    '春风十里不如你。',
    '所爱隔山海，山海皆可平。',
    '你是无意穿堂风，偏偏孤倨引山洪。',
    '浮世三千，吾爱有三：日、月与卿。'
  ]); },
  setQuotes(quotes) { this.set('quotes', quotes); },

  // === 收藏（结构化：含消息类别、发送方、时间、内容数据） ===
  getFavorites() { return this.get('favorites', []); },
  setFavorites(favorites) { this.set('favorites', favorites); },

  // === 每日留言语录 ===
  getDailyQuotes() { return this.get('dailyQuotes', [
    '今天也想见到你，不管什么天气。',
    '和你在一起的每一天，都是情人节。',
    '你的名字，是我见过最短的情诗。',
    '你笑起来的样子，比今天的阳光还暖。',
    '想和你一起，看遍世间所有的日出日落。',
    '有你在，人间值得。',
    '今天的风很甜，因为想起了你。',
    '你是我的今天，以及所有的明天。',
    '和你聊天的时候，时间总是过得特别快。',
    '世界很大，但我的心很小，只装得下一个你。'
  ]); },
  setDailyQuotes(quotes) { this.set('dailyQuotes', quotes); },

  // === 商城 ===
  getShopCart() { return this.get('shopCart', []); },
  setShopCart(cart) { this.set('shopCart', cart); },

  // === 屏蔽字卡 ===
  getBlockedCards() { return this.get('blockedCards', []); },
  setBlockedCards(ids) { this.set('blockedCards', ids); }
};

window.Storage = Storage;
window.StickerDB = StickerDB;

/* 首次加载时迁移 localStorage 旧数据到 IndexedDB */
StickerDB.migrateIfNeeded();

/* 自定义通话背景内存缓存（初始化时从 IndexedDB 加载，保证各弹窗同步读取） */
var _callBgImageCache = '';

/* 自定义通话背景持久化：IndexedDB 存储（内存无上限，跟随设备永久保持） */
var CallBgDB = (function() {
  var DB_NAME = 'mirror_call_bg_db';
  var STORE = 'call_bg';
  var db = null;
  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function() { db = req.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function set(key, value) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  function get(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || ''); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }
  function del(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  return { set: set, get: get, del: del };
})();
window.CallBgDB = CallBgDB;

/* 自定义聊天背景图片持久化：IndexedDB 存储（无容量限制，跟随设备永久保持） */
var ChatBgDB = (function() {
  var DB_NAME = 'mirror_chat_bg_db';
  var STORE = 'chat_bg';
  var db = null;
  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function() { db = req.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function set(key, value) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  function get(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || ''); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }
  function del(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  return { set: set, get: get, del: del };
})();
window.ChatBgDB = ChatBgDB;

/* 自定义音效文件持久化：IndexedDB 存储（接收/发送/来电铃声等上传的 mp3，跟随设备永久保存） */
var SoundFileDB = (function() {
  var DB_NAME = 'mirror_sound_file_db';
  var STORE = 'sound_files';
  var db = null;
  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function() { db = req.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function set(key, value) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  function get(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || ''); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }
  function del(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  return { set: set, get: get, del: del };
})();
window.SoundFileDB = SoundFileDB;

/* 首页相框照片持久化：IndexedDB 存储（无容量限制，跟随设备永久保存原始图片） */
var JournalPhotoDB = (function() {
  var DB_NAME = 'mirror_journal_photo_db';
  var STORE = 'journal_photos';
  var db = null;
  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function() { db = req.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function set(key, value) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  function get(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || ''); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }
  function del(key) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  return { set: set, get: get, del: del };
})();
window.JournalPhotoDB = JournalPhotoDB;

/* 相册照片原图持久化：IndexedDB 存储（无容量限制，照片 dataURL 不在 localStorage 存原图） */
var AlbumPhotoDB = (function() {
  var DB_NAME = 'mirror_album_photo_db';
  var STORE = 'album_photos';
  var db = null;
  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      if (!window.indexedDB) { reject(new Error('no-idb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function() { db = req.result; resolve(db); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function set(item) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(item);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  function get(id) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }
  function del(id) {
    return open().then(function(d) {
      return new Promise(function(resolve, reject) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }
  return { set: set, get: get, del: del };
})();
window.AlbumPhotoDB = AlbumPhotoDB;

/* ===== AlbumMetaDB: IndexedDB 相册元数据兜底（localStorage 超限时照片分组不丢失） ===== */
var AlbumMetaDB = (function() {
  var DB_NAME = 'mirror_album_meta_db';
  var DB_VER = 1;
  var STORE = 'meta';
  var _db = null;
  var _opening = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    if (!window.indexedDB) return Promise.reject(new Error('no indexedDB'));
    _opening = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = function(e) {
        _db = e.target.result;
        _opening = null;
        resolve(_db);
      };
      req.onerror = function() { _opening = null; reject(req.error); };
      req.onblocked = function() { _opening = null; reject(new Error('indexedDB blocked')); };
    });
    return _opening;
  }

  function set(record) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = resolve;
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error); };
      });
    });
  }

  function get(key) {
    return open().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { reject(req.error); };
      });
    });
  }

  return { set: set, get: get };
})();
window.AlbumMetaDB = AlbumMetaDB;

/* 启动时从 IndexedDB 恢复自定义通话背景 */
(function loadCallBgFromDB() {
  CallBgDB.get('image').then(function(img) {
    if (img) {
      _callBgImageCache = img;
      Storage.set('callBgImage', img);
    }
  }).catch(function(){});
})();

/* ============================================================
   页面隐藏/刷新前兜底：将内存中的消息与聊天列表再写入 IndexedDB，
   尽可能保证最后几条记录在刷新/关闭时也能落盘（配合串行写队列，丢失窗口极小）。
   监听三类事件：pagehide（刷新/关闭/跳转）、visibilitychange（切后台/切标签）、
   beforeunload（部分浏览器仅触发该事件），任一触发即执行刷写。
   ============================================================ */
(function installPagehideFlush() {
  function flushToDB() {
    try {
      var keys = Object.keys(Storage._msgCache || {});
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf('msg_') !== 0) continue;
        var chatId = k.slice(4);
        var msgs = Storage._msgCache[k];
        if (chatId && Array.isArray(msgs) && msgs.length && window.MessageDB) {
          MessageDB.set(chatId, msgs).catch(function() {});
        }
      }
      if (Storage._chatsCache && window.MessageDB) {
        MessageDB.setMeta('chats', Storage._chatsCache).catch(function() {});
      }
      if (Storage._groupChatsCache && window.MessageDB) {
        MessageDB.setMeta('groupChats', Storage._groupChatsCache).catch(function() {});
      }
    } catch (e) {}
  }
  window.addEventListener('pagehide', flushToDB);
  window.addEventListener('beforeunload', flushToDB);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') flushToDB();
  });
})();


