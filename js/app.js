/* ============================================================================
   app.js — 主编排：启动序列 / 轮盘与舞台的接线 / 强调色渐变 / 悬停预览
             深链路由 / 快捷键 / 响应式 / 移动端抽屉
   ========================================================================= */

(function (WB) {
  'use strict';

  var U = WB.U;

  var App = {
    cur: 0,
    works: [],
    gl: null,
    wheel: null,
    stage: null,
    accentAnim: null
  };

  /* ==================================================================== 启动 */
  App.boot = function () {
    var self = this;
    this.works = (WB.WORKS || []).slice();

    /* 兜底：数据为空时给出可读提示，而不是停在加载页 */
    if (!this.works.length) {
      var pre0 = document.getElementById('preloader');
      if (pre0) pre0.style.display = 'none';
      var si0 = document.getElementById('stageInner');
      if (si0) {
        si0.style.opacity = '1';
        si0.innerHTML = '<div style="padding:60px 0">' +
          '<div class="mono" style="color:var(--acc);margin-bottom:14px">NO DATA / 无作品数据</div>' +
          '<h1 class="w-title" style="font-size:30px">还没有可展示的作品</h1>' +
          '<p class="w-logline" style="margin-top:18px">请在 <code style="color:var(--acc)">js/data.js</code> 的 ' +
          '<code style="color:var(--acc)">WB.WORKS</code> 数组中添加作品条目，刷新后即可看到轮盘。</p>' +
          '</div>';
      }
      var rail0 = document.querySelector('.rail');
      if (rail0) rail0.style.display = 'none';
      return;
    }

    var site = WB.SITE;
    var total = this.works.length;

    /* 站点文案注入 */
    document.title = site.cjk + ' · ' + site.latin + ' ' + site.years;
    U.$$('[data-site-cjk]').forEach(function (n) { n.textContent = site.cjk; });
    U.$$('[data-site-latin]').forEach(function (n) { n.textContent = site.latin; });
    U.$$('[data-site-years]').forEach(function (n) { n.textContent = site.years; });
    U.$$('[data-site-disc]').forEach(function (n) { n.textContent = site.disc; });

    /* 署名：未填真实姓名时回退到 GitHub 账号，保证站点始终能回答「这是谁的」 */
    var who = (site.owner && site.owner.name) || '';
    if (!who || who.indexOf('待填写') !== -1) {
      who = String((site.owner && site.owner.github) || '')
        .replace(/^https?:\/\/(www\.)?github\.com\//, '@');
    }
    U.$$('[data-site-owner]').forEach(function (n) {
      n.textContent = who ? 'by ' + who : '';
      if (!who) n.style.display = 'none';
    });

    var ft = document.getElementById('footTotal');
    if (ft) ft.textContent = ('0' + total).slice(-2);

    /* 封面：全站先只挂程序化占位，真实封面按需解析（见 U.coverBg）。
       以前这里给 11 部逐一 probe 封面，等于首屏先下 11 张 300KB 的图，
       新机器第一次打开要等好几秒才见到画面 —— 而首屏真正用得到的只有 1 张。 */
    this.works.forEach(function (w) {
      w._cover = U.ph({
        w: 900, h: 1200, n: w.n, title: w.title, acc: w.accent, acc2: w.accent2,
        kind: 'COVER / 3:4', path: w.dir + '/cover.jpg'
      });
    });

    /* 走马灯 */
    var track = U.$('#tickerTrack');
    if (track) {
      var html = this.works.map(function (w, i) {
        return '<button class="ticker__i" type="button" data-i="' + i + '">' +
          '<i>' + U.esc(w.n) + '</i><span>' + U.esc(w.title) + '</span>' +
          '<em>' + U.esc(w.group) + ' · ' + U.esc(w.year) + '</em></button>' +
          '<span class="ticker__dot"></span>';
      }).join('');
      track.innerHTML = html + html;           /* 复制一份实现无缝循环 */
      track.addEventListener('click', function (e) {
        var b = e.target.closest('.ticker__i');
        if (b) self.pick(+b.getAttribute('data-i'));
      });
    }

    /* WebGL 背景 */
    var canvas = document.getElementById('gl');
    this.gl = new WB.GL(canvas);
    if (this.gl.ok) this.gl.setAccent(this.works[0].accent, this.works[0].accent2);

    /* 指针驱动背景 */
    var reduce = U.reduced();
    if (!reduce) {
      window.addEventListener('pointermove', function (e) {
        self.gl && self.gl.setPointer(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      }, { passive: true });
    }

    /* 舞台 */
    this.stage = new WB.Stage({
      works: this.works,
      onShot: function (i) { self.openLightbox(i); },
      onNext: function () { self.step(1); },
      onPrev: function () { self.step(-1); },
      onToast: function (m) { WB.UI.toast(m); },
      onScroll: function (p) { self.gl && self.gl.setScroll(p * 0.6); }
    });
    document.getElementById('stageInner').style.opacity = '0';
    /* 明确不接管滚轮：滚动只用来读作品页，不再兼作切作品的入口。
       切作品只保留点击 / 拖拽 / 键盘 / 底栏分页点。 */

    /* 轮盘 */
    this.wheel = new WB.Wheel(document.querySelector('.rail'), this.works, {
      onChange: function (i, w) { self.commit(i, w); },
      onPreview: function (i, w) { self.preview(i, w); },
      onHover: function (i, w, ev) { self.peek(i, w, ev); },
      onHoverMove: function (ev) { self.peekMove(ev); },
      onHoverEnd: function () { self.peekEnd(); },
      onDragStart: function () { self.peekEnd(); },
      onFab: function () { document.body.classList.add('rail-open'); },
      onMobilePick: function () { document.body.classList.remove('rail-open'); }
    });

    /* UI 组件 */
    WB.UI.Cursor.init();
    WB.UI.Lightbox.init();
    WB.UI.ListView.init(this.works, WB.GROUPS, function (i) {
      WB.UI.ListView.close();
      self.pick(i);
    });
    WB.UI.About.init(WB.SITE, this.works);
    WB.UI.About.onPick = function (i) { self.pick(i); };
    WB.UI.Keys.init(WB.SITE);

    /* 顶栏 / 快捷键 */
    this.bindChrome();
    this.bindKeys();
    this.bindNet();
    this.bindHash();
    this.seo();

    /* 首屏渲染 —— 起始索引优先取深链 #作品id，否则第 1 部 */
    var startIdx = this.indexOfHash(location.hash);
    var startW = this.works[startIdx] || this.works[0];

    U.applyAccent(startW.accent, startW.accent2);
    /* 深链直接进入某部作品时，背景也要跟着这部走 ——
       gl 在初始化时按第 1 部设过色，那之后再没被改，会出现
       「界面是青色、背景还是粉色」的割裂。 */
    if (this.gl) this.gl.setAccent(startW.accent, startW.accent2, true);
    this.stage.render(startW, startIdx, total, false);
    this.cur = startIdx;
    this.wheel.setIndex(startIdx, true);
    this.rewriteHash(startIdx);
    /* 静默定位不会触发 onChange，所以这里补一次页脚/元信息同步 */
    this.syncChrome(startIdx, startW);

    /* 深链直达时给出提示，避免用户以为是从第一页开始的 */
    if (startIdx > 0) {
      WB.UI.toast('已定位到第 ' + startW.n + ' 部 · ' + startW.title, 3600);
    }

    /* 预加载 → 揭幕（?skipintro 可跳过开场，便于分享深链时直接进入） */
    if (/[?&]skipintro/.test(location.search)) {
      var pre = document.getElementById('preloader');
      if (pre) pre.style.display = 'none';
      this.reveal();
    } else {
      /* 揭幕只允许发生一次：预加载回调 + 4s 硬兜底，
         任何意外（异常 / 掉帧 / 后台标签页 rAF 停摆）都不会把用户留在加载页 */
      var revealed = false;
      var doReveal = function () {
        if (revealed) return;
        revealed = true;
        var p = document.getElementById('preloader');
        if (p && p.style.display !== 'none') p.style.display = 'none';
        self.reveal();
      };
      WB.UI.Preloader.run(doReveal);
      setTimeout(doReveal, 4000);
    }
  };

  /* ==================================================================== 揭幕 */
  App.reveal = function () {
    var g = window.gsap;
    var self = this;

    if (!g || U.reduced()) {
      this.stage.animateIn();
      if (this.gl) this.gl.pulse(0.4);
      return;
    }

    /* 注意：宽屏下 .rail 是常驻侧栏，窄屏下它是默认隐藏的抽屉 ——
       动画结束必须 clearProps，否则内联的 opacity:1 会盖掉媒体查询里的 opacity:0，
       手机端抽屉将再也关不上。 */
    g.set('.head, .foot, .edge-label', { opacity: 0 });
    g.set('.rail', { opacity: 0 });
    g.to('.head', { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', startAt: { y: -18 }, clearProps: 'transform' });
    g.to('.foot', { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', startAt: { y: 18 }, clearProps: 'transform' }, 0.05);
    g.to('.rail', {
      opacity: 1, x: 0, duration: 1.05, ease: 'expo.out',
      startAt: { x: 52 }, clearProps: 'opacity,transform'
    }, 0.12);
    g.to('.edge-label', { opacity: 1, duration: 1.1, ease: 'power2.out', clearProps: 'opacity' }, 0.4);

    this.stage.animateIn();
    if (this.gl) this.gl.pulse(0.5);
    setTimeout(function () { if (self.gl) self.gl.pulse(0.35); }, 700);

    /* 空闲时预热相邻作品的主视觉。
       切作品的等待感几乎全来自「主视觉还没到」，而浏览方向大概率是下一部；
       放在 idle 里做，不抢首屏带宽。省流量 / 弱网只预热一部，
       4G 以上才顺手把上一部也备好。 */
    var c = navigator.connection || {};
    if (c.saveData) return;
    var fast = !c.effectiveType || /3g|4g/.test(c.effectiveType);
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1600); };
    idle(function () {
      var n = self.works.length;
      var dirs = fast ? [1, -1] : [1];
      dirs.forEach(function (d) {
        var w = self.works[(self.cur + d + n) % n];
        if (!w) return;
        /* 只预取半尺寸那一档：画位一般不超过 900px，全尺寸是浪费 */
        U.preload(w.media.hero, true);
        U.coverBg(w);
      });
    });
  };

  /* ============================================================== 强调色渐变 */
  /* 换色走 U.tweenAccent：逐帧插值 + 超时无条件落最终值。
     —— 为什么不在 commit 里直接写死：写成瞬间换色也行，但整站颜色是仪表盘的
        一部分，硬切会显得像刷新；渐变又必须保证「一定到得了终点」，
        所以最终值由 setTimeout 兜底写入，不依赖 rAF 是否还在跑。 */
  App.tweenAccent = function (acc, acc2, dur) {
    U.tweenAccent(acc, acc2, dur || 520);
  };

  /* ============================================================== 预览 / 提交 */
  App.preview = function (i, w) {
    /* 预览阶段**只**给轮盘轨道换色（读作「指针正指向谁」）。
       这里以前还给 #stage 挂 --acc，于是旋转过程中全站是已提交作品的粉、
       舞台却是候选作品的绿，两种强调色同时在场，看起来像配色错乱。
       候选的身份改由「候选读数 + 色块」表达，舞台始终跟随已提交作品。 */
    var rail = document.querySelector('.rail');
    if (rail) {
      rail.style.setProperty('--acc', w.accent);
      rail.style.setProperty('--acc-rgb', U.rgbStr(U.hex2rgb(w.accent)));
      rail.style.setProperty('--acc-2', w.accent2);
      rail.style.setProperty('--acc-2-rgb', U.rgbStr(U.hex2rgb(w.accent2)));
    }
    if (i === this.cur) { this.endPreview(); return; }
    /* 指针停在谁身上就预热谁的主视觉，提交时换图瞬间完成 */
    if (this.stage) this.stage.preload(w);
    var stage = document.getElementById('stage');
    if (!stage) return;
    stage.classList.add('is-previewing');
    var cand = document.getElementById('stageCand');
    if (cand) {
      cand.style.setProperty('--acc', w.accent);
      cand.style.setProperty('--acc-rgb', U.rgbStr(U.hex2rgb(w.accent)));
    }
    var n = document.getElementById('candN');
    var t = document.getElementById('candT');
    if (n) n.textContent = w.n;
    if (t) t.textContent = w.title;
  };

  App.endPreview = function () {
    var stage = document.getElementById('stage');
    if (!stage) return;
    stage.classList.remove('is-previewing');
    var cand = document.getElementById('stageCand');
    if (cand) { cand.style.removeProperty('--acc'); cand.style.removeProperty('--acc-rgb'); }
  };

  /* 页脚索引 / 分页点 / 文档元信息 / 关于面板高亮。
     抽出来是因为启动路径用的是 setIndex（静默，不触发 onChange），
     若只在 commit 里做，首次进入时右下角的点、标签页标题、关于面板的
     当前项就全是空的，要等用户第一次切作品才补上。 */
  App.syncChrome = function (i, w) {
    if (!w) return;
    WB.UI.About.setCurrent(i);
    this.seoFor(w);

    var idx = document.getElementById('footIdx');
    if (idx) idx.innerHTML = w.n + '<sup>/' + ('0' + this.works.length).slice(-2) + '</sup>';

    var dots = document.getElementById('footDots');
    if (!dots) return;
    if (!dots.children.length) {
      var self = this;
      this.works.forEach(function (ww, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', '第 ' + ww.n + ' 部 · ' + ww.title);
        b.appendChild(document.createElement('i'));
        b.addEventListener('click', function () { self.pick(k); });
        dots.appendChild(b);
      });
    }
    for (var d = 0; d < dots.children.length; d++) {
      var on = d === i;
      dots.children[d].classList.toggle('is-on', on);
      dots.children[d].setAttribute('aria-current', on ? 'true' : 'false');
    }
  };

  App.commit = function (i, w) {
    this.cur = i;
    this.endPreview();
    this.wheel.markCommitted(i);
    this.rewriteHash(i, this.wheel._commitMode === 'explicit');
    this.syncChrome(i, w);
    WB.UI.announce('第 ' + w.n + ' 部，共 ' + this.works.length + ' 部：' + w.title);

    this.tweenAccent(w.accent, w.accent2, 640);
    if (this.gl) { this.gl.setAccent(w.accent, w.accent2); this.gl.pulse(1); }

    /* 清除轮盘局部覆盖色，让全站色接管 */
    var rail = document.querySelector('.rail');
    if (rail) {
      ['--acc', '--acc-rgb', '--acc-2', '--acc-2-rgb'].forEach(function (p) { rail.style.removeProperty(p); });
    }

    this.stage.transitionTo(w, i, this.works.length);
    this._warmNeighbors(i);
  };

  /* 停稳 0.7s 后预热前后两部的主视觉：连点时会被下一次 commit 取消，
     不会因为手快就把一串图排进下载队列。 */
  App._warmNeighbors = function (i) {
    var self = this;
    clearTimeout(this._warmT);
    this._warmT = setTimeout(function () {
      var n = self.works.length;
      [1, -1].forEach(function (d) {
        var w = self.works[(i + d + n) % n];
        if (w) U.preload(w.media.hero, true);
      });
    }, 700);
  };

  /* 显式跳转（列表 / 走马灯 / 上下部 / 深链） */
  App.pick = function (i, quiet) {
    var w = this.works[i];
    if (!w) return;
    this.wheel.select(i, true);
    if (!quiet) WB.UI.toast(w.n + ' · ' + w.title, 2200);
  };

  /* 当前生效的下标：优先取正在动画途中的候选，避免连按方向键时反复算同一个目标 */
  App.effIndex = function () {
    var t = this.wheel && this.wheel.targetIndex;
    return (t != null && t >= 0 && t < this.works.length) ? t : this.cur;
  };

  App.step = function (dir) {
    var n = this.works.length;
    if (!n) return;
    this.pick((this.effIndex() + dir + n) % n, true);
  };

  /* ================================================================ 悬停预览卡 */
  App.peek = function (i, w, ev) {
    if (document.body.classList.contains('rail-open')) return;
    var el = document.getElementById('peek');
    if (!el) return;
    el.querySelector('.peek__n').textContent = w.n + ' · ' + w.group;
    el.querySelector('.peek__t').textContent = w.title;
    el.querySelector('.peek__d').textContent = w.logline;
    el.querySelector('.peek__tags').innerHTML = w.tags.slice(0, 3).map(function (t) {
      return '<span>' + U.esc(t) + '</span>';
    }).join('');
    var img = el.querySelector('.peek__thumb');
    /* 直接给原图地址：U.img 自己会挑 webp 变体、失败退回 jpg、再失败挂占位，
       比先等「封面探测结果」快一步（探测结果只服务于轮盘中枢的背景）。 */
    U.img(img, w.media.cover, {
      w: 900, h: 1200, sizes: '260px', n: w.n, title: w.title, acc: w.accent, acc2: w.accent2,
      kind: 'COVER', path: w.dir + '/cover.jpg'
    });
    el.style.setProperty('--acc', w.accent);
    el.style.setProperty('--acc-rgb', U.rgbStr(U.hex2rgb(w.accent)));
    this.peekMove(ev);
    el.classList.add('is-on');
  };

  App.peekMove = function (ev) {
    var el = document.getElementById('peek');
    if (!el || !ev) return;
    var dial = document.querySelector('.dial');
    if (!dial) return;
    var r = dial.getBoundingClientRect();
    var y = U.clamp(ev.clientY, 120, window.innerHeight - 120);
    el.style.left = (r.left - 6) + 'px';
    el.style.top = y + 'px';
  };

  App.peekEnd = function () {
    var el = document.getElementById('peek');
    if (el) el.classList.remove('is-on');
  };

  /* ================================================================ 灯箱 */
  App.openLightbox = function (i) {
    var cur = this.stage.current;
    if (!cur) return;
    /* 直接沿用画廊里已经解析好的 src（含占位兜底），避免灯箱出现裂图。
       剧照区还没被水合时，退回同尺寸 webp —— 比原 jpg 小一半以上。 */
    var imgs = U.$$('#wGalleryRow .shot img');
    var data = cur.media.stills.map(function (s, k) {
      var el = imgs[k];
      var mounted = el && (el.currentSrc || el.getAttribute('src'));
      if (mounted && mounted.indexOf('data:') === 0) mounted = null;
      var src = mounted || U.webpOf(s.src, false) || s.src;
      return { src: src, cap: s.cap, n: ('0' + (k + 1)).slice(-2), w: cur };
    });
    WB.UI.Lightbox.open(data, i);
  };

  /* ================================================================ SEO */
  /* 把相对地址补成绝对地址（分享卡片需要），并注入结构化数据 */
  App._setMeta = function (key, val, attr) {
    var sel = 'meta[' + (attr || 'property') + '="' + key + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr || 'property', key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', val);
  };

  App.seo = function () {
    var href = location.href.split('#')[0];
    var origin = location.origin + location.pathname;
    var site = WB.SITE;

    function abs(p) { try { return new URL(p, href).href; } catch (e) { return p; } }
    var setMeta = App._setMeta;

    var og = abs('assets/og.png');
    setMeta('og:image', og);
    setMeta('og:url', origin);
    setMeta('og:image:alt', '作品集封面');
    setMeta('twitter:image', og, 'name');
    setMeta('twitter:title', site.cjk + ' · 每部作品，一条不同的镜头语言', 'name');
    setMeta('twitter:description', 'AI 短剧与 AI 漫剧的分镜设计、视觉设定与生成过程。', 'name');
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.href = origin;

    /* JSON-LD：作品集 + 十部作品条目 */
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: site.cjk + ' · ' + site.latin,
      alternateName: site.latin + ' ' + site.years,
      description: document.querySelector('meta[name="description"]').getAttribute('content'),
      url: origin,
      image: og,
      inLanguage: 'zh-CN',
      about: site.disc,
      author: { '@type': 'Person', name: site.owner.name, url: site.owner.github },
      hasPart: this.works.map(function (w) {
        return {
          '@type': 'CreativeWork',
          name: w.title,
          alternateName: w.latin,
          genre: w.group,
          dateCreated: w.year,
          abstract: w.logline,
          keywords: w.tags.join(', '),
          url: origin + '#' + w.id
        };
      })
    };
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  };

  /* 单部作品的元信息：深链被分享时，标签页与社交卡应该是「这一部」，
     而不是所有链接都长着同一张脸。canonical 仍指向合集根地址（那是正确的）。 */
  App.seoFor = function (w) {
    if (!w) return;
    var site = WB.SITE;
    var base = location.origin + location.pathname;
    var desc = w.logline || '';
    document.title = w.n + ' · ' + w.title + ' — ' + site.cjk + ' ' + site.years;
    App._setMeta('og:title', document.title);
    App._setMeta('og:description', desc);
    App._setMeta('og:url', base + '#' + w.id);
    App._setMeta('twitter:title', document.title, 'name');
    App._setMeta('twitter:description', desc, 'name');
  };

  /* ================================================================ 顶栏 */
  App.bindChrome = function () {
    var self = this;
    var listBtn = document.getElementById('btnList');
    var aboutBtn = document.getElementById('btnAbout');
    var fullBtn = document.getElementById('btnFull');

    if (listBtn) listBtn.addEventListener('click', function () {
      var open = WB.UI.ListView.isOpen();
      WB.UI.ListView.toggle(self.cur);
      listBtn.setAttribute('aria-pressed', String(!open));
      self.peekEnd();
    });

    if (aboutBtn) aboutBtn.addEventListener('click', function () {
      WB.UI.About.toggle();
      aboutBtn.setAttribute('aria-pressed', String(WB.UI.About.isOpen()));
    });

    if (fullBtn) {
      fullBtn.setAttribute('aria-pressed', String(!!document.fullscreenElement));
      fullBtn.addEventListener('click', function () {
        if (!document.fullscreenElement) {
          (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
        } else {
          document.exitFullscreen && document.exitFullscreen();
        }
      });
      /* 全屏状态也可能由 Esc / 浏览器 UI 改变，按钮要跟着走 */
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
        document.addEventListener(ev, function () {
          fullBtn.setAttribute('aria-pressed', String(!!document.fullscreenElement));
        });
      });
    }

    /* 轮盘缺省聚焦，方便键盘操作（仅在焦点落在页面本身时才抢占，避免打断 Tab 导航） */
    var dial = document.querySelector('.dial');
    if (dial) {
      dial.addEventListener('pointerdown', function () { dial.focus({ preventScroll: true }); });
      window.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].indexOf(e.key) < 0) return;
        if (WB.UI.ListView.isOpen() || WB.UI.About.isOpen() || WB.UI.Lightbox.isOpen()) return;
        var a = document.activeElement;
        if (a && a !== document.body && a !== document.documentElement) return;
        dial.focus({ preventScroll: true });
      });
    }

    /* 覆盖层状态同步 */
    var obs = function () {
      if (listBtn) listBtn.setAttribute('aria-pressed', String(WB.UI.ListView.isOpen()));
      if (aboutBtn) aboutBtn.setAttribute('aria-pressed', String(WB.UI.About.isOpen()));
    };
    document.addEventListener('click', function () { setTimeout(obs, 0); });

    /* 尺寸变化 */
    var onResize = U.debounce(function () {
      self.gl && self.gl.resize();
      var dialEl = document.querySelector('.dial');
      if (dialEl) { self.wheel._painted = -1; self.wheel._render(); }
      if (window.innerWidth > 860) document.body.classList.remove('rail-open');
    }, 160);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  };

  /* ================================================================ 快捷键 */
  App.bindKeys = function () {
    var self = this;
    var total = this.works.length;
    window.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;

      if (k === 'Escape') {
        if (WB.UI.Lightbox.isOpen()) return WB.UI.Lightbox.close();
        if (WB.UI.Keys.isOpen()) return WB.UI.Keys.close();
        if (WB.UI.ListView.isOpen()) return WB.UI.ListView.close();
        if (WB.UI.About.isOpen()) return WB.UI.About.close();
        if (document.body.classList.contains('rail-open')) return document.body.classList.remove('rail-open');
        return;
      }
      /* 覆盖层打开时，除 Esc 与本层的按键外一律让行 */
      if (WB.UI.ListView.isOpen() || WB.UI.About.isOpen() || WB.UI.Keys.isOpen()) return;
      if (WB.UI.Lightbox.isOpen()) return;

      /* 全局作品切换：轮盘未聚焦时也能用（基于候选下标，连按不会重复） */
      if (k === 'ArrowDown' || k === 'ArrowRight') {
        e.preventDefault(); return self.step(1);
      }
      if (k === 'ArrowUp' || k === 'ArrowLeft') {
        e.preventDefault(); return self.step(-1);
      }
      if (k === 'Home') { e.preventDefault(); return self.pick(0); }
      if (k === 'End') { e.preventDefault(); return self.pick(total - 1); }
      if (k === 'PageDown') { e.preventDefault(); return self.stage.scrollPage(1); }
      if (k === 'PageUp') { e.preventDefault(); return self.stage.scrollPage(-1); }
      if (/^[0-9]$/.test(k)) {
        var di = k === '0' ? 9 : parseInt(k, 10) - 1;
        if (di < total) { e.preventDefault(); return self.pick(di); }
        return;
      }

      if (k === 'l' || k === 'L') { e.preventDefault(); WB.UI.ListView.toggle(self.cur); }
      else if (k === 'a' || k === 'A') { e.preventDefault(); WB.UI.About.toggle(); }
      else if (k === 'f' || k === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        else document.exitFullscreen && document.exitFullscreen();
      } else if (k === '?' || k === '/') {
        e.preventDefault();
        WB.UI.Keys.toggle();
      }
    });
  };

  /* ============================================================ 网络状态提示 */
  App.bindNet = function () {
    window.addEventListener('offline', function () {
      WB.UI.toast('网络已断开 — 页面仍可浏览，未加载的素材会继续使用占位视觉', 6000);
    });
    window.addEventListener('online', function () {
      WB.UI.toast('网络已恢复', 3200);
    });
  };

  /* ================================================================ 深链路由 */
  /* push=true 用于「明确导航」（点轮盘分段 / 键盘 / 列表 / 走马灯 / 上下一部）：
     这类跳转要进历史，浏览器后退才能回到上一部作品。
     轮盘自由旋转停稳后的自动提交走 replace，否则转一圈会塞进十几条历史。 */
  App.rewriteHash = function (i, push) {
    var w = this.works[i];
    if (!w) return;
    try {
      var url = '#' + w.id;
      if (push && location.hash.replace(/^#/, '') !== w.id) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    } catch (e) {
      /* file:// 下可能受限，忽略 */
    }
  };

  /* 把 #hash 映射为作品下标；无法匹配时返回 0 */
  App.indexOfHash = function (hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!h) return 0;
    try { h = decodeURIComponent(h); } catch (e) { /* 保留原值 */ }
    for (var k = 0; k < this.works.length; k++) {
      if (this.works[k].id === h) return k;
    }
    return 0;
  };

  App.bindHash = function () {
    var self = this;
    /* pushState 不会触发 hashchange，所以前后退统一听 popstate */
    window.addEventListener('popstate', function () {
      var i = self.indexOfHash(location.hash);
      if (i === self.cur && self.wheel._committed === i) return;
      self.wheel.select(i, true);
    });
    /* 手改地址栏 / 外部链接跳进站内锚点时仍走 hashchange */
    window.addEventListener('hashchange', function () {
      var i = self.indexOfHash(location.hash);
      if (i === self.cur && self.wheel._committed === i) return;
      self.wheel.select(i, true);
    });
  };

  /* ==================================================================== 启动 */
  function start() {
    try {
      App.boot();
    } catch (err) {
      console.error('[app] 启动失败', err);
      var pre = document.getElementById('preloader');
      if (pre) pre.style.display = 'none';
      var si = document.getElementById('stageInner');
      if (si) si.style.opacity = '1';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  WB.App = App;

})(window.WB = window.WB || {});
