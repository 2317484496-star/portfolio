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
    spark: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/></svg>',
    pause: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" fill="currentColor"/></svg>',
    replay: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 1 0 2.2-5"/><path d="M5 5v4.4h4.4"/></svg>',
    vol: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z"/><path d="M15.6 9a4.2 4.2 0 0 1 0 6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>',
    muted: '<svg ' + SVG_OPEN + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z"/><path d="M16 9.5l4.6 5M20.6 9.5l-4.6 5"/></svg>'
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
      window.addEventListener('resize', function () { self.syncSmooth(); self.fitHero(); });
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
      var nx = t.closest('#wNext');
      if (nx && self.o.onNext) { self.o.onNext(); return; }
      var pv = t.closest('#wPrev');
      if (pv && self.o.onPrev) { self.o.onPrev(); return; }
    });

    /* 悬停主视觉时只做「Range 能力探测」（2 字节）+ 预热封帧，
       不再整段下载成片：流式起播时几百 KB 就够出画面了，
       整段预取反而会把带宽占满，点播放那一刻更慢。 */
    var heroFrame = this.$('wHeroFrame');
    if (heroFrame) {
      heroFrame.addEventListener('pointerenter', function () {
        var w = self.current;
        if (!w) return;
        if (w.type !== 'video' && w.type !== 'mixed') return;
        if (location.protocol === 'file:') return;
        if (U._missing[w.media.video]) return;
        self._rangeOK(w.media.video);
      });
    }

    /* 视频播放：懒加载 */
    this._onScroll = null;
  };

  /* ---------------------------------------------------------------- 播放 */
  function vFmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  Stage.prototype._play = function () {
    var frame = this.$('wHeroFrame');
    var w = this.current;
    if (!frame || !w) return;

    var existing = frame.querySelector('video');
    if (existing) {
      /* 放完停在最后一帧：再点一下从头重看，而不是点了没反应 */
      if (existing.ended) {
        try { existing.currentTime = 0; } catch (e) {}
        var p0 = existing.play();
        if (p0 && p0.catch) p0.catch(function () {});
        return;
      }
      if (existing.paused) {
        var p1 = existing.play();
        if (p1 && p1.catch) p1.catch(function () {});
      } else existing.pause();
      return;
    }

    var self = this;
    var v = document.createElement('video');
    v.className = 'w-hero__media';
    /* 原生控件在深色画面上又小又难拖，换成自绘控制条 */
    v.controls = false;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    /* 不循环：一轮放完就停，要不要再看交给用户 */
    v.loop = false;
    v.preload = 'auto';
    /* 封帧也用 webp：点播放后到第一帧之间显示的就是它，越小越快有画面 */
    v.poster = U.webpOf(w.media.poster, false) || w.media.poster;

    function bail(msg) {
      v.remove();
      var bar = frame.querySelector('.vctl');
      if (bar) bar.remove();
      frame.classList.remove('is-video', 'is-playing', 'is-idle', 'is-ended', 'is-portrait', 'is-landscape');
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

    var bar = this._videoBar(v, frame);

    function start(src) {
      if (!frame.contains(v)) return;   /* 已经切到别的作品 */
      if (v.getAttribute('src') !== src) { v.src = src; v.load(); }
      bar.ready();
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {
        /* 移动端浏览器可能拦下没有用户手势的自动播放：
           把 PLAY 按钮放回来，让人再点一次，而不是留一个死画面 */
        frame.classList.remove('is-playing');
        var ov2 = frame.querySelector('#wPlay');
        if (ov2) ov2.style.display = '';
      });
    }

    if (location.protocol === 'file:' || !window.fetch || !window.Blob) {
      start(w.media.video);
      return;
    }

    /* 能不能 Range，直接决定用哪条路：
       · 能（GitHub Pages 等）→ 流式起播，几百 KB 就有画面，拖进度条也正常；
       · 不能（部分静态托管）→ 整段取回成 Blob，宁可慢一点也要保证能拖。
       以前一律先整段下载，22MB 的成片要等它全下来才播 —— 这就是
       「新电脑点进视频要等很久」的直接原因。 */
    var known = this._rangeCache && this._rangeCache[w.media.video];
    var decide = (known == null) ? this._rangeOK(w.media.video) : Promise.resolve(known);

    decide.then(function (ok) {
      if (ok) { start(w.media.video); return null; }
      bar.loading(0);
      return self._loadVideo(w, function (p) { bar.loading(p); })
        .then(function (url) { start(url); })
        .catch(function () {
          /* 取不回来就退回流式播放：不能拖，但至少能看 */
          bar.ready();
          start(w.media.video);
        });
    }).catch(function () { start(w.media.video); });
  };

  /* Range 能力探测：请求头带 Range 拿 2 个字节，看服务端是否回 206。
     结果按地址缓存；渲染作品时就会预热，点播放时基本已命中。 */
  Stage.prototype._rangeOK = function (url) {
    var self = this;
    if (!this._rangeCache) this._rangeCache = {};
    if (this._rangeCache[url] != null) return Promise.resolve(this._rangeCache[url]);
    if (!window.fetch || !window.AbortController) return Promise.resolve(false);

    var ac = new AbortController();
    return fetch(url, { headers: { Range: 'bytes=0-1' }, signal: ac.signal })
      .then(function (r) {
        var ok = r.status === 206;
        try { ac.abort(); } catch (e) {}
        self._rangeCache[url] = ok;
        return ok;
      })
      .catch(function () {
        /* 探测失败按「不支持」处理：走 Blob 那条更稳的路 */
        if (self._rangeCache[url] == null) self._rangeCache[url] = false;
        return false;
      });
  };

  /* 整段取回视频并缓存成 objectURL（最多留两份，别把十个成片堆在内存里）。
     同一部作品的并发请求会复用同一个 Promise。 */
  Stage.prototype._loadVideo = function (w, onProgress) {
    var self = this;
    var key = w.n;
    if (!this._vbuf) this._vbuf = {};
    if (!this._vpending) this._vpending = {};
    if (this._vbuf[key]) return Promise.resolve(this._vbuf[key]);
    if (this._vpending[key]) return this._vpending[key];
    if (U._missing[w.media.video]) return Promise.reject(new Error('missing'));

    var p = fetch(w.media.video)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var total = +(r.headers.get('content-length') || 0);
        if (!r.body || !r.body.getReader) return r.blob();
        var reader = r.body.getReader();
        var chunks = [], got = 0;
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) return new Blob(chunks, { type: 'video/mp4' });
            chunks.push(res.value);
            got += res.value.length;
            if (onProgress) onProgress(total ? got / total : 0);
            return pump();
          });
        }
        return pump();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        self._vbuf[key] = url;
        var keys = Object.keys(self._vbuf);
        while (keys.length > 2) {
          var k = keys.shift();
          if (k === key) continue;
          try { URL.revokeObjectURL(self._vbuf[k]); } catch (e) {}
          delete self._vbuf[k];
        }
        delete self._vpending[key];
        return url;
      })
      .catch(function (e) {
        delete self._vpending[key];
        U._missing[w.media.video] = 1;
        throw e;
      });

    this._vpending[key] = p;
    return p;
  };

  /* 自绘控制条：播放 / 进度拖动 / 时间 / 静音 / 全屏。
     顺带在元数据就绪后把画框比例改成素材的真实比例。 */
  Stage.prototype._videoBar = function (v, frame) {
    var self = this;
    var old = frame.querySelector('.vctl');
    if (old) old.remove();

    var bar = document.createElement('div');
    bar.className = 'vctl';
    bar.innerHTML =
      '<button class="vctl__b" type="button" data-act="toggle" aria-label="暂停">' + ICO.pause + '</button>' +
      '<span class="vctl__t" data-cur>00:00</span>' +
      '<input class="vctl__seek" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度，可左右拖动">' +
      '<span class="vctl__t" data-dur>00:00</span>' +
      '<button class="vctl__b" type="button" data-act="mute" aria-label="静音">' + ICO.vol + '</button>' +
      '<button class="vctl__b" type="button" data-act="fs" aria-label="全屏观看">' + ICO.expand + '</button>';
    frame.appendChild(bar);

    var seek = bar.querySelector('.vctl__seek');
    var cur = bar.querySelector('[data-cur]');
    var durEl = bar.querySelector('[data-dur]');
    var toggle = bar.querySelector('[data-act="toggle"]');
    var muteBtn = bar.querySelector('[data-act="mute"]');
    var fsBtn = bar.querySelector('[data-act="fs"]');
    var dragging = false;

    function paint() {
      var p = v.duration ? v.currentTime / v.duration : 0;
      seek.value = String(Math.round(p * 1000));
      seek.style.setProperty('--p', (p * 100).toFixed(2) + '%');
      cur.textContent = vFmt(v.currentTime);
    }

    /* 画框跟着素材真实比例走：16:9 的作品配 9:16 成片时，画框收成竖幅，
       而不是把画面塞进比例不对的框里、上下留一大条黑边。
       竖屏作品例外：它们统一用 data.js 里的 PORTRAIT_CSS，
       不按各自视频的宽高现算 —— 否则每部作品的画框都会差一点点。 */
    function syncAspect() {
      var vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      var portraitWork = self.current && self.current.isPortrait;
      if (!portraitWork) {
        frame.style.setProperty('--ar', vw + ' / ' + vh);
        var fig = self.$('wHeroFig');
        if (fig) {
          fig.style.setProperty('--arw', String(vw));
          fig.style.setProperty('--arh', String(vh));
        }
      }
      frame.classList.toggle('is-portrait', vw < vh);
      frame.classList.toggle('is-landscape', vw >= vh);
      requestAnimationFrame(function () { self.fitHero(); });
    }

    v.addEventListener('loadedmetadata', function () {
      syncAspect();
      durEl.textContent = vFmt(v.duration);
      paint();
    });
    v.addEventListener('durationchange', function () { durEl.textContent = vFmt(v.duration); });
    v.addEventListener('timeupdate', function () { if (!dragging) paint(); });

    var ov = frame.querySelector('#wPlay');

    v.addEventListener('play', function () {
      frame.classList.add('is-playing');
      frame.classList.remove('is-ended');
      toggle.innerHTML = ICO.pause;
      toggle.setAttribute('aria-label', '暂停');
      /* 视频接管画面后，中央那枚 PLAY 就收起来 */
      if (ov) ov.style.display = 'none';
    });
    v.addEventListener('pause', function () {
      frame.classList.remove('is-playing');
      toggle.innerHTML = v.ended ? ICO.replay : ICO.play;
      toggle.setAttribute('aria-label', v.ended ? '重播' : '播放');
      frame.classList.remove('is-idle');
    });
    /* 一轮放完：停在最后一帧，不回到开头，也不循环。
       同时把 PLAY 按钮与重播图标放回来 —— 用户看得见「可以再看一次」。 */
    v.addEventListener('ended', function () {
      frame.classList.remove('is-playing', 'is-idle');
      frame.classList.add('is-ended');
      toggle.innerHTML = ICO.replay;
      toggle.setAttribute('aria-label', '重播');
      paint();
      if (ov) ov.style.display = '';
    });

    function togglePlay() {
      if (v.ended) {
        try { v.currentTime = 0; } catch (e) {}
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
        return;
      }
      if (v.paused) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else v.pause();
    }

    toggle.addEventListener('click', togglePlay);

    seek.addEventListener('pointerdown', function () { dragging = true; });
    window.addEventListener('pointerup', function () { dragging = false; });
    seek.addEventListener('input', function () {
      var p = +seek.value / 1000;
      if (isFinite(v.duration)) v.currentTime = v.duration * p;
      seek.style.setProperty('--p', (p * 100).toFixed(2) + '%');
      cur.textContent = vFmt(v.currentTime);
    });
    seek.addEventListener('change', function () { dragging = false; });

    muteBtn.addEventListener('click', function () {
      v.muted = !v.muted;
      muteBtn.classList.toggle('is-off', v.muted);
      muteBtn.innerHTML = v.muted ? ICO.muted : ICO.vol;
      muteBtn.setAttribute('aria-label', v.muted ? '取消静音' : '静音');
    });

    fsBtn.addEventListener('click', function () {
      var d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
      } else if (v.requestFullscreen) {
        v.requestFullscreen().catch(function () {});
      } else if (v.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
    });

    /* 播放中 2.4s 不动鼠标就把控制条收起来，别一直压在画面上 */
    var idle;
    function wake() {
      frame.classList.remove('is-idle');
      clearTimeout(idle);
      idle = setTimeout(function () {
        if (!v.paused) frame.classList.add('is-idle');
      }, 2400);
    }
    frame.addEventListener('pointermove', wake);
    /* 触屏没有 hover：点画面唤出控制条，再点画面才是播放/暂停 */
    frame.addEventListener('pointerdown', function (ev) {
      wake();
      if (ev.pointerType === 'mouse') return;
      if (ev.target.closest && ev.target.closest('.vctl')) return;
      if (ev.target.closest && ev.target.closest('#wPlay')) return;
      togglePlay();
    });
    wake();
    this._videoWake = wake;

    return {
      loading: function (p) {
        bar.classList.add('is-loading');
        seek.disabled = true;
        seek.style.setProperty('--p', (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%');
        cur.textContent = p > 0 ? Math.round(p * 100) + '%' : '载入';
      },
      ready: function () {
        bar.classList.remove('is-loading');
        seek.disabled = false;
        durEl.textContent = vFmt(v.duration);
        paint();
      }
    };
  };

  Stage.prototype._toast = function (msg) {
    if (this.o.onToast) this.o.onToast(msg);
  };

  /* 主视觉的真实状态：素材是否到位，决定播放键与时码角标是否成立。
     素材还没上传的作品退回静态口径，访客不会看到一个点了没反应的播放键。 */
  Stage.prototype._syncHeroState = function () {
    var w = this.o.works[this.index];
    var f = document.getElementById('wHeroFrame');
    if (!w || !f) return;
    var miss = !!U._missing[w.media.hero];
    var vid = w.type === 'video' || w.type === 'mixed';
    var ok = !miss && vid;
    var pb = f.querySelector('#wPlay');
    f.classList.toggle('is-video', ok);
    f.classList.toggle('is-still', !ok);
    /* 已经有 <video> 在场时不能把中央 PLAY 再摆出来压住画面 */
    if (pb) pb.style.display = (ok && !f.querySelector('video')) ? '' : 'none';
    var tc = document.getElementById('wHeroTc');
    if (tc) {
      tc.innerHTML = ok
        ? '<b>REC</b><span>' + U.esc(w.heroTc) + '</span>'
        : '<b>STILL</b><span>静态视觉 · 成片待上线</span>';
    }
  };

  /* 按「实际可用高度」算主视觉的画框高度。
     只用 CSS 的 100vh 断点调不准：标题换行、图注高度都会变，
     结果要么画面被页面底边切掉，要么白白空出一条。 */
  Stage.prototype.fitHero = function () {
    var fig = this.$('wHeroFig');
    var sc = this.scroller;
    if (!fig || !sc) return;
    if (fig.classList.contains('is-portrait')) {
      fig.style.removeProperty('--hero-h');
      return;
    }
    var cs = getComputedStyle(fig);
    var arw = parseFloat(cs.getPropertyValue('--arw')) || 16;
    var arh = parseFloat(cs.getPropertyValue('--arh')) || 9;
    var top = fig.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    /* 46px 留给图注，24px 是底边呼吸 */
    var byH = sc.clientHeight - top - 46 - 24;
    var byW = (fig.clientWidth - 8) * arh / arw;
    var h = Math.max(240, Math.min(byH, byW, 920));
    fig.style.setProperty('--hero-h', Math.round(h) + 'px');
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

  /* ------------------------------------------------------------ 参与程度 */
  Stage.prototype._paintScope = function (w) {
    var el = this.$('wScope');
    if (!el) return;
    var map = WB.SCOPE || {};
    var sc = map[w.scope] || map.join;
    el.setAttribute('data-scope', w.scope || 'join');

    this.$('wScopeVal').textContent = sc.zh;
    this.$('wScopeEn').textContent = sc.en;

    var meter = this.$('wScopeMeter');
    if (meter) {
      var bars = meter.children;
      for (var i = 0; i < bars.length; i++) bars[i].classList.toggle('is-on', i < sc.n);
    }

    var detail = U.scopeDetail(w.role, sc);
    var dEl = this.$('wScopeDetail');
    if (dEl) { dEl.textContent = detail; dEl.hidden = !detail; }

    el.setAttribute('aria-label', '参与程度：' + sc.zh + (detail ? '，' + detail : ''));
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

    /* 参与程度徽标：主导 / 参与 / 部分，三格长度条 + 具体分工。
       这是访客最先要判断的事（「这片子他有几分功劳」），所以放在标题正下方，
       而不是塞进眉标里那串 10px 的小字。 */
    this._paintScope(w);

    /* 标题（拆字以便动效） */
    var title = $('wTitle');
    title.setAttribute('data-text', w.title);
    title.textContent = w.title;
    this._titleChars = U.splitChars(title);

    $('wSub').textContent = w.latin + '  ·  ' + w.typeLabel;
    $('wLogline').textContent = w.logline;

    /* 标签 */
    $('wTags').innerHTML = w.tags.map(function (t) { return '<span>' + U.esc(t) + '</span>'; }).join('');

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
    var oldBar = frame.querySelector('.vctl');
    if (oldBar) oldBar.remove();
    frame.classList.remove('is-playing', 'is-idle', 'is-ended');
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
      w: box.w, h: box.h,
      /* 手机竖屏下主视觉是满宽，桌面是约 900 的定宽 —— 按这个口径挑 webp 档位 */
      sizes: w.isPortrait ? '(max-width: 860px) 92vw, 520px' : '(max-width: 860px) 100vw, 900px',
      aspect: w.aspect, n: w.n, title: w.title,
      acc: w.accent, acc2: w.accent2, kind: box.kind, path: w.dir + '/hero.jpg'
    });

    var hasVideo = w.type === 'video' || w.type === 'mixed';
    /* 有成片就先探一下 Range（2 个字节）：点播放时不必再等一个往返 */
    if (hasVideo && location.protocol !== 'file:') this._rangeOK(w.media.video);
    frame.classList.toggle('is-video', hasVideo);
    frame.classList.toggle('is-still', !hasVideo);
    var play = frame.querySelector('#wPlay');
    if (play) play.style.display = hasVideo ? '' : 'none';
    /* 还没上传成片的作品不该挂着播放键（那条「视频尚未上传」的提示是
       写给作者看的）。素材一旦缺位，就把这一格退回静态口径。 */
    this._syncHeroState();
    clearTimeout(this._heroSyncT);
    var self0 = this;
    this._heroSyncT = setTimeout(function () { self0._syncHeroState(); }, 420);

    /* 主视觉角标：有成片的显示时码，无成片的说明口径 */
    $('wHeroTc').innerHTML = hasVideo
      ? '<b>REC</b><span>' + U.esc(w.heroTc) + '</span>'
      : '<b>STILL</b><span>静态设定 · 无成片</span>';
    $('wHeroBadge').textContent = w.typeLabel;

    /* 图注只留画面说明：素材路径与建议分辨率是施工信息，不该给访客看 */
    $('wHeroCap').innerHTML = '<span>' + U.esc(w.heroCap) + '</span>';

    /* 正文 */
    $('wSynopsis').innerHTML = w.synopsis.map(function (p) { return '<p>' + U.esc(p) + '</p>'; }).join('');
    /* 「创作手记 / 分镜思路」区块已按用户要求整块下线（2026-10-19）。
       data.js 里的 note 字段保留，将来要恢复只需把区块和这一行加回来。 */

    /* 事实表 */
    $('wFacts').innerHTML = w.facts.map(function (f) {
      return '<div><dt class="mono">' + U.esc(f[0]) + '</dt><dd>' + U.esc(f[1]) + '</dd></div>';
    }).join('');

    /* 外链：只渲染有真实地址的。没配地址的直接不出现 ——
       以前会渲染成「平台正片 · 待补」的灰色按钮，等于把施工状态摆给访客看。 */
    var live = (w.links || []).filter(function (l) { return l && l.href && !l.off; });
    var linksEl = $('wLinks');
    linksEl.innerHTML = live.map(function (l) {
      return '<a href="' + U.esc(l.href) + '" target="_blank" rel="noopener">' +
        '<span>' + U.esc(l.label) + '</span>' + ICO.out + '</a>';
    }).join('');
    linksEl.hidden = !live.length;

    /* 图集：默认横版格子；声明了 stillAspect 的作品（重生拒嫁）用竖版格子，
       否则 9:16 的剧照会被塞进 16:9 的框里裁掉半张脸 */
    var vertStills = w.stillAspect === '9:16';
    $('wGalleryRow').innerHTML = w.media.stills.map(function (s, i) {
      var tall = !vertStills && i % 5 === 3;
      var cls = vertStills ? ' shot--vert' : (tall ? ' shot--tall' : '');
      return '<button class="shot' + cls + '" type="button" data-i="' + i + '" ' +
        'aria-label="查看剧照 ' + (i + 1) + '：' + U.esc(s.cap) + '">' +
        '<span class="shot__n mono">' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<span class="shot__exp">' + ICO.expand + '</span>' +
        '<span class="shot__cap">' + U.esc(s.cap) + '</span>' +
        '</button>';
    }).join('');

    /* 逐张挂图并兜底。占位图按各自卡片画幅生成，避免 cover 裁切出「半截标题」
       —— 但延迟到剧照区接近视口时才真的发请求：首屏只看得见主视觉，
       一进来就把 6 张剧照下完，等于把首屏让给了看不见的内容。 */
    var shotEls = U.$$('.shot', $('wGalleryRow'));
    var gRow = $('wGalleryRow');
    clearTimeout(this._galT);

    function hydrateShots() {
      shotEls.forEach(function (el, i) {
        if (el.getAttribute('data-loaded')) return;
        el.setAttribute('data-loaded', '1');
        var tall = el.classList.contains('shot--tall');
        var vert = el.classList.contains('shot--vert');
        var img = document.createElement('img');
        img.alt = w.title + ' 剧照 ' + (i + 1);
        img.loading = 'lazy';
        img.decoding = 'async';
        var opt = {
          n: w.n, title: w.title, acc: w.accent, acc2: w.accent2,
          kind: 'STILL ' + ('0' + (i + 1)).slice(-2), path: w.media.stills[i].src
        };
        if (vert) {
          opt.w = 1080; opt.h = 1920; opt.dw = 1080;
          opt.sizes = '(max-width: 860px) 44vw, 210px';
        } else {
          opt.w = tall ? 1080 : 1280;
          opt.h = tall ? 1440 : 720;
          opt.dw = 1280;
          opt.sizes = '(max-width: 860px) 78vw, 520px';
        }
        U.img(img, w.media.stills[i].src, opt);
        el.insertBefore(img, el.firstChild);
      });
    }

    if (gRow) {
      /* 触发条件二选一：滚到剧照区附近，或者渲染完 3.2s（那时主视觉早已到位）。
         IntersectionObserver 在这种"内容刚被整体替换"的时刻会按旧布局算一次，
         容易在首屏就误触，所以这里用滚动位置 + 定时器，行为可预期。 */
      var sc = this.scroller;
      var fired = false;
      var fire = function () {
        if (fired) return;
        fired = true;
        clearTimeout(self0._galT);
        if (sc) sc.removeEventListener('scroll', onScroll);
        hydrateShots();
      };
      var onScroll = function () {
        var r = gRow.getBoundingClientRect();
        var b = sc ? sc.getBoundingClientRect() : null;
        if (!b || r.top < b.bottom + 420) fire();
      };
      if (sc) sc.addEventListener('scroll', onScroll, { passive: true });
      self0._galT = setTimeout(fire, 3200);
    } else {
      hydrateShots();
    }

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

    /* 画框高度依赖真实排版结果，等这一帧排完再量 */
    var selfFit = this;
    requestAnimationFrame(function () { selfFit.fitHero(); });

    /* 素材缺失提示：只在「开发态 + 主视觉确实没上传」时出现。
       这条是写给站点作者的施工信息，访客不该看到，所以线上永远隐藏。 */
    var emptyBox = $('wAssetHint');
    if (U.DEV) {
      emptyBox.innerHTML =
        '素材槽位：<code>' + U.esc(w.dir) + '/</code> ' +
        '<b>cover.jpg · hero.jpg · poster.jpg · video.mp4 · still-01…06.jpg</b>';
      emptyBox.hidden = true;
      /* 不为「检查主视觉在不在」单独发一次请求：等 <img> 自己的失败结果 */
      setTimeout(function () { emptyBox.hidden = !U._missing[w.media.hero]; }, 1800);
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

    var els = U.$$('.w-cols > *, .w-gallery, .w-foot', this.inner);
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
    /* 半尺寸就够：画位宽度不到 900px，全尺寸那张只会在 DPR≥2 时才被选中 */
    U.preload(w.media.hero, true);
    if (w.media.poster) U.preload(w.media.poster);
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
