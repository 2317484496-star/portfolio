/* ============================================================================
   util.js — 通用工具：数学 / DOM / 文本动效 / 颜色 / 程序化占位视觉
   ========================================================================= */

(function (WB) {
  'use strict';

  /* ------------------------------------------------------------------ 数学 */
  var U = {};

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.mod = function (n, m) { return ((n % m) + m) % m; };
  U.rad = function (d) { return d * Math.PI / 180; };
  U.deg = function (r) { return r * 180 / Math.PI; };

  /* 帧率无关的插值系数 */
  U.damp = function (dt, rate) { return 1 - Math.pow(1 - rate, dt * 60); };

  /* 最短角差（度），结果落在 (-180, 180] */
  U.angDelta = function (from, to) { return U.mod(to - from + 180, 360) - 180; };

  U.easeOutExpo = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
  U.easeOutQuint = function (t) { return 1 - Math.pow(1 - t, 5); };

  /* ------------------------------------------------------------------ DOM */
  U.$  = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.el = function (tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.raf = function (fn) {
    var last = 0, id = 0, running = true;
    function loop(t) {
      if (!running) return;
      var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;
      fn(dt, t);
      id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);
    return function stop() { running = false; cancelAnimationFrame(id); };
  };

  U.once = function (fn) { var done = false; return function () { if (done) return; done = true; return fn.apply(this, arguments); }; };

  U.debounce = function (fn, ms) {
    var t; return function () {
      var a = arguments, s = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms);
    };
  };

  /* 判断是否降低动效 */
  /* 无障碍 / 指针偏好。matchMedia() 每次调用都会构造一个 MediaQueryList，
     而这两个判断在渲染循环里被高频调用，所以这里缓存住。 */
  U._mq = {};
  function mq(q) {
    if (!window.matchMedia) return null;
    if (!U._mq[q]) U._mq[q] = window.matchMedia(q);
    return U._mq[q];
  }
  U.reduced = function () {
    var m = mq('(prefers-reduced-motion: reduce)');
    return !!(m && m.matches);
  };
  U.coarse = function () {
    var m = mq('(hover: none), (pointer: coarse)');
    return !!(m && m.matches);
  };

  /* ------------------------------------------------------------ 开发态判定 */
  /* 页面上有一部分内容是写给「站点的作者」看的 —— 素材槽位清单、文件命名规范、
     文案集中在哪个文件。这些不该出现在访客眼前，否则一个公开作品集里会挂着
     施工说明。所以只在本地预览、file:// 打开或显式加 ?dev 时才显示；
     GitHub Pages 等线上环境下自动隐藏，需要时用 ?dev 临时打开。 */
  U.DEV = (function () {
    try {
      if (location.protocol === 'file:') return true;
      if (/[?&]dev\b/.test(location.search)) return true;
      return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
    } catch (e) { return false; }
  })();
  if (U.DEV) document.documentElement.classList.add('is-dev');

  /* ------------------------------------------------------------------ 颜色 */
  U.hex2rgb = function (hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgb2hex = function (r) {
    return '#' + r.map(function (v) {
      var s = Math.round(U.clamp(v, 0, 255)).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  };
  U.mix = function (a, b, t) {
    var A = U.hex2rgb(a), B = U.hex2rgb(b);
    return U.rgb2hex([U.lerp(A[0], B[0], t), U.lerp(A[1], B[1], t), U.lerp(A[2], B[2], t)]);
  };
  U.rgbStr = function (rgb) { return rgb[0] + ',' + rgb[1] + ',' + rgb[2]; };

  /* 把强调色写到 :root 上，驱动整站换色 */
  U.applyAccent = function (acc, acc2) {
    var r = document.documentElement.style;
    r.setProperty('--acc', acc);
    r.setProperty('--acc-rgb', U.rgbStr(U.hex2rgb(acc)));
    if (acc2) {
      r.setProperty('--acc-2', acc2);
      r.setProperty('--acc-2-rgb', U.rgbStr(U.hex2rgb(acc2)));
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#030409');
  };

  /* ------------------------------------------------------------------ 文本 */
  /* 把文本拆成<span class="ch">，返回数组；保留原有换行语义 */
  U.splitChars = function (el) {
    var text = el.getAttribute('data-text') || el.textContent || '';
    el.setAttribute('data-text', text);
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      frag.appendChild(s);
      out.push(s);
    }
    el.appendChild(frag);
    return out;
  };

  /* 乱码解码：字符从随机符号收敛到目标文本 */
  var GLYPH = '▚▞▓▒░#*+=/\\<>[]{}01アイウエオカキクケコサシスセソタチツテトナニヌネノ';
  U.scramble = function (el, finalText, dur, delay) {
    if (U.reduced()) { el.textContent = finalText; return { kill: function () {} }; }
    var start = performance.now() + (delay || 0);
    var total = (dur || 640);
    var raf = requestAnimationFrame(function tick(now) {
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      var p = U.clamp((now - start) / total, 0, 1);
      var reveal = Math.floor(p * finalText.length);
      var s = '';
      for (var i = 0; i < finalText.length; i++) {
        if (i < reveal) s += finalText[i];
        else if (finalText[i] === ' ') s += ' ';
        else s += GLYPH[(Math.random() * GLYPH.length) | 0];
      }
      el.textContent = s;
      if (p < 1) raf = requestAnimationFrame(tick);
      else el.textContent = finalText;
    });
    return { kill: function () { cancelAnimationFrame(raf); el.textContent = finalText; } };
  };

  /* 数字滚动 */
  U.countUp = function (el, to, dur, fmt) {
    if (U.reduced()) { el.textContent = fmt ? fmt(to) : to; return; }
    var from = 0, t0 = performance.now();
    (function tick(now) {
      var p = U.clamp((now - t0) / (dur || 900), 0, 1);
      var v = from + (to - from) * U.easeOutQuint(p);
      el.textContent = fmt ? fmt(v) : Math.round(v);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  };

  /* -------------------------------------------------- 程序化占位视觉（SVG） */
  /* 素材未到位时生成高级质感的海报/横幅占位图，避免出现裂图或空白 */

  function svgUri(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function verticalTitle(title, x, y0, size, color, max) {
    var chars = String(title).replace(/[《》]/g, '').split('');
    if (chars.length > (max || 14)) chars = chars.slice(0, max || 14);
    var out = '';
    for (var i = 0; i < chars.length; i++) {
      out += '<text x="' + x + '" y="' + (y0 + i * size * 1.16) + '" font-size="' + size +
        '" fill="' + color + '" font-weight="700" text-anchor="middle" ' +
        'font-family="PingFang SC,Microsoft YaHei,Noto Sans SC,sans-serif">' + U.esc(chars[i]) + '</text>';
    }
    return out;
  }

  /**
   * 生成占位 SVG data URI
   * o = { w,h,n,title,acc,acc2,kind,path }
   */
  U.ph = function (o) {
    var w = o.w || 1200, h = o.h || 1600;
    var acc = o.acc || '#22E1FF', acc2 = o.acc2 || '#8B5CF6';
    var n = String(o.n || '00');
    var cid = 'p' + Math.random().toString(36).slice(2, 8);
    var portrait = h > w;
    var mn = Math.min(w, h);
    var pad = Math.round(mn * 0.058);
    var mono = 'Cascadia Mono,SF Mono,Consolas,monospace';
    var sans = 'PingFang SC,Microsoft YaHei,Noto Sans SC,sans-serif';
    var disp = 'Bahnschrift,DIN Alternate,Oswald,sans-serif';
    var title = String(o.title || '').replace(/[《》]/g, '');
    var kind = o.kind || 'KEY ART';
    var path = o.path || ('assets/works/' + n);

    /* ---- 网格与刻度（仪表盘质感） ---- */
    var step = Math.round(mn / (portrait ? 13 : 17));
    var grid = '';
    for (var gx = step; gx < w; gx += step) grid += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + h + '"/>';
    for (var gy = step; gy < h; gy += step) grid += '<line x1="0" y1="' + gy + '" x2="' + w + '" y2="' + gy + '"/>';

    /* ---- 斜向排线周期（用 pattern 实现，比逐线绘制更省） ---- */
    var hs = Math.round(mn * 0.055);

    /* ---- 侧边细刻度 ---- */
    var ticks = '', tickN = portrait ? 24 : 18;
    for (var t = 0; t < tickN; t++) {
      var ty = pad + t * ((h - pad * 2) / (tickN - 1));
      var len = (t % 4 === 0) ? Math.round(mn * 0.024) : Math.round(mn * 0.011);
      ticks += '<line x1="' + pad + '" y1="' + ty + '" x2="' + (pad + len) + '" y2="' + ty + '" opacity="' +
        (t % 4 === 0 ? 0.5 : 0.22) + '"/>';
    }

    /* ---- 波形装饰（暗示声音/信号） ---- */
    function wave(y, amp, len, x0) {
      var d = 'M' + x0 + ' ' + (y + amp * 0.4), px = x0;
      for (var i = 1; i <= len; i++) {
        px = x0 + (i / len) * (portrait ? w - pad * 2 : mn * 0.72);
        d += ' L' + px.toFixed(1) + ' ' + (y + amp * (Math.sin(i * 0.9) * 0.5 + Math.sin(i * 2.7) * 0.5)).toFixed(1);
      }
      return '<path d="' + d + '" fill="none" stroke="' + acc + '" stroke-width="1" opacity="0.28"/>';
    }

    var body = '';

    if (portrait) {
      /* ============================ 竖版海报（3:4） ============================ */
      var numSize = Math.round(mn * 0.17);
      var titleSize = Math.round(mn * 0.072);

      body =
        /* 大序号 */
        '<text x="' + pad + '" y="' + (pad + numSize * 0.84) + '" font-size="' + numSize + '" fill="' + acc +
          '" font-weight="700" font-family="' + disp + '">' + n + '</text>' +
        '<rect x="' + pad + '" y="' + (pad + numSize * 1.02) + '" width="' + Math.round(mn * 0.2) + '" height="3" fill="' + acc + '"/>' +
        '<text x="' + pad + '" y="' + (pad + numSize * 1.02 + Math.round(mn * 0.048)) + '" font-size="' +
          Math.round(mn * 0.0235) + '" fill="#8C99AE" letter-spacing="4" font-family="' + mono + '">' +
          U.esc(kind) + '</text>' +
        /* 竖排标题（右侧） */
        verticalTitle(title, w - pad - titleSize * 0.52, h * 0.255, titleSize, '#F2F6FF', 14) +
        /* 中段波形 */
        wave(h * 0.78, mn * 0.035, 26, pad) +
        /* 右上小标 */
        '<text x="' + (w - pad) + '" y="' + (pad + 14) + '" font-size="' + Math.round(mn * 0.019) + '" fill="' + acc +
          '" text-anchor="end" letter-spacing="3" font-family="' + mono + '">' + w + '×' + h + '</text>';
    } else {
      /* ============================ 横版主视觉（16:9） ============================ */
      var ghost = Math.round(mn * 0.72);
      var tSize = Math.round(mn * 0.072);
      var cy = h * 0.36;

      body =
        /* 幽灵大序号（右中） */
        '<text x="' + (w - pad * 0.6) + '" y="' + (cy + ghost * 0.34) + '" font-size="' + ghost + '" fill="' + acc +
          '" opacity="0.13" text-anchor="end" font-weight="700" font-family="' + disp + '">' + n + '</text>' +
        /* 左侧信息组 */
        '<text x="' + pad + '" y="' + (cy - tSize * 1.55) + '" font-size="' + Math.round(mn * 0.0245) + '" fill="' + acc +
          '" letter-spacing="6" font-family="' + mono + '">' + U.esc(kind) + '</text>' +
        '<rect x="' + pad + '" y="' + (cy - tSize * 1.16) + '" width="' + Math.round(w * 0.055) + '" height="3" fill="' + acc + '"/>' +
        '<text x="' + pad + '" y="' + (cy + tSize * 0.42) + '" font-size="' + tSize + '" fill="#F2F6FF" font-weight="700" ' +
          'font-family="' + sans + '">' + U.esc(title) + '</text>' +
        '<text x="' + pad + '" y="' + (cy + tSize * 1.12) + '" font-size="' + Math.round(mn * 0.0235) +
          '" fill="#8C99AE" letter-spacing="4" font-family="' + mono + '">' + w + ' × ' + h + ' · ' + n + ' / 10</text>' +
        /* 全宽扫描线 */
        '<line x1="0" y1="' + Math.round(h * 0.795) + '" x2="' + w + '" y2="' + Math.round(h * 0.795) +
          '" stroke="url(#sc' + cid + ')" stroke-width="1.5"/>' +
        wave(h * 0.795, mn * 0.045, 26, pad) +
        /* 右上角状态 */
        '<circle cx="' + (w - pad - 4) + '" cy="' + (pad + 10) + '" r="4" fill="' + acc + '"/>' +
        '<text x="' + (w - pad - 18) + '" y="' + (pad + 14) + '" font-size="' + Math.round(mn * 0.019) +
          '" fill="' + acc + '" text-anchor="end" letter-spacing="3" font-family="' + mono + '">PLACEHOLDER</text>';
    }

    /* ---- 胶片齿孔：横版走上/下边缘，竖版走左/右边缘 ---- */
    var perf = '';
    var perfN = Math.max(8, Math.round((portrait ? h : w) / (mn * 0.072)));
    var perfStep = (portrait ? h : w) / perfN;
    var pw = Math.round(mn * 0.0165), ph = Math.round(mn * 0.0105);
    var off = Math.round(pad * 0.36);
    for (var pi = 0; pi < perfN; pi++) {
      var c0 = pi * perfStep + perfStep * 0.5;
      if (portrait) {
        perf += '<rect x="' + (off - pw / 2) + '" y="' + (c0 - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="1.4" opacity="0.32"/>' +
                '<rect x="' + (w - off - pw / 2) + '" y="' + (c0 - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="1.4" opacity="0.32"/>';
      } else {
        perf += '<rect x="' + (c0 - ph / 2) + '" y="' + (off - pw / 2) + '" width="' + ph + '" height="' + pw + '" rx="1.4" opacity="0.32"/>' +
                '<rect x="' + (c0 - ph / 2) + '" y="' + (h - off - pw / 2) + '" width="' + ph + '" height="' + pw + '" rx="1.4" opacity="0.32"/>';
      }
    }

    /* ---- 取景框十字准星 ---- */
    var mx = w / 2, my = h / 2, cl = mn * 0.052, gap = cl * 0.34;
    var cross = '<g stroke="#FFFFFF" stroke-opacity="0.11" stroke-width="1">' +
      '<line x1="' + (mx - cl).toFixed(1) + '" y1="' + my + '" x2="' + (mx - gap).toFixed(1) + '" y2="' + my + '"/>' +
      '<line x1="' + (mx + gap).toFixed(1) + '" y1="' + my + '" x2="' + (mx + cl).toFixed(1) + '" y2="' + my + '"/>' +
      '<line x1="' + mx + '" y1="' + (my - cl).toFixed(1) + '" x2="' + mx + '" y2="' + (my - gap).toFixed(1) + '"/>' +
      '<line x1="' + mx + '" y1="' + (my + gap).toFixed(1) + '" x2="' + mx + '" y2="' + (my + cl).toFixed(1) + '"/>' +
      '<circle cx="' + mx + '" cy="' + my + '" r="' + (cl * 0.14).toFixed(1) + '" fill="none"/>' +
      '</g>';

    /* ---- 组装 ---- */
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        '<defs>' +
          '<linearGradient id="bg' + cid + '" x1="0" y1="0" x2="0.4" y2="1">' +
            '<stop offset="0" stop-color="#0B0F1C"/><stop offset="0.55" stop-color="#070A13"/><stop offset="1" stop-color="#03040A"/>' +
          '</linearGradient>' +
          '<radialGradient id="gl' + cid + '" cx="0.5" cy="1.04" r="0.95">' +
            '<stop offset="0" stop-color="' + acc + '" stop-opacity="0.5"/>' +
            '<stop offset="0.42" stop-color="' + acc2 + '" stop-opacity="0.17"/>' +
            '<stop offset="1" stop-color="' + acc2 + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<radialGradient id="gl2' + cid + '" cx="0.87" cy="0.08" r="0.7">' +
            '<stop offset="0" stop-color="' + acc + '" stop-opacity="0.22"/>' +
            '<stop offset="1" stop-color="' + acc + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<pattern id="gr' + cid + '" width="' + step + '" height="' + step + '" patternUnits="userSpaceOnUse">' +
            '<path d="M' + step + ' 0 L0 0 0 ' + step + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1"/>' +
          '</pattern>' +
          '<pattern id="ht' + cid + '" width="' + hs + '" height="' + hs + '" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">' +
            '<line x1="0" y1="0" x2="0" y2="' + hs + '" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>' +
          '</pattern>' +
          '<linearGradient id="sc' + cid + '" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0" stop-color="' + acc + '" stop-opacity="0"/>' +
            '<stop offset="0.35" stop-color="' + acc + '" stop-opacity="0.85"/>' +
            '<stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.9"/>' +
            '<stop offset="0.65" stop-color="' + acc + '" stop-opacity="0.85"/>' +
            '<stop offset="1" stop-color="' + acc + '" stop-opacity="0"/>' +
          '</linearGradient>' +
          '<linearGradient id="sc2' + cid + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + acc + '" stop-opacity="0.85"/>' +
            '<stop offset="1" stop-color="' + acc + '" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#bg' + cid + ')"/>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#gl' + cid + ')"/>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#gl2' + cid + ')"/>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#gr' + cid + ')"/>' +
        '<rect width="' + w + '" height="' + h + '" fill="url(#ht' + cid + ')"/>' +
        '<g stroke="#FFFFFF" stroke-opacity="0.035">' + grid + '</g>' +
        '<g stroke="' + acc + '" stroke-opacity="0.3" stroke-width="1.6">' + ticks + '</g>' +
        '<g fill="none" stroke="#FFFFFF" stroke-opacity="0.055">' + perf + '</g>' +
        cross +
        '<path d="M' + (w * 0.6) + ' 0 L' + (w * 0.88) + ' 0 L' + (w * 0.36) + ' ' + h + ' L' + (w * 0.08) + ' ' + h +
          ' Z" fill="url(#sc2' + cid + ')" opacity="0.075"/>' +
        '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="none" stroke="#FFFFFF" stroke-opacity="0.07"/>' +
        body +
        /* 右下角而非左下角：左下留给主视觉的时码 HUD，避免两行小字叠在一起 */
        '<text x="' + (w - pad) + '" y="' + (h - pad * 0.42) + '" font-size="' + Math.round(mn * 0.0195) +
          '" fill="#5A677C" letter-spacing="3" text-anchor="end" font-family="' + mono + '">PLACEHOLDER · ' + U.esc(path) + '</text>' +
        corners(pad, w, h, acc) +
      '</svg>';

    return svgUri(svg);
  };

  function corners(p, w, h, acc) {
    var L = Math.round(Math.min(w, h) * 0.038);
    var s = 'stroke="' + acc + '" stroke-opacity="0.75" stroke-width="2" fill="none"';
    return '<path d="M' + p + ' ' + (p + L) + ' V' + p + ' H' + (p + L) + '" ' + s + '/>' +
           '<path d="M' + (w - p - L) + ' ' + p + ' H' + (w - p) + ' V' + (p + L) + '" ' + s + '/>' +
           '<path d="M' + p + ' ' + (h - p - L) + ' V' + (h - p) + ' H' + (p + L) + '" ' + s + '/>' +
           '<path d="M' + (w - p - L) + ' ' + (h - p) + ' H' + (w - p) + ' V' + (h - p - L) + '" ' + s + '/>';
  }

  /* 素材地址登记表：
     _seen    —— 已经有人在加载（<img> 本体 / 预热），别人不必再发一次
     _missing —— 确认不存在，之后一律短路
     _wait    —— 等待同一地址结果的回调，加载结束后统一通知
     没有这张表时，同一张缺失的图会被 render 的探测、预热、<img> 各请求一遍，
     切一次作品就是两三个必然 404 的网络往返。
     注意 ok 与 fail 必须对称通知：封面「探测到真实素材后替换占位图」正是
     走 ok 这条路，只登记 fail 会让真素材永远换不上。 */
  U._seen = {};
  U._missing = {};
  U._wait = {};

  U._notify = function (src, ok) {
    var q = U._wait[src];
    delete U._wait[src];
    if (!q) return;
    var list = ok ? q.ok : q.fail;
    for (var i = 0; i < list.length; i++) list[i]();
  };

  U._markMissing = function (src) { U._missing[src] = 1; U._notify(src, false); };
  U._markLoaded = function (src) { U._notify(src, true); };

  function await_(src, ok, fail) {
    var e = U._wait[src] || (U._wait[src] = { ok: [], fail: [] });
    if (ok) e.ok.push(ok);
    if (fail) e.fail.push(fail);
  }

  /* 给 <img> 绑定兜底：加载失败时挂上程序化占位图；
     并在解码完成前保持透明，避免切作品时先闪一帧空底再「啪」地跳出图。
     过渡由各元素样式表里的 transition 列表负责（都已含 opacity），
     JS 只切内联值 —— 这里若用 getComputedStyle 读原有过渡链，会在插图的
     那一刻强制同步样式重算，切作品一次就是七次，反而制造抖动。 */
  U.img = function (node, src, phOpts) {
    var settled = false;
    var show = function () {
      if (settled) return;
      settled = true;
      node.style.opacity = '1';
    };
    node.style.opacity = '0';

    /* 已知不存在的地址直接走占位图：切回这部作品时不再白跑一次网络往返 */
    if (U._missing[src]) {
      node.src = U.ph(phOpts || {});
      show();
      return node;
    }
    U._seen[src] = 1;

    node.addEventListener('error', function onerr() {
      node.removeEventListener('error', onerr);
      U._markMissing(src);
      node.src = U.ph(phOpts || {});
    });
    node.addEventListener('load', function () { show(); U._markLoaded(src); });
    node.src = src;
    /* 命中缓存时 load 可能已经错过，用 complete 兜底；
       再留一个硬兜底，任何异常都不会让图永久隐形。 */
    if (node.complete && node.naturalWidth) { show(); U._markLoaded(src); }
    setTimeout(show, 1400);
    return node;
  };

  /* 探测素材是否真实存在（用于决定是否显示「待替换」提示、
     以及「真素材到位后替换占位图」）。已有人加载时不重复发请求，
     改为登记回调，等实际结果回来再通知。 */
  U.probe = function (src, ok, fail) {
    if (U._missing[src]) { fail && fail(); return; }
    if (U._seen[src]) { await_(src, ok, fail); return; }
    U._seen[src] = 1;
    var i = new Image();
    i.onload = function () { U._markLoaded(src); ok && ok(); };
    i.onerror = function () { U._markMissing(src); fail && fail(); };
    i.src = src;
  };

  /* 预热：在轮盘转到某部作品时就把它的主视觉解码好，
     提交时换图即为瞬时，不会出现「先空后满」。 */
  U.preload = function (src) {
    if (!src || U._missing[src] || U._seen[src]) return;
    U._seen[src] = 1;
    var i = new Image();
    i.decoding = 'async';
    i.onload = function () { U._markLoaded(src); };
    i.onerror = function () { U._markMissing(src); };
    i.src = src;
    if (i.decode) i.decode().catch(function () {});
  };

  WB.U = U;

})(window.WB = window.WB || {});
