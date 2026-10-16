/* ============================================================================
   gl.js — 自定义 WebGL 背景（能量流场）
   零 3D 库依赖：手写全屏 quad + 片元着色器
   特性：fbm 域扭曲流场 / 指针扰动 / 双强调色 / 网格干涉 / 扫描条 / 暗角 / 颗粒
   性能：分辨率封顶、隐藏时暂停、帧率无关、上下文丢失兜底
   ========================================================================= */

(function (WB) {
  'use strict';

  var U = WB.U;

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform vec2  uPtr;',
    'uniform vec3  uAcc;',
    'uniform vec3  uAcc2;',
    'uniform float uEnergy;',
    'uniform float uEnter;',
    'uniform float uScroll;',
    '',
    /* 无 sin 哈希（Dave Hoskins 式）：原来每次 hash 都算一个 sin，
       而每条 fbm 要调用 4 次 hash × 4 个八度 × 5 条 fbm ≈ 每像素 80 次三角函数。
       这是整站最重的一处计算，换成纯乘加后成本降到零头。 */
    'float hash(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    '',
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    '',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.52;',
    '  mat2 m = mat2(1.62, 1.18, -1.18, 1.62);',
    '  for (int i = 0; i < 3; i++){',
    '    v += a * noise(p);',
    '    p = m * p;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'void main(){',
    '  vec2 res = uRes;',
    '  float mn = min(res.x, res.y);',
    '  vec2 uv  = gl_FragCoord.xy / res;',
    '  vec2 p   = (gl_FragCoord.xy - 0.5 * res) / mn;',
    '  vec2 asp = res / mn;',
    '',
    '  vec2 ptr = (uPtr - 0.5) * asp;',
    '  vec2 dv  = p - ptr;',
    '  float pd = length(dv);',
    '  float pw = smoothstep(0.62, 0.0, pd);',
    '',
    '  float t = uTime * 0.052;',
    '',
    '  vec2 q = p * 1.12;',
    '  q.y += uScroll * 0.34;',
    '  q += 0.20 * vec2(fbm(q * 1.28 + t), fbm(q * 1.28 - t + 5.21));',
    '  q += 0.34 * pw * (dv / (pd + 0.06));',
    '',
    '  float f1 = fbm(q * 1.02 + vec2(t * 0.72, -t * 0.44));',
    '  float f2 = fbm(q * 2.05 - vec2(t * 0.34, t * 0.58) + f1 * 0.85);',
    '  float f3 = fbm(q * 0.60 + vec2(-t * 0.22, t * 0.17));',
    '',
    '  float band = smoothstep(0.32, 0.94, f1 * 0.62 + f3 * 0.56);',
    '  float fila = smoothstep(0.58, 1.0, f2);',
    '  float glowA = smoothstep(1.20, 0.04, length(p - vec2(-0.44, 0.30)));',
    '  float glowB = smoothstep(1.30, 0.04, length(p - vec2(0.54, -0.34)));',
    '',
    '  vec3 col = vec3(0.011, 0.013, 0.021);',
    '  float eg = 0.86 + uEnergy * 0.85;',
    '  col += uAcc  * band * (0.40 + 0.50 * glowB) * eg;',
    '  col += uAcc2 * f3   * (0.32 + 0.54 * glowA) * eg;',
    '  col += uAcc  * fila * 0.26;',
    '  col += vec3(1.0) * pow(max(f2, 0.0), 7.0) * 0.115;',
    '',
    '  vec2 g = abs(fract(p * 8.4 + vec2(t * 0.05, 0.0)) - 0.5);',
    '  float grid = smoothstep(0.492, 0.5, max(g.x, g.y));',
    '  col += uAcc * grid * (0.024 + uEnergy * 0.03);',
    '',
    '  col += uAcc * pw * 0.085;',
    '',
    '  float sb = fract(uv.y - uTime * 0.017);',
    '  col += uAcc * smoothstep(0.986, 1.0, sb) * 0.075;',
    '',
    '  float vig = smoothstep(1.62, 0.26, length(p * vec2(1.0, 1.14)));',
    '  col *= mix(0.30, 1.0, vig);',
    '',
    '  float gr = hash(gl_FragCoord.xy + fract(uTime * 0.7) * 137.0) - 0.5;',
    '  col += gr * 0.026;',
    '',
    '  col = max(col, vec3(0.0));',
    '  col *= uEnter;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[gl] shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function GL(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.hidden = false;
    this.enter = 0;
    this.energy = 0;
    this.energyTarget = 0;
    this.scroll = 0;
    this.ptr = [0.5, 0.5];
    this.ptrTarget = [0.5, 0.5];
    this.acc = [0.13, 0.88, 1.0];
    this.accTarget = [0.13, 0.88, 1.0];
    this.acc2 = [0.55, 0.36, 0.96];
    this.acc2Target = this.acc2.slice();
    this.lastFrame = 0;
    this.started = false;
    this.frozen = false;
    this._froze = false;
    this._init();
  }

  GL.prototype._init = function () {
    var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false };
    var gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) { this.fail(); return; }
    this.gl = gl;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { this.fail(); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[gl] link error:', gl.getProgramInfoLog(prog));
      this.fail();
      return;
    }
    gl.useProgram(prog);
    this.prog = prog;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      ptr: gl.getUniformLocation(prog, 'uPtr'),
      acc: gl.getUniformLocation(prog, 'uAcc'),
      acc2: gl.getUniformLocation(prog, 'uAcc2'),
      energy: gl.getUniformLocation(prog, 'uEnergy'),
      enter: gl.getUniformLocation(prog, 'uEnter'),
      scroll: gl.getUniformLocation(prog, 'uScroll')
    };

    gl.clearColor(0.011, 0.013, 0.021, 1);
    this.ok = true;

    var self = this;
    this.canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.ok = false;
      document.getElementById('app').classList.add('no-gl');
    }, false);

    this.resize();
    this.loop();
  };

  GL.prototype.fail = function () {
    this.ok = false;
    var app = document.getElementById('app');
    if (app) app.classList.add('no-gl');
  };

  /* 目标值（由外部驱动，内部做阻尼跟随，避免硬切） */
  GL.prototype.setAccent = function (hex, hex2) {
    this.accTarget = U.hex2rgb(hex).map(function (v) { return v / 255; });
    if (hex2) this.acc2Target = U.hex2rgb(hex2).map(function (v) { return v / 255; });
  };
  GL.prototype.setPointer = function (x, y) { this.ptrTarget[0] = x; this.ptrTarget[1] = y; };
  GL.prototype.pulse = function (v) { this.energyTarget = Math.max(this.energyTarget, v || 1); };
  GL.prototype.setScroll = function (p) { this.scroll = p; };

  GL.prototype.resize = function () {
    if (!this.ok) return;
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    /* 背景是低频柔和的流场 + 颗粒，1x 采样已足够；
       高 DPR 下多出来的像素对观感几乎没有贡献，却成倍放大着色器开销。 */
    var dpr = Math.min(window.devicePixelRatio || 1, 1);
    var scale = dpr;
    var maxPx = 1500 * 900;
    if (w * h * scale * scale > maxPx) scale = Math.sqrt(maxPx / (w * h));
    this.w = Math.max(1, Math.round(w * scale));
    this.h = Math.max(1, Math.round(h * scale));
    if (this.canvas.width !== this.w || this.canvas.height !== this.h) {
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.gl.viewport(0, 0, this.w, this.h);
      /* 尺寸变了，静态帧需要按新尺寸重画一次 */
      this._froze = false;
      this.lastFrame = 0;
    }
  };

  GL.prototype.loop = function () {
    var self = this;
    var gl = this.gl;

    /* 背景漂移速度约 0.05 rad/s，是极低频的运动：30fps 与 120fps 在观感上无法区分，
       但渲染开销与功耗直接降到 1/4。 */
    var MIN_STEP = 1 / 30;

    function draw(now, dt) {
      var k = U.damp(dt, 0.075);
      self.enter += (1 - self.enter) * U.damp(dt, 0.05);
      self.energy += (self.energyTarget - self.energy) * U.damp(dt, 0.06);
      self.energyTarget *= (1 - U.damp(dt, 0.03));
      for (var i = 0; i < 3; i++) {
        self.acc[i] += (self.accTarget[i] - self.acc[i]) * U.damp(dt, 0.06);
        self.acc2[i] += (self.acc2Target[i] - self.acc2[i]) * U.damp(dt, 0.06);
      }
      self.ptr[0] += (self.ptrTarget[0] - self.ptr[0]) * k;
      self.ptr[1] += (self.ptrTarget[1] - self.ptr[1]) * k;

      gl.uniform2f(self.u.res, self.w, self.h);
      gl.uniform1f(self.u.time, now / 1000);
      gl.uniform2f(self.u.ptr, self.ptr[0], self.ptr[1]);
      gl.uniform3f(self.u.acc, self.acc[0], self.acc[1], self.acc[2]);
      gl.uniform3f(self.u.acc2, self.acc2[0], self.acc2[1], self.acc2[2]);
      gl.uniform1f(self.u.energy, self.energy);
      gl.uniform1f(self.u.enter, self.enter);
      gl.uniform1f(self.u.scroll, self.scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!self.ok || self.hidden) { self.lastFrame = 0; return; }

      /* 减少动效：画一帧静态底纹后彻底停手，不再占用 GPU。
         仍然保留这一帧，因为它是页面的底色，比纯色更能撑住调性。 */
      var red = U.reduced();
      if (red !== self.frozen) {
        self.frozen = red;
        self._froze = false;
        self.lastFrame = 0;
      }
      if (self.frozen) {
        if (self._froze) return;
        self._froze = true;
        self.enter = 1;
        self.acc = self.accTarget.slice();
        self.acc2 = self.acc2Target.slice();
        draw(0, 0.016);
        return;
      }

      var last = self.lastFrame;
      if (last && (now - last) / 1000 < MIN_STEP) return;
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      self.lastFrame = now;
      draw(now, dt);
    }
    requestAnimationFrame(frame);

    document.addEventListener('visibilitychange', function () {
      self.hidden = document.hidden;
      if (!self.hidden) self.lastFrame = 0;
    });
  };

  WB.GL = GL;

})(window.WB = window.WB || {});
