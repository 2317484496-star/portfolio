/* ============================================================================
   stage.js — 作品详情舞台：内容渲染 / 转场编排 / 纵向滚动进度
   ========================================================================= */

(function (WB) {
  'use strict';

  var U = WB.U;

  /* ---------------------------------------------------------------- 图标 */
  /* 统一带 width/height，避免注入到无尺寸约束的容器时被撑满 */
  var SVG_OPEN = 'width="12" height="12" aria-hidden="true"';
  var ICO = {
    play: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    expand: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"/></svg>',
    arr: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    back: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 12H5M11 18l-6-6 6-6"/></svg>',
    out: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 4h6v6M20 4l-8 8M18 14v6H4V6h6"/></svg>',
    up: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
    cube: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4z"/><path d="M3 7.4l9 4.8 9-4.8M12 12.2v9.2"/></svg>',
    img: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="8.6" cy="9.4" r="1.6"/><path d="M3 17l5-4.4 4 3.2 3.4-2.6L21 17"/></svg>',
    film: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    spark: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/></svg>'
  };

  function typeIco(t) {
    if (t === 'video') return ICO.film;
    if (t === 'gallery') return ICO.img;
    if (t === 'game') return ICO.cube;
    return ICO.spark;
  }

  /* ======================================================================= */

  function Stage(opts) {
    this.o = opts || {};
    this.root = document.getElementById('stage');
    this.scroller = document.getElementById('stageScroll');
    this.inner = document.getElementById('stageInner');
    this.railFill = document.querySelector('.stage__rail span');
    this.wipe = document.getElementById('wipe');
    this.current = null;
    this.busy = false;
    this._reveals = [];
    this._bind();
    this.initSmooth();

    /* 触屏 / 减少动态效果切换时重新评估是否保留惯性滚动 */
    var self = this;
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onMq = function () { self.syncSmooth(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
      window.addEventListener('resize', function () { self.syncSmooth(); });
    }
  }

  /* ------------------------------------------------------------ 骨架引用 */
  Stage.prototype.$ = function (id) { return document.getElementById(id); };

  Stage.prototype._bind = function () {
    var self = this;

    /* 纵向滚动进度 */
    if (this.scroller) {
      this.scroller.addEventListener('scroll', function () {
        var max = self.scroller.scrollHeight - self.scroller.clientHeight;
        var p = max > 0 ? self.scroller.scrollTop / max : 0;
        if (self.railFill) self.railFill.style.height = (p * 100).toFixed(2) + '%';
        if (self.o.onScroll) self.o.onScroll(p);
      }, { passive: true });
    }

    /* 事件委托：图集 / 灯箱 / 播放 / 外链 / 回顶 / 下一部 */
    this.inner.addEventListener('click', function (ev) {
      var t = ev.target;
      var shot = t.closest('.shot');
      if (shot) {
        self.o.onShot && self.o.onShot(+shot.getAttribute('data-i'));
        return;
      }
      var nav = t.closest('[data-gal]');
      if (nav) {
        var row = self.$('wGalleryRow');
        var d = nav.getAttribute('data-gal') === 'next' ? 1 : -1;
        row.scrollBy({ left: d * Math.min(row.clientWidth * 0.7, 420), behavior: U.reduced() ? 'auto' : 'smooth' });
        return;
      }
      if (t.closest('#wPlay')) { self._play(); return; }
      if (t.closest('#wTop')) { self.scrollTop(true); return; }
      if (t.closest('#wCopy')) { if (self.o.onCopy) self.o.onCopy(); return; }
      var nx = t.closest('#wNext');
      if (nx && self.o.onNext) { self.o.onNext(); return; }
      var pv = t.closest('#wPrev');
      if (pv && self.o.onPrev) { self.o.onPrev(); return; }
    });

    /* 视频播放：懒加载 */
    this._onScroll = null;
  };

  /* ---------------------------------------------------------------- 播放 */
  Stage.prototype._play = function () {
    var frame = this.$('wHeroFrame');
    var w = this.current;
    if (!frame || !w) return;

    var existing = frame.querySelector('video');
    if (existing) {
      if (existing.paused) existing.play(); else existing.pause();
      return;
    }

    var self = this;
    var v = document.createElement('video');
    v.className = 'w-hero__media';
    v.controls = true;
    v.playsInline = true;
    /* 20 秒的片段播完停在最后一帧会「死」在画面上，循环才是作品集该有的表现 */
    v.loop = true;
    v.preload = 'metadata';
    v.poster = w.media.poster;
    v.src = w.media.video;

    function bail(msg) {
      v.remove();
      frame.classList.remove('is-video');
      var btn = frame.querySelector('#wPlay');
      if (btn) btn.style.display = '';
      self._toast(msg);
    }

    v.addEventListener('error', function () {
      bail('视频文件尚未上传 —— 把成片放到 ' + w.dir + '/video.mp4 即可自动播放');
    }, { once: true });

    frame.insertBefore(v, frame.firstChild);
    frame.classList.add('is-video');
    var play = frame.querySelector('#wPlay');
    if (play) play.style.display = 'none';

    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        /* 仅有自动播放被拦截：保留原生控件让用户手动播，不算失败 */
        setTimeout(function () { if (v.readyState === 0 && v.networkState === 3) bail('视频文件尚未上传 —— 把成片放到 ' + w.dir + '/video.mp4 即可自动播放'); }, 900);
      });
    }
  };

  Stage.prototype._toast = function (msg) {
    if (this.o.onToast) this.o.onToast(msg);
  };

  /* -------------------------------------------------------------- 边缘续滚 */
  /* 作品页内滚到顶/底之后继续滚，就切上一部 / 下一部 —— 这是作品集最自然的
     一条动线，缺了它页面会"撞墙"。为避免误触，三重闸门：
     ① 方向必须连续；② 累计滚动量过阈值；③ 触发后有一段冷却。 */
  Stage.prototype.initEdgeNav = function (onNext, onPrev) {
    var self = this;
    var acc = 0, sign = 0, lastT = 0, lock = 0;
    var THRESH = 200, IDLE = 380, COOLDOWN = 900;

    this.scroller.addEventListener('wheel', function (e) {
      var sc = self.scroller;
      /* 横向为主的手势交给剧照带自己处理 */
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { acc = 0; return; }
      var d = e.deltaY;
      if (!d) return;

      var now = performance.now();
      if (now - lastT > IDLE) { acc = 0; sign = 0; }
      lastT = now;

      var s = d > 0 ? 1 : -1;
      if (s !== sign) { acc = 0; sign = s; }

      var atTop = sc.scrollTop <= 1;
      var atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
      if (!(s > 0 ? atBottom : atTop)) { acc = 0; return; }

      acc += Math.abs(d);
      if (acc < THRESH || now < lock) return;
      acc = 0;
      lock = now + COOLDOWN;
      if (s > 0) onNext(); else onPrev();
    }, { capture: true, passive: true });
  };

  /* -------------------------------------------------------------- 滚动控制 */
  /* 注意：Lenis 启用时**必须**走它的 scrollTo。直接设 scroller.scrollTop
     会被 Lenis 的内部目标值立刻拽回，表现为「切作品后页面停在旧位置，
     过一秒才突然弹回顶部」——这正是之前切换衔接发涩的根因。 */
  Stage.prototype.scrollTop = function (smooth) {
    if (this.smooth) {
      this.smooth.scrollTo(0, { immediate: !smooth });
      return;
    }
    this.scroller.scrollTo({ top: 0, behavior: smooth && !U.reduced() ? 'smooth' : 'auto' });
  };

  /* 惯性平滑滚动：舞台内部是一个独立滚动容器，原生滚动在长页面上
     有明显的"跳格"感。触屏交给系统原生惯性，所以只在精确指针下启用。 */
  Stage.prototype.initSmooth = function () {
    var L = window.Lenis;
    if (!L || U.reduced() || U.coarse()) return false;
    var self = this;
    try {
      this.smooth = new L({
        wrapper: this.scroller,
        content: this.inner,
        lerp: 0.15,
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,
        autoRaf: false
      });
      var loop = function (t) {
        self.smooth.raf(t);
        self._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
      /* 平滑接管后，跳转/回顶都走 Lenis，否则两套缓动会互相追赶 */
      this.scroller.style.scrollBehavior = 'auto';
      return true;
    } catch (e) {
      this.smooth = null;
      return false;
    }
  };

  Stage.prototype.destroySmooth = function () {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    if (this.smooth) { try { this.smooth.destroy(); } catch (e) {} }
    this.smooth = null;
  };

  /* 精确指针 ↔ 触屏 / 减少动效切换时重新决定是否启用 */
  Stage.prototype.syncSmooth = function () {
    var want = !U.reduced() && !U.coarse();
    if (want && !this.smooth) this.initSmooth();
    else if (!want && this.smooth) this.destroySmooth();
  };

  /* 按页滚动（PageUp / PageDown） */
  Stage.prototype.scrollPage = function (dir) {
    if (!this.scroller) return;
    var step = this.scroller.clientHeight * 0.82 * (dir || 1);
    var to = U.clamp(this.scroller.scrollTop + step, 0, this.scroller.scrollHeight);
    if (this.smooth) { this.smooth.scrollTo(to, { immediate: false }); return; }
    this.scroller.scrollTo({ top: to, behavior: U.reduced() ? 'auto' : 'smooth' });
  };

  /* ---------------------------------------------------------------- 渲染 */
  Stage.prototype.render = function (w, index, total, animate) {
    var self = this;
    this.current = w;
    this.index = index;

    var $ = function (id) { return document.getElementById(id); };

    /* 眉标 */
    $('wIdx').textContent = w.n;
    var idxOf = $('wIdxOf');
    if (idxOf) idxOf.textContent = '/ ' + ('0' + total).slice(-2);
    $('wCat').textContent = w.group;
    $('wYear').textContent = w.year;

    /* 标题（拆字以便动效） */
    var title = $('wTitle');
    title.setAttribute('data-text', w.title);
    title.textContent = w.title;
    this._titleChars = U.splitChars(title);

    $('wSub').textContent = w.latin + '  ·  ' + w.typeLabel;
    $('wLogline').textContent = w.logline;

    /* 标签 */
    $('wTags').innerHTML = w.tags.map(function (t) { return '<span>' + U.esc(t) + '</span>'; }).join('');

    /* 交付形态（按 type 自适应：video / mixed / gallery） */
    var FM = (WB.SITE && WB.SITE.formMap) || {};
    var form = FM[w.type] || FM.video || { k: '影像成片', tc: 'REC', items: ['正片'] };

    /* 主视觉：按作品原生画幅渲染（竖屏短剧 9:16 / 横屏 16:9），不做统一裁切 */
    var frame = $('wHeroFrame');
    var fig = $('wHeroFig');
    var box = w.box || { w: 2560, h: 1440, css: '16 / 9', kind: 'HERO / 16:9' };
    frame.style.setProperty('--ar', box.css);
    /* 画框宽度由高度配额反推：给数值比交给 aspect-ratio 在 auto 轨道里推导更确定 */
    if (fig) {
      fig.style.setProperty('--ar', box.css);
      fig.style.setProperty('--arw', String(box.w));
      fig.style.setProperty('--arh', String(box.h));
    }
    frame.classList.toggle('is-portrait', !!w.isPortrait);
    frame.classList.toggle('is-landscape', !w.isPortrait);
    if (fig) {
      fig.classList.toggle('is-portrait', !!w.isPortrait);
      fig.classList.toggle('is-landscape', !w.isPortrait);
    }
    /* 竖屏作品：首屏改成「左标题 / 右竖幅海报」并置，画框才能完整落在首屏内 */
    if (this.inner) this.inner.classList.toggle('is-portrait', !!w.isPortrait);

    var oldVid = frame.querySelector('video');
    if (oldVid) oldVid.remove();
    var media = frame.querySelector('img.w-hero__media');
    if (!media) {
      media = document.createElement('img');
      media.className = 'w-hero__media';
      media.alt = w.title + ' 主视觉';
      media.loading = 'lazy';
      media.decoding = 'async';
      frame.insertBefore(media, frame.firstChild);
    }
    U.img(media, w.media.hero, {
      w: box.w, h: box.h, aspect: w.aspect, n: w.n, title: w.title,
      acc: w.accent, acc2: w.accent2, kind: box.kind, path: w.dir + '/hero.jpg'
    });

    var hasVideo = w.type === 'video' || w.type === 'mixed';
    frame.classList.toggle('is-video', hasVideo);
    frame.classList.toggle('is-still', !hasVideo);
    var play = frame.querySelector('#wPlay');
    if (play) play.style.display = hasVideo ? '' : 'none';

    /* 主视觉角标：视频类显示时码，静态类显示口径说明 */
    $('wHeroTc').innerHTML = hasVideo
      ? '<b>' + U.esc(form.tc) + '</b><span>' + U.esc(w.heroTc) + '</span>'
      : '<b>' + U.esc(form.tc) + '</b><span>静态设定 · 无成片</span>';
    $('wHeroBadge').textContent = w.typeLabel;

    /* 主视觉图注 + 两侧竖排画幅标注 */
    $('wHeroCap').innerHTML =
      '<span>' + U.esc(w.heroCap) + '</span>' +
      '<em>' + U.esc(w.dir) + '/hero.jpg · 建议 ' + box.w + '×' + box.h + '</em>';
    var sl = $('wHeroSideL'), sr = $('wHeroSideR');
    if (sl) sl.textContent = w.aspect + ' · ' + (w.isPortrait ? 'VERTICAL' : 'LANDSCAPE');
    if (sr) sr.textContent = box.w + ' × ' + box.h;

    /* 正文 */
    $('wSynopsis').innerHTML = w.synopsis.map(function (p) { return '<p>' + U.esc(p) + '</p>'; }).join('');
    $('wNote').innerHTML = '<p>' + U.esc(w.note) + '</p>';

    /* 事实表 */
    $('wFacts').innerHTML = w.facts.map(function (f) {
      return '<div><dt class="mono">' + U.esc(f[0]) + '</dt><dd>' + U.esc(f[1]) + '</dd></div>';
    }).join('');

    /* 交付形态区块 */
    var delEl = $('wDeliver');
    if (delEl) {
      delEl.innerHTML =
        '<div class="w-pal__k mono">交付形态 / DELIVERABLES</div>' +
        '<div class="w-deliver__k">' + U.esc(form.k) + '</div>' +
        '<div class="w-deliver__items">' +
          form.items.map(function (it) { return '<span class="mono">' + U.esc(it) + '</span>'; }).join('') +
        '</div>';
    }

    /* 色彩配方 */
    var palEl = $('wPalette');
    if (palEl) {
      var pl = w.palette || { main: '#101A33', sub: w.accent, dot: w.accent2, ratio: '60:30:10' };
      var parts = String(pl.ratio).split(':').map(function (n) { return parseFloat(n) || 0; });
      var cols = [pl.main, pl.sub, pl.dot];
      var names = ['主', '辅', '点缀'];
      palEl.innerHTML =
        '<div class="w-pal__k mono">色彩配方 / PALETTE</div>' +
        '<div class="w-pal__bar" role="img" aria-label="色彩配比 ' + U.esc(pl.ratio) + '">' +
          cols.map(function (c, i) {
            return '<i style="background:' + U.esc(c) + ';flex:' + (parts[i] || 1) + '"></i>';
          }).join('') +
        '</div>' +
        '<div class="w-pal__legend">' +
          cols.map(function (c, i) {
            return '<span><em style="background:' + U.esc(c) + '"></em>' +
              U.esc(names[i]) + ' ' + (parts[i] || 0) + '% <b class="mono">' + U.esc(c) + '</b></span>';
          }).join('') +
        '</div>';
    }

    /* 外链 */
    $('wLinks').innerHTML = w.links.map(function (l) {
      var off = l.off || !l.href;
      var tag = off ? 'button' : 'a';
      var attr = off ? 'type="button"' : 'href="' + U.esc(l.href) + '" target="_blank" rel="noopener"';
      return '<' + tag + ' ' + attr + ' class="' + (off ? 'is-off' : '') + '">' +
        '<span>' + U.esc(l.label) + (off ? ' · 待补' : '') + '</span>' + ICO.out + '</' + tag + '>';
    }).join('');

    /* 图集 */
    $('wGalleryRow').innerHTML = w.media.stills.map(function (s, i) {
      var tall = i % 5 === 3;
      return '<button class="shot' + (tall ? ' shot--tall' : '') + '" type="button" data-i="' + i + '" ' +
        'aria-label="查看剧照 ' + (i + 1) + '：' + U.esc(s.cap) + '">' +
        '<span class="shot__n mono">' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<span class="shot__exp">' + ICO.expand + '</span>' +
        '<span class="shot__cap">' + U.esc(s.cap) + '</span>' +
        '</button>';
    }).join('');

    /* 逐张挂图并兜底。占位图按各自卡片画幅生成，避免 cover 裁切出「半截标题」 */
    var shotEls = U.$$('.shot', $('wGalleryRow'));
    shotEls.forEach(function (el, i) {
      var tall = el.classList.contains('shot--tall');
      var img = document.createElement('img');
      img.alt = w.title + ' 剧照 ' + (i + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      U.img(img, w.media.stills[i].src, {
        w: tall ? 1080 : 1280, h: tall ? 1440 : 720,
        n: w.n, title: w.title, acc: w.accent, acc2: w.accent2,
        kind: 'STILL ' + ('0' + (i + 1)).slice(-2), path: w.media.stills[i].src
      });
      el.insertBefore(img, el.firstChild);
    });

    /* 演职员 */
    $('wCredits').innerHTML = w.credits.map(function (c) {
      return '<div class="credits__i"><div class="credits__r mono">' + U.esc(c[0]) + '</div>' +
        '<div class="credits__n">' + U.esc(c[1]) + '</div></div>';
    }).join('');

    /* 上/下一部 */
    var pad2 = function (n) { return ('0' + n).slice(-2); };
    var nextIdx = (index + 1) % total;
    var prevIdx = (index - 1 + total) % total;
    var nextW = this.o.works[nextIdx];
    var prevW = this.o.works[prevIdx];
    $('wNextK').textContent = '下一部 / NEXT · ' + nextW.n;
    $('wNextT').innerHTML = '<span>' + U.esc(nextW.title) + '</span>';
    $('wPrevK').textContent = '上一部 / PREV · ' + prevW.n;
    $('wPrevT').innerHTML = '<span>' + U.esc(prevW.title) + '</span>';

    /* 素材缺失提示：只在「开发态 + 主视觉确实没上传」时出现。
       这条是写给站点作者的施工信息，访客不该看到，所以线上永远隐藏。 */
    var emptyBox = $('wAssetHint');
    if (U.DEV) {
      emptyBox.innerHTML =
        '素材槽位：<code>' + U.esc(w.dir) + '/</code> ' +
        '<b>cover.jpg · hero.jpg · poster.jpg · video.mp4 · still-01…06.jpg</b>';
      emptyBox.hidden = true;
      U.probe(w.media.hero, null, function () { emptyBox.hidden = false; });
    } else {
      emptyBox.hidden = true;
    }

    if (animate !== false) this.animateIn();
    else this.scrollTop(false);
  };

  /* ------------------------------------------------------------ 转场 / 入场 */
  /* 首屏之下的内容不该在页面打开时就全部播完 —— 交给 IntersectionObserver
     在真正滚到视口时才揭示，既省掉无意义的动画，也让滚动过程有节奏。 */
  Stage.prototype._clearReveals = function () {
    this._reveals.forEach(function (io) { try { io.disconnect(); } catch (e) {} });
    this._reveals = [];
  };

  Stage.prototype._setupReveals = function () {
    var self = this;
    var g = window.gsap;
    this._clearReveals();

    if (!g || U.reduced() || !window.IntersectionObserver) return;

    var els = U.$$('.w-cols > *, .w-gallery, .w-credits, .w-foot', this.inner);
    if (!els.length) return;

    /* 先压暗，避免滚动到位前一闪而过 */
    g.set(els, { opacity: 0, y: 36 });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var idx = els.indexOf(en.target);
        g.to(en.target, {
          opacity: 1, y: 0, duration: 0.82, ease: 'power2.out',
          delay: Math.max(0, (idx % 2) * 0.07),
          clearProps: 'transform'
        });
      });
    }, { root: this.scroller, rootMargin: '0px 0px -12% 0px', threshold: 0.04 });

    els.forEach(function (el) { io.observe(el); });
    this._reveals.push(io);

    /* 兜底：只强制显示「确实已经进入视口但没被观察到」的元素，不漏内容也不破坏节奏 */
    clearTimeout(this._revealFallback);
    this._revealFallback = setTimeout(function () {
      var sr = self.scroller.getBoundingClientRect();
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var inView = r.top < sr.bottom && r.bottom > sr.top;
        if (inView && parseFloat(getComputedStyle(el).opacity) < 0.05) g.set(el, { opacity: 1, y: 0 });
      });
    }, 1400);
  };

  Stage.prototype.animateIn = function () {
    var chars = this._titleChars || [];
    var g = window.gsap;
    var body = this.inner;

    if (!g || U.reduced()) {
      body.style.opacity = 1;
      body.style.transform = 'none';
      this.scrollTop(false);
      return;
    }

    this.scrollTop(false);

    g.killTweensOf([body].concat(chars));

    g.set(body, { opacity: 1 });
    g.fromTo(chars, { opacity: 0, yPercent: 62, filter: 'blur(9px)' },
      { opacity: 1, yPercent: 0, filter: 'blur(0px)', duration: 0.78, ease: 'power3.out', stagger: { each: 0.026, from: 'random' } });

    /* 只播首屏能看到的部分 */
    var above = ['.w-eyebrow', '.w-sub', '.w-logline', '.w-tags', '.w-hero']
      .map(function (s) { return body.querySelector(s); }).filter(Boolean);
    g.fromTo(above,
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.72, ease: 'power2.out', stagger: 0.055, delay: 0.06, clearProps: 'transform' });

    /* 主视觉自身：轻微推近 + 亮度揭开，比单纯位移更有"揭幕"感 */
    var heroFrame = body.querySelector('.w-hero__frame');
    if (heroFrame) {
      g.fromTo(heroFrame,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.05, ease: 'expo.out', delay: 0.18, clearProps: 'clipPath' });
      var hm = heroFrame.querySelector('.w-hero__media');
      if (hm) g.fromTo(hm, { scale: 1.09 }, { scale: 1, duration: 1.5, ease: 'expo.out', delay: 0.18, clearProps: 'transform' });
    }

    this._setupReveals();
  };

  /* 提交级转场：扫光遮盖 → 换内容 → 扫光揭开（可重入安全） */
  Stage.prototype.transitionTo = function (w, index, total, done) {
    var self = this;
    var g = window.gsap;

    if (!g || U.reduced()) {
      this.render(w, index, total, false);
      this.inner.style.opacity = 1;
      done && done();
      return;
    }

    /* 快速连点时，先撤掉上一轮尚未执行的切换，避免内容被反复重绘 */
    if (this._pending) { this._pending.kill(); this._pending = null; }

    var wipe = this.wipe;
    g.killTweensOf(wipe);
    g.killTweensOf(this.inner);
    g.set(wipe, { xPercent: -101, opacity: 1 });

    /* 旧内容先淡出（0.16s），扫光带头同步掠过；
       复位滚动与换内容都发生在内容不可见的窗口里，因此看不到任何跳跃；
       新内容由 animateIn() 逐层揭示（标题拆字 / 主视觉 clipPath 揭开）。 */
    g.to(this.inner, { opacity: 0, duration: 0.16, ease: 'power2.in' });

    this._pending = g.delayedCall(0.18, function () {
      self._pending = null;
      self.scrollTop(false);
      self.render(w, index, total, true);
    });

    g.to(wipe, {
      xPercent: 101,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: function () {
        g.set(wipe, { opacity: 0, xPercent: -101 });
        done && done();
      }
    });
  };

  /* -------------------------------------------------------------- 预热 */
  /* 轮盘转到某部作品时就把主视觉解码好：提交时换图即瞬时，
     不会出现「扫光揭开后图还在加载」的空窗。 */
  Stage.prototype.preload = function (w) {
    if (!w || w === this._warm) return;
    this._warm = w;
    U.preload(w.media.hero);
    if (w.media.poster) U.preload(w.media.poster);
    U.preload(w.media.cover);
  };

  /* -------------------------------------------------------------- 灯箱数据 */
  Stage.prototype.lightboxData = function () {
    var w = this.current;
    if (!w) return [];
    return w.media.stills.map(function (s, i) {
      return { src: s.src, cap: s.cap, n: ('0' + (i + 1)).slice(-2), w: w };
    });
  };

  WB.Stage = Stage;
  WB.ICO = ICO;
  WB.typeIco = typeIco;

})(window.WB = window.WB || {});
