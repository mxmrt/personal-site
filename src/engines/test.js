/* smoke-test ride for the runtime (not shipped): WebGL stripes that speed up with t and the boost */
window.MM_ENGINES['test'] = function (rt) {
  'use strict';
  let gl = null, prog = null, uT = null, uB = null, uL = null, uR = null;
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = 'precision mediump float;uniform float t,b,l;uniform vec2 r;void main(){vec2 u=gl_FragCoord.xy/r;float s=sin((u.x+l*.2)*40.+t*(6.+b*20.));gl_FragColor=vec4(.02+.3*u.y,.04+.2*s*s,.12+.3*(1.-u.y),1.);}';
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  return {
    id: 'test', title: 'Test Ride', caption: 'A smoke test for the shared runtime.',
    DURATION: 8, T_STILL: 3, hintAt: 4, Q: { pr: rt.PHONE ? 1.5 : 2 },
    initGL() {
      gl = rt.cv.getContext('webgl', { antialias: false, premultipliedAlpha: false });
      if (!gl) return false;
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      uT = gl.getUniformLocation(prog, 't'); uB = gl.getUniformLocation(prog, 'b'); uL = gl.getUniformLocation(prog, 'l'); uR = gl.getUniformLocation(prog, 'r');
      return true;
    },
    draw(t, live) {
      gl.viewport(0, 0, rt.cv.width, rt.cv.height);
      gl.uniform1f(uT, t); gl.uniform1f(uB, live ? live.boost : 0); gl.uniform1f(uL, live ? live.lean : 0); gl.uniform2f(uR, rt.cv.width, rt.cv.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    poster(ctx, w, h) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0F2147'); g.addColorStop(1, '#050A1A'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  };
};
