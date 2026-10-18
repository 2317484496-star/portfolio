/* ============================================================================
   wheel.js — 右侧轮盘导航引擎
   ----------------------------------------------------------------------------
   几何：10 段环形分段（各 36°），活动段固定停在 12 点方向的指针下
   旋转：拖拽跟手 → 松手惯性衰减 → 吸附对齐
   预览：旋转全程派生「候选作品」并实时刷新读数（不提交）
   提交：自由旋转停稳后 420ms 自动确认；点击分段 / Enter 则短延时立即确认
   备份：滚轮、方向键、数字键、移动端竖向列表；dial 本身是 role="slider"
   ========================================================================= */

(function (WB) {
  'use strict';

  var U = WB.U;

  var VB = 400, C = VB / 2;
  var R_OUT = 168, R_IN = 104, R_LAB = 136;
  var R_BEZEL = 172, R_BEZEL_OUT = 186;
  var GAP = 2.8;
  var COMMIT_AUTO = 240;
  var COMMIT_EXPLICIT = 90;

  /* 吸附速率：显式选择（点击/键位/深链）走 FAST 尽快到位，自由旋转停稳走 NORMAL */
  var SNAP_FAST = 0.42;
  var SNAP_NORMAL = 0.22;
  var SNAP_EPS = 0.08;
  var VEL_CUTOFF = 12;

  function pt(r, a) { return [C + r * Math.cos(U.rad(a)), C + r * Math.sin(U.rad(a))]; }

  function sectorPath(rIn, rOut, a0, a1) {
    var p0 = pt(rOut, a0), p1 = pt(rOut, a1), p2 = pt(rIn, a1), p3 = pt(rIn, a0);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      ' L' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) +
      ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + ' Z';
  }

  function arcPath(r, a0, a1) {
    var p0 = pt(r, a0), p1 = pt(r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ======================================================================= */

  function Wheel(root, works, opts) {
    this.root = root;
    this.works = works;
    this.opts = opts || {};
    this.n = works.length;
    this.step = 360 / this.n;

    this.rot = 0;
    this.vel = 0;
    this.dragging = false;
    this.pointerId = null;
    this.angPrev = 0;
    this.moved = 0;
    this.downAt = 0;

    this.index = 0;
    this.targetIndex = null;
    this.hoverIndex = -1;
    this.settledFlag = true;
    this._painted = -1;
    this._committed = -1;
    this._commitMode = 'auto';
    this._timer = 0;
    this._snapFast = 0;
    this._samples = [];

    this.dial = root.querySelector('.dial');
    this.svg = root.querySelector('.dial__svg');
    this.hub = root.querySelector('.dial__hub');
    this.hubMedia = root.querySelector('.dial__hub-media');
    this.hubNum = root.querySelector('.dial__num span');
    this.hubGenre = root.querySelector('.dial__genre');
    this.readNum = root.querySelector('.dial-readout__idx');
    this.readTitle = root.querySelector('.dial-readout__title');
    this.readType = root.querySelector('.dial-readout__type');
    this.barDots = [];
    /* 注意：移动端 FAB 位于 .rail 之外（为避免被 .shell 的滤镜影响），需从文档级查询 */
    this.fab = document.querySelector('.rail__fab');
    this.fabRing = this.fab && this.fab.querySelector('.fg');
    this.fabNum = this.fab && this.fab.querySelector('.rail__fab-n span');
    this.fabTitle = this.fab && this.fab.querySelector('.rail__fab-t b');
    this.mobList = root.querySelector('.mob-list');

    this._build();
    this._bind();
    this.rot = this.snapTo(0, 0);
    this.index = 0;
    this._render();
    this._loop();
  }

  /* 段 i 的自然中角转到 12 点所需的环旋转量（归一化 [0,360)） */
  Wheel.prototype.baseTarget = function (i) { return U.mod(-90 - (i * this.step + this.step / 2), 360); };

  Wheel.prototype.nearestIndex = function (rot) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < this.n; i++) {
      var d = Math.abs(U.angDelta(rot, this.baseTarget(i)));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  Wheel.prototype.snapTo = function (rot, i) { return rot + U.angDelta(rot, this.baseTarget(i)); };

  /* ------------------------------------------------------------------ 构建 */
  Wheel.prototype._build = function () {
    var i, s;

    /* 静态外圈刻度（仪表盘质感，不随环旋转） */
    var ticks = svgEl('g', { 'class': 'dial__ticks' });
    for (s = 0; s < 60; s++) {
      var a = s * 6, major = s % 5 === 0;
      var p0 = pt(R_BEZEL, a), p1 = pt(major ? R_BEZEL_OUT : R_BEZEL + 7, a);
      ticks.appendChild(svgEl('line', {
        x1: p0[0].toFixed(2), y1: p0[1].toFixed(2),
        x2: p1[0].toFixed(2), y2: p1[1].toFixed(2),
        'class': major ? 'is-major' : ''
      }));
    }
    this.svg.appendChild(ticks);

    /* 旋转组 */
    var rotG = svgEl('g', { 'class': 'dial__rot' });
    this.svgRot = rotG;
    this.segs = [];

    for (i = 0; i < this.n; i++) {
      var wk = this.works[i];
      var a0 = i * this.step + GAP / 2;
      var a1 = (i + 1) * this.step - GAP / 2;
      var mid = i * this.step + this.step / 2;

      var g = svgEl('g', { 'class': 'seg', 'data-i': i });
      g.appendChild(svgEl('path', {
        'class': 'seg__glow', d: sectorPath(R_IN - 2, R_OUT + 4, a0, a1), fill: wk.accent
      }));
      g.appendChild(svgEl('path', { 'class': 'seg__body', d: sectorPath(R_IN, R_OUT, a0, a1) }));
      g.appendChild(svgEl('path', {
        'class': 'seg__body seg__body--acc', d: arcPath(R_OUT - 3.5, a0, a1),
        fill: 'none', stroke: wk.accent, 'stroke-width': 2.4, 'stroke-linecap': 'round'
      }));
      g.appendChild(svgEl('line', {
        'class': 'seg__tick',
        x1: pt(R_IN + 6, mid)[0].toFixed(2), y1: pt(R_IN + 6, mid)[1].toFixed(2),
        x2: pt(R_IN + 16, mid)[0].toFixed(2), y2: pt(R_IN + 16, mid)[1].toFixed(2)
      }));

      var lp = pt(R_LAB, mid);
      var txt = svgEl('text', {
        'class': 'seg__idx', x: 0, y: 0,
        transform: 'translate(' + lp[0].toFixed(2) + ',' + lp[1].toFixed(2) + ') rotate(' + (mid + 90).toFixed(2) + ')'
      });
      txt.textContent = wk.n;
      g.appendChild(txt);

      /* 命中区加宽 */
      g.appendChild(svgEl('path', {
        'class': 'seg__hit', d: sectorPath(R_IN - 8, R_OUT + 8, a0, a1), 'data-i': i
      }));

      rotG.appendChild(g);
      this.segs.push({ g: g, txt: txt });
    }
    this.svg.appendChild(rotG);

    /* 提交进度环 */
    var cg = svgEl('g', { 'class': 'dial__commit' });
    this.commitCircle = svgEl('circle', {
      cx: C, cy: C, r: 194, pathLength: 1,
      'stroke-dasharray': 1, 'stroke-dashoffset': 1, 'stroke-linecap': 'round'
    });
    cg.appendChild(this.commitCircle);
    this.svg.appendChild(cg);
    this.commitGroup = cg;

    /* 读数条 10 个点 */
    var bar = this.root.querySelector('.dial-readout__bar');
    if (bar) {
      for (i = 0; i < this.n; i++) {
        var d = document.createElement('b');
        bar.appendChild(d);
        this.barDots.push(d);
      }
    }

    /* 移动端竖向列表 */
    if (this.mobList) {
      for (i = 0; i < this.n; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-i', i);
        btn.innerHTML = '<span class="mob-list__n">' + U.esc(this.works[i].n) + '</span>' +
          '<span class="mob-list__t">' + U.esc(this.works[i].title) + '</span>' +
          '<span class="mob-list__g">' + U.esc(this.works[i].group) + '</span>';
        this.mobList.appendChild(btn);
      }
    }

    /* FAB 进度环 */
    if (this.fabRing) {
      var r = 13, len = 2 * Math.PI * r;
      this.fabRing.setAttribute('r', r);
      this.fabRing.setAttribute('stroke-dasharray', len.toFixed(2));
      this.fabRing.setAttribute('stroke-dashoffset', len.toFixed(2));
      this.fabLen = len;
    }

    this.tickerItems = U.$$('.ticker__i');
  };

  /* ------------------------------------------------------------------ 事件 */
  Wheel.prototype._bind = function () {
    var self = this;
    var dial = this.dial;

    function toLocal(ev) {
      var r = dial.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) / r.width * VB,
        y: (ev.clientY - r.top) / r.height * VB
      };
    }
    function angOf(p) { return U.deg(Math.atan2(p.y - C, p.x - C)); }

    dial.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button > 0) return;
      self.dragging = true;
      self.moved = 0;
      self.pxMoved = 0;
      self.downAt = performance.now();
      self.pointerId = ev.pointerId;
      self.angPrev = angOf(toLocal(ev));
      self.downP = toLocal(ev);
      self.samples = [{ t: performance.now(), a: self.angPrev }];
      self.vel = 0;
      self.targetIndex = null;
      self._snapFast = 0;
      self._cancelCommit();
      try { dial.setPointerCapture(ev.pointerId); } catch (e) {}
      dial.classList.add('is-drag');
      document.body.classList.add('is-dragging');
      if (self.opts.onDragStart) self.opts.onDragStart();
      ev.preventDefault();
    });

    dial.addEventListener('pointermove', function (ev) {
      if (!self.dragging || ev.pointerId !== self.pointerId) return;
      var p = toLocal(ev);
      var a = angOf(p);
      var d = U.angDelta(self.angPrev, a);
      self.rot += d;
      self.moved += Math.abs(d) * 2.2;
      /* 像素位移单独记一份：半径很小的地方角度变化几乎为 0，
         用它判断「这是点击还是拖拽」更可靠 */
      var pb = toLocal(ev);
      if (self.downP) {
        self.pxMoved = Math.sqrt((pb.x - self.downP.x) * (pb.x - self.downP.x) +
          (pb.y - self.downP.y) * (pb.y - self.downP.y));
      }
      self.angPrev = a;
      var now = performance.now();
      self.samples.push({ t: now, a: a });
      if (self.samples.length > 8) self.samples.shift();
      self._normalize();
      ev.preventDefault();
    });

    function endDrag(ev) {
      if (!self.dragging) return;
      if (ev && ev.pointerId !== undefined && ev.pointerId !== self.pointerId) return;
      var cancelled = ev && ev.type === 'pointercancel';
      var isTap = !cancelled && self.pxMoved < 10 && (performance.now() - self.downAt) < 700;

      self.dragging = false;
      try { dial.releasePointerCapture(self.pointerId); } catch (e) {}
      dial.classList.remove('is-drag');
      document.body.classList.remove('is-dragging');
      self.pointerId = null;
      var n = self.samples.length;
      if (n >= 2) {
        var dt = (self.samples[n - 1].t - self.samples[n - 2].t) / 1000;
        if (dt > 0.004) {
          var dd = U.angDelta(self.samples[n - 2].a, self.samples[n - 1].a);
          self.vel = U.clamp(dd / dt, -1500, 1500);
        }
      }
      self.samples = [];

      /* 轻点 = 直接切到点中的那一段，不必先拖动再吸附。
         按「指针相对圆心的角度」反查分段，所以整圈（含序号、发光边、
         刻度）都是热区，不必精确命中那条几像素宽的弧。 */
      if (isTap && ev && ev.clientX !== undefined) {
        var p = toLocal(ev);
        var dx = p.x - C, dy = p.y - C;
        var rr = Math.sqrt(dx * dx + dy * dy);
        if (self.downP) {
          var ddx = p.x - self.downP.x, ddy = p.y - self.downP.y;
          if (Math.sqrt(ddx * ddx + ddy * ddy) > 10) isTap = false;
        }
        if (isTap) {
          if (rr < R_IN - 6) {
            /* 中心盘：确认当前候选项 */
            self.select(self.nearestIndex(self.rot), true);
          } else if (rr <= R_OUT + 30) {
            var local = U.mod(U.deg(Math.atan2(dy, dx)) - self.rot, 360);
            var idx = Math.floor(local / self.step) % self.n;
            self.select(idx, true);
          }
        }
      }
    }
    dial.addEventListener('pointerup', endDrag);
    dial.addEventListener('pointercancel', endDrag);

    /* 轻点判定已经放在 endDrag 里（按角度反查分段，整圈都是热区），
       这里不再单独监听 click —— 否则同一次点击会被提交两次。 */

    /* 悬停预览卡 */
    dial.addEventListener('pointerover', function (ev) {
      if (self.dragging) return;
      var seg = ev.target.closest && ev.target.closest('.seg');
      if (!seg) return;
      var i = parseInt(seg.getAttribute('data-i'), 10);
      if (i === self.hoverIndex) return;
      self.hoverIndex = i;
      if (self.opts.onHover) self.opts.onHover(i, self.works[i], ev);
    });
    dial.addEventListener('pointermove', function (ev) {
      if (self.hoverIndex < 0) return;
      if (self.opts.onHoverMove) self.opts.onHoverMove(ev);
    });
    dial.addEventListener('pointerleave', function () {
      if (self.hoverIndex < 0) return;
      self.hoverIndex = -1;
      if (self.opts.onHoverEnd) self.opts.onHoverEnd();
    });

    /* 滚轮不再驱动轮盘：页面滚动与「切作品」是两件事，
       混在一起时只是把鼠标移过右侧就会误切。切换只走点击 / 拖拽 / 键盘。 */

    /* 键盘 */
    dial.addEventListener('keydown', function (ev) {
      var k = ev.key, handled = true;
      if (k === 'ArrowDown' || k === 'ArrowRight') self.stepBy(1);
      else if (k === 'ArrowUp' || k === 'ArrowLeft') self.stepBy(-1);
      else if (k === 'Enter' || k === ' ' || k === 'Spacebar') self.select(self.targetIndex != null ? self.targetIndex : self.nearestIndex(self.rot), true);
      else if (k === 'Home') self.select(0, true);
      else if (k === 'End') self.select(self.n - 1, true);
      else if (/^[0-9]$/.test(k)) {
        var i2 = k === '0' ? 9 : parseInt(k, 10) - 1;
        if (i2 < self.n) self.select(i2, true); else handled = false;
      } else handled = false;
      if (handled) { ev.preventDefault(); ev.stopPropagation(); }
    });

    /* 移动端列表 / FAB / 关闭 */
    if (this.mobList) {
      this.mobList.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-i]');
        if (!b) return;
        self.select(parseInt(b.getAttribute('data-i'), 10), true, true);
        if (self.opts.onMobilePick) setTimeout(self.opts.onMobilePick, 220);
      });
    }
    if (this.fab && this.opts.onFab) this.fab.addEventListener('click', this.opts.onFab);
    var closeBtn = this.root.querySelector('.rail__close');
    if (closeBtn && this.opts.onMobilePick) closeBtn.addEventListener('click', this.opts.onMobilePick);
  };

  Wheel.prototype._normalize = function () {
    if (this.rot > 900) this.rot -= 360;
    if (this.rot < -900) this.rot += 360;
  };

  /* ------------------------------------------------------------------ 选择 */
  Wheel.prototype.stepBy = function (dir, commit) {
    var base = this.targetIndex != null ? this.targetIndex : this.nearestIndex(this.rot);
    this.select(U.mod(base + dir, this.n), !!commit);
  };

  Wheel.prototype.select = function (i, commit) {
    i = U.clamp(i | 0, 0, this.n - 1);
    this.vel = 0;
    this.targetIndex = i;
    this._snapFast = 1;
    this._cancelCommit();
    this.commitOnArrive = !!commit;
    if (commit) this._commitMode = 'explicit';
    else this._commitMode = 'auto';
  };

  /* 外部驱动的直接定位（初始化 / 深链） */
  Wheel.prototype.setIndex = function (i, silent) {
    i = U.clamp(i | 0, 0, this.n - 1);
    this.rot = this.snapTo(this.rot, i);
    this.index = i;
    this.targetIndex = null;
    this.vel = 0;
    this.commitOnArrive = false;
    this._render();
    this.markCommitted(i);
    if (!silent && this.opts.onChange) this.opts.onChange(i, this.works[i]);
    return i;
  };

  Wheel.prototype._cancelCommit = function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
    if (this.commitGroup) this.commitGroup.classList.remove('is-run');
    if (this.commitCircle) {
      this.commitCircle.style.transition = 'none';
      this.commitCircle.setAttribute('stroke-dashoffset', 1);
    }
  };

  Wheel.prototype._startCommit = function (delay) {
    var self = this;
    this._cancelCommit();
    var c = this.commitCircle;
    if (c && !U.reduced()) {
      void c.getBoundingClientRect();
      if (this.commitGroup) this.commitGroup.classList.add('is-run');
      c.style.transition = 'stroke-dashoffset ' + delay + 'ms linear';
      c.setAttribute('stroke-dashoffset', 0);
    }
    this._timer = setTimeout(function () {
      self._timer = 0;
      self._cancelCommit();
      self._committed = self.index;
      if (self.opts.onChange) self.opts.onChange(self.index, self.works[self.index]);
    }, delay);
  };

  Wheel.prototype.markCommitted = function (i) {
    this._committed = (i == null ? this.index : i);
    this._cancelCommit();
  };

  /* ------------------------------------------------------------------ 渲染 */
  Wheel.prototype._render = function () {
    this.svgRot.setAttribute('transform', 'rotate(' + this.rot.toFixed(3) + ' ' + C + ' ' + C + ')');

    for (var s = 0; s < this.n; s++) {
      var g = this.segs[s].g;
      var on = s === this.index;
      if (g.classList.contains('is-on') !== on) g.classList.toggle('is-on', on);
      var near = !on && Math.abs(U.angDelta(this.rot, this.baseTarget(s))) < this.step;
      if (g.classList.contains('is-near') !== near) g.classList.toggle('is-near', near);
    }
    if (this._painted !== this.index) this._paint();
  };

  Wheel.prototype._paint = function () {
    var w = this.works[this.index];
    if (!w) return;
    this._painted = this.index;

    if (this.hubNum) this.hubNum.textContent = w.n;
    if (this.hubGenre) this.hubGenre.textContent = w.group;
    if (this.hubMedia) {
      var self = this;
      var idx = this.index;
      var hb = this.hubMedia;
      /* 先挂占位（同步、零请求），真实封面按需解析到位后再替换。
         轮盘中枢是一枚 180px 的小圆，不需要为它下整张封面 ——
         U.coverBg 优先解析 450px 的半尺寸 webp。 */
      hb.style.backgroundImage = 'url("' + (w._cover || w.media.cover) + '")';
      U.coverBg(w, function (url) {
        if (!url || self.index !== idx) return;
        hb.style.backgroundImage = 'url("' + url + '")';
      });
    }
    if (this.readNum) this.readNum.textContent = w.n + ' / ' + ('0' + this.n).slice(-2);
    if (this.readTitle) this.readTitle.textContent = w.title;
    if (this.readType) this.readType.textContent = w.typeLabel;

    for (var b = 0; b < this.barDots.length; b++) this.barDots[b].classList.toggle('is-on', b === this.index);

    if (this.mobList) {
      var btns = this.mobList.children;
      for (var m = 0; m < btns.length; m++) btns[m].classList.toggle('is-on', m === this.index);
    }
    if (this.fabNum) this.fabNum.textContent = w.n;
    if (this.fabTitle) this.fabTitle.textContent = w.title;
    if (this.fabRing && this.fabLen) {
      var p = this.n > 1 ? this.index / (this.n - 1) : 1;
      this.fabRing.setAttribute('stroke-dashoffset', (this.fabLen * (1 - p * 0.9999)).toFixed(2));
    }
    for (var q = 0; q < this.tickerItems.length; q++) {
      this.tickerItems[q].classList.toggle('is-on', +this.tickerItems[q].getAttribute('data-i') === this.index);
    }
    if (this.dial) {
      this.dial.setAttribute('aria-valuenow', this.index + 1);
      this.dial.setAttribute('aria-valuetext', w.n + ' ' + w.title);
    }
  };

  /* ------------------------------------------------------------------ 主循环 */
  Wheel.prototype._loop = function () {
    var self = this;

    this._stop = U.raf(function (dt) {
      if (self.dragging) { self._render(); return; }

      /* 空闲短路：既没在拖、也没速度、也没吸附余量时，什么都不用画。
         以前这里每帧无条件 _render()（写 SVG transform + 遍历分段 classList），
         静止时也在空转，是长页面滚动发涩的主要来源之一。 */
      if (self.vel === 0 && self.targetIndex == null) {
        var home = self.nearestIndex(self.rot);
        if (Math.abs(self.snapTo(self.rot, home) - self.rot) < SNAP_EPS) {
          if (!self.settledFlag) self._idleTick();
          return;
        }
      }

      /* 惯性 */
      if (self.vel !== 0) {
        self.rot += self.vel * dt;
        self.vel *= Math.pow(0.916, dt * 60);
        if (Math.abs(self.vel) < VEL_CUTOFF) self.vel = 0;
        self._normalize();
      }

      if (self.vel !== 0) {
        self.targetIndex = null;
        self.settledFlag = false;
      } else {
        var T = self.targetIndex != null ? self.targetIndex : self.nearestIndex(self.rot);
        var snap = self.snapTo(self.rot, T);
        var d = snap - self.rot;
        if (Math.abs(d) < SNAP_EPS) {
          self.rot = snap;
          if (self._snapFast) self._snapFast = 0;
          /* 到达目标后才清 targetIndex，这样 _snapFast 能一路保持到停稳 */
          self.targetIndex = null;
          if (!self.settledFlag) {
            self.settledFlag = true;
            /* 停稳：需要则触发提交 */
            if (self.index !== self._committed) {
              var delay = self.commitOnArrive ? COMMIT_EXPLICIT : COMMIT_AUTO;
              self.commitOnArrive = false;
              self._startCommit(delay);
            }
          }
        } else {
          self.settledFlag = false;
          self.rot += d * U.damp(dt, self._snapFast ? SNAP_FAST : SNAP_NORMAL);
        }
      }

      self._render();

      /* 候选变更 → 实时预览（不提交）。
         只有「自由旋转」（没有指定目标）才算用户改了主意，才清掉
         「到位即提交」的意图；否则显式选中隔了三段的作品时，旋转途中
         扫过中间分段就会把意图抹掉，跳转退化成自动提交。 */
      var cand = self.nearestIndex(self.rot);
      if (cand !== self.index) {
        self.index = cand;
        self._render();
        if (self.opts.onPreview) self.opts.onPreview(cand, self.works[cand]);
        if (self.targetIndex == null) {
          self._cancelCommit();
          self.commitOnArrive = false;
          self._commitMode = 'auto';
        }
      }
    });
  };

  /* 停稳后的收尾（从空闲短路里调用，保证 settledFlag 的状态机会走完） */
  Wheel.prototype._idleTick = function () {
    this.settledFlag = true;
    if (this.index !== this._committed) {
      var delay = this.commitOnArrive ? COMMIT_EXPLICIT : COMMIT_AUTO;
      this.commitOnArrive = false;
      this._startCommit(delay);
    }
  };

  Wheel.prototype.destroy = function () { if (this._stop) this._stop(); };

  WB.Wheel = Wheel;

})(window.WB = window.WB || {});
