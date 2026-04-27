import { useEffect, useRef } from 'react'

const TEX_SIZE = 1024

/** Pass-through quad; inverse warp + sampling in fragment shader. */
const VS = `
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_uv.x * 2.0 - 1.0, a_uv.y * 2.0 - 1.0, 0.0, 1.0);
}
`

const FS = `
precision mediump float;

varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_hasTex;
uniform float u_score0;
uniform float u_score1;
uniform float u_score2;
uniform float u_score3;
uniform float u_score4;
uniform float u_baseRadius;
uniform float u_outer;
uniform float u_rInner;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float STEP = TWO_PI / 5.0;

float scoreK(int k) {
  if (k == 0) return u_score0;
  if (k == 1) return u_score1;
  if (k == 2) return u_score2;
  if (k == 3) return u_score3;
  return u_score4;
}

float axisAngleK(int k) {
  return PI * 0.5 - float(k) * STEP;
}

vec2 vertexPos(int k) {
  float a = axisAngleK(k);
  float rad = u_rInner + (u_outer - u_rInner) * scoreK(k);
  return vec2(cos(a), sin(a)) * rad;
}

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

// Ray: origin + t * dir, t >= 0, dir unit. Segment: a -> b, u in [0,1].
float raySegmentHit(vec2 a, vec2 b, vec2 dir) {
  vec2 v = b - a;
  float den = cross2(dir, v);
  if (abs(den) < 1e-5) return -1.0;
  float t = cross2(a, v) / den;
  float u = cross2(a, dir) / den;
  if (t >= 0.0 && u >= 0.0 && u <= 1.0) return t;
  return -1.0;
}

// Distance from origin along dir to convex pentagon boundary (geometric).
float boundaryRadius(vec2 dir) {
  float tMin = 1e9;
  for (int k = 0; k < 5; k += 1) {
    int kn = k + 1;
    if (kn == 5) kn = 0;
    vec2 v0 = vertexPos(k);
    vec2 v1 = vertexPos(kn);
    float t = raySegmentHit(v0, v1, dir);
    if (t > 0.0 && t < tMin) tMin = t;
  }
  if (tMin > 1e8) return 0.0;
  return tMin;
}

void main() {
  vec3 bg = vec3(1.0);
  if (u_hasTex < 0.5) {
    gl_FragColor = vec4(0.93, 0.93, 0.93, 1.0);
    return;
  }

  // Centered coords, +y = toward smaller v_uv.y (image up)
  vec2 p = vec2(v_uv.x - 0.5, 0.5 - v_uv.y);
  float r = length(p);
  if (r < 1e-6) {
    gl_FragColor = texture2D(u_tex, vec2(0.5, 0.5));
    return;
  }

  vec2 dir = p / r;
  float theta = atan(dir.y, dir.x);
  float Rbound = boundaryRadius(dir);

  float edgeEps = 0.003;
  if (r > Rbound + edgeEps) {
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  float denom = max(Rbound, 1e-4);
  float sourceR = r * (u_baseRadius / denom);
  vec2 sp = dir * sourceR;
  vec2 srcUV = vec2(0.5 + sp.x, 0.5 - sp.y);

  if (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0) {
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  vec4 col = texture2D(u_tex, srcUV);
  float edgeBlend = 1.0 - smoothstep(Rbound - edgeEps, Rbound + edgeEps, r);
  gl_FragColor = vec4(mix(bg, col.rgb, edgeBlend * col.a), 1.0);
}
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(msg || 'shader compile failed')
  }
  return sh
}

function buildProgram(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VS)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS)
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error(msg || 'program link failed')
  }
  return prog
}

/** Fullscreen quad, UV 0..1 */
function buildQuad(gl) {
  const verts = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])
  const idx = new Uint16Array([0, 1, 2, 1, 3, 2])
  const vb = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vb)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

  const ib = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)

  return { vb, ib, indexCount: 6 }
}

function sourceSize(img) {
  if (img instanceof HTMLImageElement) {
    return {
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
    }
  }
  return { w: img.width, h: img.height }
}

function drawImageContain(ctx, S, img) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, S, S)
  const { w: iw, h: ih } = sourceSize(img)
  if (!iw || !ih) return
  const scale = Math.min(S / iw, S / ih)
  const dw = iw * scale
  const dh = ih * scale
  const x = (S - dw) / 2
  const y = (S - dh) / 2
  ctx.drawImage(img, x, y, dw, dh)
}

/**
 * @param {{ scores: number[]; image: CanvasImageSource | null; size: number }} props
 */
export function WarpCanvas({ scores, image, size }) {
  const canvasRef = useRef(null)
  const prepRef = useRef(null)
  const glRef = useRef(null)
  const progRef = useRef(null)
  const meshRef = useRef(null)
  const texRef = useRef(null)
  const locRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    })
    if (!gl) return
    glRef.current = gl

    const prog = buildProgram(gl)
    progRef.current = prog

    const a_uv = gl.getAttribLocation(prog, 'a_uv')
    const u_score0 = gl.getUniformLocation(prog, 'u_score0')
    const u_score1 = gl.getUniformLocation(prog, 'u_score1')
    const u_score2 = gl.getUniformLocation(prog, 'u_score2')
    const u_score3 = gl.getUniformLocation(prog, 'u_score3')
    const u_score4 = gl.getUniformLocation(prog, 'u_score4')
    const u_tex = gl.getUniformLocation(prog, 'u_tex')
    const u_hasTex = gl.getUniformLocation(prog, 'u_hasTex')
    const u_baseRadius = gl.getUniformLocation(prog, 'u_baseRadius')
    const u_outer = gl.getUniformLocation(prog, 'u_outer')
    const u_rInner = gl.getUniformLocation(prog, 'u_rInner')

    locRef.current = {
      a_uv,
      u_score0,
      u_score1,
      u_score2,
      u_score3,
      u_score4,
      u_tex,
      u_hasTex,
      u_baseRadius,
      u_outer,
      u_rInner,
    }

    const mesh = buildQuad(gl)
    meshRef.current = mesh

    const tex = gl.createTexture()
    texRef.current = tex
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    let prep = prepRef.current
    if (!prep) {
      prep = document.createElement('canvas')
      prep.width = TEX_SIZE
      prep.height = TEX_SIZE
      prepRef.current = prep
    }

    return () => {
      gl.deleteProgram(prog)
      gl.deleteBuffer(mesh.vb)
      gl.deleteBuffer(mesh.ib)
      gl.deleteTexture(tex)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = glRef.current
    const prog = progRef.current
    const mesh = meshRef.current
    const tex = texRef.current
    const loc = locRef.current
    const prep = prepRef.current
    if (!canvas || !gl || !prog || !mesh || !loc) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = Math.max(2, Math.floor(size * dpr))
    canvas.width = px
    canvas.height = px
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'

    gl.viewport(0, 0, px, px)

    gl.bindTexture(gl.TEXTURE_2D, tex)
    let has = 0
    if (image && prep) {
      const ctx = prep.getContext('2d')
      if (ctx) {
        const { w, h } = sourceSize(image)
        const ready =
          image instanceof HTMLImageElement
            ? image.complete && w > 0
            : w > 0 && h > 0
        if (ready) {
          drawImageContain(ctx, TEX_SIZE, image)
          // Canvas 2D is top-origin; WebGL texture rows default bottom-origin without this.
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prep)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
          has = 1
        }
      }
    }

    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb)
    gl.enableVertexAttribArray(loc.a_uv)
    gl.vertexAttribPointer(loc.a_uv, 2, gl.FLOAT, false, 0, 0)

    const s = scores.slice(0, 5)
    while (s.length < 5) s.push(0)
    gl.uniform1f(loc.u_score0, s[0])
    gl.uniform1f(loc.u_score1, s[1])
    gl.uniform1f(loc.u_score2, s[2])
    gl.uniform1f(loc.u_score3, s[3])
    gl.uniform1f(loc.u_score4, s[4])

    gl.uniform1f(loc.u_hasTex, has)
    gl.uniform1f(loc.u_baseRadius, 0.5)
    gl.uniform1f(loc.u_outer, 0.36)
    gl.uniform1f(loc.u_rInner, 0.06)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(loc.u_tex, 0)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib)
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0)
  }, [scores, image, size])

  return (
    <canvas
      ref={canvasRef}
      className="warp-canvas"
      aria-label="Warped face preview"
    />
  )
}
