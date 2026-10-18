/* ============================================================================
   ui.js — 自定义光标 / 灯箱 / 列表视图 / 关于面板 / 提示条 / 预加载
   ========================================================================= */

(function (WB) {
  'use strict';

  var U = WB.U;
  var ICO = WB.ICO;

  /* ==================================================================== 光标 */
  var Cursor = {
    init: function () {
      if (U.coarse() || !window.matchMedia('(hover: hover)').matches) return;
      var dot = U.$('.cursor-dot'), ring = U.$('.cursor');
      if (!dot || !ring) return;
      document.body.classList.add('has-cursor');

      var mx = window.innerWidth / 2, my = window.innerHeight / 2;
      var rx = mx, ry = my;
      var visible = false;

      document.addEventListener('pointermove', function (e) {
        mx = e.clientX; my = e.clientY;
        if (!visible) { visible = true; dot.style.opacity = ring.style.opacity = '1'; rx = mx; ry = my; }
        dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      }, { passive: true });

      document.addEventListener('pointerdown', function () { ring.classList.add('is-down'); });
      document.addEventListener('pointerup', function () { ring.classList.remove('is-down'); });
      document.addEventListener('pointerleave', function () {
        visible = false; dot.style.opacity = ring.style.opacity = '0';
      });

      U.raf(function (dt) {
        var k = U.damp(dt, 0.19);
        rx += (mx - rx) * k;
        ry += (my - ry) * k;
        ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
      });

      /* 悬停态判定 */
      var HOT = 'a,button,.seg__hit,.shot,.lv-card,.ticker__i,[data-cursor]';
      document.addEventListener('pointerover', function (e) {
        var hot = e.target.closest && e.target.closest(HOT);
        var label = '';
        if (hot) {
          label = hot.getAttribute('data-cursor-label') || '';
          if (!label) {
            if (hot.classList.contains('seg__hit')) label = '选择';
            else if (hot.classList.contains('shot')) label = '放大';
            else if (hot.classList.contains('lv-card')) label = '查看';
            else if (hot.classList.contains('ticker__i')) label = '跳转';
            else if (hot.tagName === 'A') label = '打开';
          }
        }
        ring.classList.toggle('is-hover', !!hot && !label);
        ring.classList.toggle('is-label', !!label);
        var lab = ring.querySelector('.cursor__label');
        if (lab) lab.textContent = label;
      }, { passive: true });
    }
  };

  /* --------------------------------------------------------- 焦点记忆（Esc 后归还） */
  var _lastFocus = null;
  function rememberFocus() {
    _lastFocus = document.activeElement && document.activeElement !== document.body
      ? document.activeElement : null;
  }
  function restoreFocus() {
    if (!_lastFocus) return;
    try { _lastFocus.focus({ preventScroll: true }); } catch (e) {}
    _lastFocus = null;
  }

  /* =================================================================== 灯箱 */
  var Lightbox = {
    init: function () {
      var self = this;
      this.el = U.$('#lightbox');
      this.img = U.$('#lbImg');
      this.cap = U.$('#lbCap');
      this.counter = U.$('#lbCounter');
      this.thumbs = U.$('#lbThumbs');
      this.stage = U.$('.lb__stage');
      this.items = [];
      this.i = 0;

      U.$('#lbClose').addEventListener('click', function () { self.close(); });
      U.$('#lbPrev').addEventListener('click', function () { self.go(-1); });
      U.$('#lbNext').addEventListener('click', function () { self.go(1); });
      this.img.addEventListener('click', function () {
        self.img.classList.toggle('is-zoom');
        self.el.classList.toggle('is-zoomed');
      });

      /* 关闭区：画面以外的任何地方都算背景。
         以前只认「正好点在 #lightbox 上」，而灯箱的图片区几乎铺满屏幕，
         点在图片旁边的深色留白里 e.target 是 .lb__stage，就被当成没点中 ——
         这就是「点剧照其他位置退不出去」的原因。 */
      this.el.addEventListener('click', function (e) {
        if (e.target.closest('.lb__img, .lb__thumbs, .lb__bar, .ov__close')) return;
        self.close();
      });

      this.thumbs.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]');
        if (b) self.show(+b.getAttribute('data-i'));
      });

      /* 触屏横向滑动切换 */
      var sx = 0, sy = 0, active = false;
      this.stage.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') return;
        sx = e.clientX; sy = e.clientY; active = true;
      });
      this.stage.addEventListener('pointerup', function (e) {
        if (!active) return;
        active = false;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) self.go(dx < 0 ? 1 : -1);
      });

      /* Esc 关闭：capture 阶段先接一手，避免被别的键盘处理或浏览器吃掉第一下。
         另外把监听挂在 window 上（document 只在页面有焦点时收得到）。 */
      window.addEventListener('keydown', function (e) {
        if (!self.el.classList.contains('is-open')) return;
        if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); self.close(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); self.go(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); self.go(-1); }
      }, true);
    },

    open: function (items, i) {
      this.items = items || [];
      if (!this.items.length) return;
      rememberFocus();
      this.thumbs.innerHTML = this.items.map(function (it, k) {
        return '<button type="button" data-i="' + k + '"><img alt="" src="' + it.src + '"></button>';
      }).join('');
      this.img.classList.remove('is-zoom');
      this.show(i || 0);
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ov-open');
      /* 焦点搬进灯箱：键盘从头就能用（Esc / ← →），
         也让「刚打开时按键没反应」这类问题不再出现 */
      var closeBtn = U.$('#lbClose');
      if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (e) {} }
    },

    show: function (i) {
      if (!this.items.length) return;
      this.i = U.mod(i, this.items.length);
      var it = this.items[this.i];
      this.img.classList.remove('is-zoom');
      this.img.src = it.src;
      this.img.alt = it.cap || '';
      this.cap.innerHTML = '<b>' + U.esc(it.cap || '') + '</b>' +
        '<span>' + U.esc((it.w ? it.w.title : '') + ' · 剧照 ' + it.n) + '</span>';
      this.counter.textContent = ('0' + (this.i + 1)).slice(-2) + ' / ' + ('0' + this.items.length).slice(-2);
      var btns = U.$$('button', this.thumbs);
      for (var k = 0; k < btns.length; k++) btns[k].classList.toggle('is-on', k === this.i);
    },

    go: function (d) { this.show(this.i + d); },

    close: function () {
      this.el.classList.remove('is-open', 'is-zoomed');
      this.el.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ov-open');
      if (this.img) this.img.classList.remove('is-zoom');
      restoreFocus();
    },

    isOpen: function () { return this.el.classList.contains('is-open'); }
  };

  /* =============================================================== 列表视图 */
  var ListView = {
    init: function (works, groups, onPick) {
      var self = this;
      this.works = works;
      this.onPick = onPick;
      this.el = U.$('#listview');
      this.grid = U.$('#lvGrid');
      this.filters = U.$('#lvFilters');
      this.count = U.$('#lvCount');

      this.filters.innerHTML = groups.map(function (g, i) {
        return '<button type="button" data-g="' + U.esc(g) + '"' + (i === 0 ? ' class="is-on"' : '') + '>' + U.esc(g) + '</button>';
      }).join('');

      this.grid.innerHTML = works.map(function (w, i) {
        return '<button class="lv-card" type="button" data-i="' + i + '" data-g="' + U.esc(w.group) + '">' +
          '<span class="lv-card__media">' +
            '<img alt="' + U.esc(w.title) + ' 封面" src="' + (w._cover || w.media.cover) + '">' +
            '<span class="lv-card__i">' + U.esc(w.n) + '</span>' +
            '<span class="lv-card__type">' + U.esc(w.typeLabel) + '</span>' +
            '<span class="lv-card__scope" data-scope="' + U.esc(w.scope || 'join') + '"' +
              (w.scope === 'lead' ? ' style="color:' + U.inkOn(w.accent) + '"' : '') + '>' +
              U.esc(((WB.SCOPE || {})[w.scope] || (WB.SCOPE || {}).join || {}).short || '') + '</span>' +
          '</span>' +
          '<span class="lv-card__b">' +
            '<span class="lv-card__t">' + U.esc(w.title) + '</span>' +
            '<span class="lv-card__d">' + U.esc(w.logline) + '</span>' +
            '<span class="lv-card__f">' +
              '<span class="lv-card__tags">' + w.tags.slice(0, 3).map(function (t) { return '<span>' + U.esc(t) + '</span>'; }).join('') + '</span>' +
              '<span class="lv-card__go">' + ICO.arr + '</span>' +
            '</span>' +
          '</span>' +
        '</button>';
      }).join('');

      /* 封面兜底：只在面板第一次打开时挂图。
         列表是覆盖层，首屏根本看不见它 —— 开机就把 11 张封面的 <img> 填上，
         会让第一次进站的人陪着下几 MB 的图。 */
      this.hydrated = false;

      this.grid.addEventListener('click', function (e) {
        var c = e.target.closest('.lv-card');
        if (!c) return;
        self.onPick(+c.getAttribute('data-i'));
      });

      this.filters.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-g]');
        if (!b) return;
        var g = b.getAttribute('data-g');
        U.$$('button', self.filters).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        var shown = 0;
        U.$$('.lv-card', self.grid).forEach(function (c) {
          var ok = g === '全部' || c.getAttribute('data-g') === g;
          c.classList.toggle('is-hidden', !ok);
          if (ok) shown++;
        });
        self.count.textContent = shown + ' / ' + works.length + ' 部作品';
      });

      this.count.textContent = works.length + ' / ' + works.length + ' 部作品';

      U.$('#lvClose').addEventListener('click', function () { self.close(); });
    },

    open: function (focusIdx) {
      rememberFocus();
      this.hydrate();
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ov-open');
      var panel = U.$('.ov__panel', this.el);
      if (panel) panel.scrollTop = 0;
      /* 标记当前作品（而不是用焦点环，避免误导成「选中」） */
      var cards = U.$$('.lv-card', this.grid);
      for (var k = 0; k < cards.length; k++) cards[k].classList.toggle('is-current', k === focusIdx);
    },

    /* 首次打开时才真正请求封面 */
    hydrate: function () {
      if (this.hydrated) return;
      this.hydrated = true;
      var works = this.works;
      U.$$('.lv-card', this.grid).forEach(function (card) {
        var w = works[+card.getAttribute('data-i')];
        var img = card.querySelector('img');
        if (!w || !img) return;
        U.img(img, w.media.cover, {
          w: 900, h: 1200, sizes: '(max-width: 640px) 46vw, 320px',
          n: w.n, title: w.title, acc: w.accent, acc2: w.accent2,
          kind: 'COVER / 3:4', path: w.dir + '/cover.jpg'
        });
      });
    },

    close: function () {
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ov-open');
      restoreFocus();
    },

    toggle: function (i) { this.isOpen() ? this.close() : this.open(i); },
    isOpen: function () { return this.el.classList.contains('is-open'); }
  };

  /* =================================================================== 关于 */

  /* 快捷键列表渲染（关于面板与快捷键面板共用同一份数据） */
  function keyRows(list) {
    /* 纯符号 / 拉丁短词渲染成键帽；中文词（拖拽、滚轮…）渲染成普通标签 */
    var isCap = function (k) { return /^[^\u4e00-\u9fa5]{1,6}$/.test(k); };
    return (list || []).map(function (it) {
      var keys = (it.k || []).map(function (k) {
        return isCap(k)
          ? '<kbd>' + U.esc(k) + '</kbd>'
          : '<span class="cmdk__w">' + U.esc(k) + '</span>';
      }).join('');
      return '<div class="cmdk__r"><span class="cmdk__k">' + keys + '</span>' +
        '<span class="cmdk__h">' + U.esc(it.h) + '</span></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ 焦点约束 */
  /* 覆盖层打开时把 Tab 限制在层内，避免焦点跑到背后的页面上 */
  var FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  function trapTab(e) {
    var open = U.$('.ov.is-open');
    if (!open) return;
    var items = U.$$(FOCUSABLE, open).filter(function (n) {
      return n.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || !open.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !open.contains(active))) {
      e.preventDefault(); first.focus();
    }
  }
  var About = {
    init: function (site, works) {
      var self = this;
      this.el = U.$('#about');
      var o = site.owner;

      U.$('#aboutLead').textContent =
        '尹航 · ' + (o.role || '执行导演') + '，曾就职于' + (o.company || '与光同尘（杭州）文化科技') + '。' +
        '主导 3 部 AI 漫剧短剧的主要制作，参与 3 部作品的剧本与导演层面的修改优化，作品均上线' +
        (o.platform || '红果免费漫剧平台') + '。这个站点收录了 ' + works.length + ' 部作品的分镜、视觉设定与成片。';

      var availEl = U.$('#availText');
      if (availEl) availEl.textContent = site.openTo || '接受合作邀约';

      U.$('#aboutCaps').innerHTML = site.capabilities.map(function (c) {
        return '<li><b>' + U.esc(c.k) + '</b><div><h4>' + U.esc(c.h) + '</h4><p>' + U.esc(c.p) + '</p></div></li>';
      }).join('');

      /* 工作经历（简历时间线；没有时退回旧的 workflow） */
      var flowEl = U.$('#aboutFlow');
      var flow = site.experience || site.workflow;
      if (flowEl && flow) {
        flowEl.innerHTML = flow.map(function (s) {
          return '<li><span class="flow-list__k mono">' + U.esc(s.k) + '</span>' +
            '<div><h4>' + U.esc(s.h) + '</h4><p>' + U.esc(s.p) + '</p></div></li>';
        }).join('');
      }

      /* 工具链 */
      var stackEl = U.$('#aboutStack');
      if (stackEl && site.stack) {
        stackEl.innerHTML = site.stack.map(function (s) {
          return '<div><span>' + U.esc(s.k) + '</span><span>' + U.esc(s.v) + '</span></div>';
        }).join('');
      }

      /* 操作指南（取快捷键表的前几条，完整版在快捷键面板里） */
      var akEl = U.$('#aboutKeys');
      if (akEl) {
        akEl.innerHTML = [
          { k: '轮盘', v: '点击 / 拖拽 / ↑↓' },
          { k: '直达', v: '数字键 1 – 0' },
          { k: '列表视图', v: 'L' },
          { k: '全屏', v: 'F' }
        ].map(function (r) {
          return '<div><span>' + U.esc(r.k) + '</span><span>' + U.esc(r.v) + '</span></div>';
        }).join('');
      }

      /* 联系方式：不放公司（已离职）与 GitHub —— 只留能直接联系到人的信息 */
      U.$('#aboutContact').innerHTML =
        row('姓名 / NAME', o.name) +
        row('身份 / ROLE', o.role) +
        row('状态 / STATUS', o.status || '已离职 · 开放新机会') +
        row('城市 / CITY', o.city) +
        row('电话 / TEL', o.phone) +
        row('邮箱 / EMAIL', o.email) +
        row('学校 / SCHOOL', o.school);

      function row(k, v) {
        return '<div><span>' + U.esc(k) + '</span><span>' + U.esc(v) + '</span></div>';
      }

      U.$('#aboutWorks').innerHTML = works.map(function (w, i) {        return '<button class="about__w" type="button" data-i="' + i + '"' +
          ' aria-label="跳转到作品 ' + U.esc(w.n) + '：' + U.esc(w.title) + '">' +
          '<span class="about__w-i mono">' + U.esc(w.n) + '</span>' +
          '<span class="about__w-t">' + U.esc(w.title) + '</span>' +
          '<span class="about__w-g mono"><span>' + U.esc(w.group) + '</span>' +
            '<b class="about__w-s" data-scope="' + U.esc(w.scope || 'join') + '">' +
              U.esc(((WB.SCOPE || {})[w.scope] || (WB.SCOPE || {}).join || {}).zh || '') + '</b></span>' +
          '<span class="about__w-go">' + ICO.arr + '</span></button>';
      }).join('');

      /* 点击清单项 → 关闭面板并跳到该作品 */
      var listEl = U.$('#aboutWorks');
      listEl.addEventListener('click', function (e) {
        var b = e.target.closest('.about__w');
        if (!b) return;
        var i = +b.getAttribute('data-i');
        self.close();
        self.onPick && self.onPick(i);
      });
      /* 高亮当前正在浏览的作品 */
      this._listEl = listEl;
      this._works = works;

      /* ---- 统计块：由数据实时推导，替换 data.js 后自动更新 ----
         刻意不统计「已完成 / 推进中」这类进度状态：作品集里那属于内部信息，
         对外只需要呈现「有多少、什么门类、什么形态、什么年份跨度」。 */
      var statsEl = U.$('#aboutStats');
      if (statsEl) {
        var groups = {}, lead = 0, join = 0;
        works.forEach(function (w) {
          if (w.group) groups[w.group] = 1;
          /* 按 scope 统计，不再靠 role 文案里有没有「主导」两个字 */
          if (w.scope === 'lead') lead++;
          else join++;
        });
        var ys = works.map(function (w) { return parseInt(w.year, 10); }).filter(function (n) { return !isNaN(n); });
        var yMin = ys.length ? Math.min.apply(null, ys) : null;
        var yMax = ys.length ? Math.max.apply(null, ys) : null;
        var span = (yMin && yMax) ? (yMin === yMax ? String(yMin) : yMin + '–' + yMax) : (site.years || '—');
        var cells = [
          { k: '收录作品', v: works.length, s: 'WORKS' },
          { k: '主导制作', v: lead, s: 'LEAD' },
          { k: '参与作品', v: join, s: 'JOINED' },
          { k: '题材门类', v: Object.keys(groups).length, s: 'GENRES' },
          { k: '年份跨度', v: span, s: 'SPAN', wide: true }
        ];
        statsEl.innerHTML = cells.map(function (c) {
          return '<div class="about__stat' + (c.wide ? ' is-wide' : '') + '">' +
            '<span class="about__stat-v" data-v="' + U.esc(c.v) + '">' + U.esc(c.v) + '</span>' +
            '<span class="about__stat-k">' + U.esc(c.k) + '</span>' +
            '<span class="about__stat-s mono">' + U.esc(c.s) + '</span></div>';
        }).join('');
        this._statsEl = statsEl;
      }

      /* ---- 版权行 ---- */
      var copyEl = U.$('#aboutCopy');
      if (copyEl) {
        var short = (o.name && o.name.indexOf('待填写') === -1) ? o.name : site.cjk;
        copyEl.textContent = '© ' + new Date().getFullYear() + ' ' + short;
      }

      U.$('#aboutClose').addEventListener('click', function () { self.close(); });
    },
    /* 高亮当前正在浏览的作品 */
    setCurrent: function (i) {
      if (!this._listEl) return;
      U.$$('.about__w', this._listEl).forEach(function (b, k) {
        b.classList.toggle('is-current', k === i);
      });
    },

    open: function () {
      rememberFocus();
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ov-open');
      /* 统计数字滚动，仅首次打开时播一次 */
      if (this._statsEl && !this._statsPlayed) {
        this._statsPlayed = true;
        U.$$('.about__stat-v', this._statsEl).forEach(function (n) {
          var raw = n.getAttribute('data-v');
          if (/^\d+$/.test(raw)) U.countUp(n, parseInt(raw, 10), 780);
        });
      }
    },
    close: function () { this.el.classList.remove('is-open'); this.el.setAttribute('aria-hidden', 'true'); document.body.classList.remove('ov-open'); restoreFocus(); },
    toggle: function () { this.isOpen() ? this.close() : this.open(); },
    isOpen: function () { return this.el.classList.contains('is-open'); }
  };

  /* =============================================================== 快捷键面板 */
  var Keys = {
    init: function (site) {
      var self = this;
      this.el = U.$('#keys');
      this.lastTrigger = null;

      var kbd = U.$('#keysKbd'), ptr = U.$('#keysPtr');
      if (kbd) kbd.innerHTML = keyRows(site.keys && site.keys.keyboard);
      if (ptr) ptr.innerHTML = keyRows(site.keys && site.keys.pointer);

      var close = U.$('#keysClose');
      if (close) close.addEventListener('click', function () { self.close(); });

      var open = U.$('#aboutKeysBtn');
      if (open) open.addEventListener('click', function () {
        self.lastTrigger = open;
        WB.UI.About.close();
        self.open();
      });

      /* 覆盖层内的 Tab 焦点约束，全局挂一次 */
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') trapTab(e);
      });
    },
    open: function () {
      if (!this.el) return;
      rememberFocus();
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ov-open');
      var panel = U.$('.ov__panel', this.el);
      if (panel) panel.scrollTop = 0;
    },
    close: function () {
      if (!this.el) return;
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('ov-open');
      if (WB.UI.About.isOpen()) return;       /* 从关于面板跳来时不恢复焦点 */
      restoreFocus();
    },
    toggle: function () { this.isOpen() ? this.close() : this.open(); },
    isOpen: function () { return !!(this.el && this.el.classList.contains('is-open')); }
  };

  /* =================================================================== 提示 */
  var toastTimer = 0;
  function toast(msg, ms) {
    var el = U.$('#toast');
    if (!el) return;
    el.innerHTML = '<span class="toast__k mono">提示</span><span>' + U.esc(msg) + '</span>';
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, ms || 4200);
  }

  /* ================================================================ 预加载器 */
  var Preloader = {
    run: function (onDone) {
      var el = U.$('#preloader');
      var pct = U.$('#prePct');
      var bar = U.$('#preBar span');
      var log = U.$('#preLog');
      var done = false;

      var LINES = [
        '初始化影像档案 / INDEX',
        '载入 ' + (WB.WORKS ? WB.WORKS.length : 10) + ' 部作品元数据',
        '构建光谱与强调色',
        '启动流场渲染器',
        '校准轮盘刻度'
      ];

      var t0 = performance.now();
      var dur = U.reduced() ? 220 : 900;

      function finish() {
        if (done) return;
        done = true;
        if (early) clearInterval(early);
        el.classList.add('is-done');
        setTimeout(function () { el.style.display = 'none'; }, 700);
        onDone && onDone();
      }

      /* 主视觉一到位就提前收场：加载页是仪式感，不该让人等它走完进度条。
         最少留 420ms，否则动画还没看清就被切走，反而像闪了一下。 */
      var early = setInterval(function () {
        var img = document.querySelector('#wHeroFrame img.w-hero__media');
        if (img && img.complete && img.naturalWidth && performance.now() - t0 > 420) finish();
      }, 120);

      el.addEventListener('click', finish);
      document.addEventListener('keydown', function once(e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { finish(); document.removeEventListener('keydown', once); }
      });

      var lastL = -1;
      (function tick(now) {
        var p = U.clamp((now - t0) / dur, 0, 1);
        var v = U.easeOutExpo(p) * 100;
        pct.textContent = Math.round(v) + '%';
        bar.style.width = v + '%';
        var L = Math.min(LINES.length - 1, Math.floor(p * LINES.length));
        if (L !== lastL) {
          /* 首帧或掉帧时 L 可能一次跨过多个进度点，必须逐条补齐 ——
             否则 log.children 的长度会少于 lastL，末尾访问越界抛异常，
             预加载永远结束不了，整站会停在加载页。 */
          for (var k = lastL + 1; k <= L; k++) {
            var i = document.createElement('i');
            i.textContent = '› ' + LINES[k];
            log.appendChild(i);
          }
          lastL = L;
        }
        if (p < 1) requestAnimationFrame(tick);
        else {
          /* 除最后一条外全部标记完成 */
          var items = log.children;
          for (var m = 0; m < items.length - 1; m++) items[m].classList.add('is-ok');
          setTimeout(finish, U.reduced() ? 0 : 260);
        }
      })(t0);
    }
  };

  /* ============================================================ 屏幕阅读器播报 */
  var liveTimer = 0;
  function announce(msg) {
    var el = U.$('#live');
    if (!el) return;
    /* 先清空再写入，确保重复内容也会被朗读 */
    clearTimeout(liveTimer);
    el.textContent = '';
    liveTimer = setTimeout(function () { el.textContent = msg; }, 60);
  }

  WB.UI = {
    Cursor: Cursor,
    Lightbox: Lightbox,
    ListView: ListView,
    About: About,
    Keys: Keys,
    toast: toast,
    announce: announce,
    Preloader: Preloader
  };

})(window.WB = window.WB || {});
