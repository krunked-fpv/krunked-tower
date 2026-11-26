// ============================================================================
// Krunked Tower — 5 WebGL2 GLSL ES 3.00 Shaders + FBO Present Shader
//   1. shd_pal_swapper      — 1D 6-color palette LUT outfit swapping
//   2. shd_color_afterimage — tinted Mach 2/3/4 & Superjump ghost silhouettes
//   3. shd_hit              — pure white / inverted hitstop & parry flash
//   4. shd_panicbg          — pulsing Krunk Time! crimson/violet vignette & bars
//   5. shd_outline          — crisp 1px/2px dark ink / telegraph silhouette rim
// Plus shd_present          — crisp 960x540 FBO nearest-neighbor display blit
// ============================================================================

export type KrunkedShaderName =
  | 'shd_pal_swapper'
  | 'shd_color_afterimage'
  | 'shd_hit'
  | 'shd_panicbg'
  | 'shd_outline'
  | 'shd_present';

export const SPRITE_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;

uniform vec2 u_resolution;

out vec2 v_uv;
out vec4 v_color;

void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

export const FULLSCREEN_VERT_SRC = `#version 300 es
precision highp float;

const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

out vec2 v_uv;

void main() {
  vec2 p = POS[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// 1. shd_pal_swapper: samples 1D 6-color palette LUT ramp for outfit swapping
export const SHD_PAL_SWAPPER_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_tex;
uniform sampler2D u_palLut;
uniform vec3 u_srcColors[6];
uniform float u_palRow;
uniform float u_enableSwap;

out vec4 outColor;

void main() {
  vec4 tex = texture(u_tex, v_uv);
  if (tex.a < 0.01) discard;

  vec3 rgb = tex.rgb;
  if (u_enableSwap > 0.5) {
    float bestDist = 0.045;
    int bestIdx = -1;
    for (int i = 0; i < 6; i++) {
      vec3 d = rgb - u_srcColors[i];
      float dist2 = dot(d, d);
      if (dist2 < bestDist) {
        bestDist = dist2;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      float u = (float(bestIdx) + 0.5) / 6.0;
      rgb = texture(u_palLut, vec2(u, u_palRow)).rgb;
    }
  }

  outColor = vec4(rgb * v_color.rgb, tex.a * v_color.a);
}
`;

// 2. shd_color_afterimage: tinted translucent Mach 2/3/4 & Superjump ghost trails
export const SHD_COLOR_AFTERIMAGE_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_tex;
uniform float u_time;

out vec4 outColor;

void main() {
  vec4 tex = texture(u_tex, v_uv);
  if (tex.a < 0.08) discard;

  float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
  float pulse = 0.88 + 0.12 * sin(u_time * 18.0 + gl_FragCoord.y * 0.25);
  vec3 ghostRgb = v_color.rgb * (0.58 + 0.65 * luma) * pulse;
  outColor = vec4(ghostRgb, tex.a * v_color.a);
}
`;

// 3. shd_hit: pure white / inverted hitstop & parry impact flash
export const SHD_HIT_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_tex;
uniform float u_flashStrength;
uniform float u_invertMode;

out vec4 outColor;

void main() {
  vec4 tex = texture(u_tex, v_uv);
  if (tex.a < 0.01) discard;

  vec3 base = tex.rgb * v_color.rgb;
  vec3 target = u_invertMode > 0.5 ? (vec3(1.0) - base) : vec3(1.0);
  vec3 finalRgb = mix(base, target, clamp(u_flashStrength, 0.0, 1.0));
  outColor = vec4(finalRgb, tex.a * v_color.a);
}
`;

// 4. shd_panicbg: pulsing crimson/violet Krunk Time! escape vignette & hazard bars
export const SHD_PANICBG_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;

uniform float u_time;
uniform float u_intensity;
uniform float u_lap2;
uniform vec2 u_resolution;

out vec4 outColor;

void main() {
  float intensity = clamp(u_intensity, 0.0, 1.0);
  if (intensity <= 0.001) discard;

  vec2 centered = v_uv * 2.0 - 1.0;
  float dist = length(centered * vec2(1.05, 1.15));
  float pulse = 0.65 + 0.35 * sin(u_time * (u_lap2 > 0.5 ? 11.0 : 7.5));
  float vig = smoothstep(0.55, 1.38, dist) * (0.48 + 0.22 * pulse) * intensity;

  vec3 panicCol = mix(vec3(0.88, 0.09, 0.22), vec3(0.68, 0.12, 0.94), u_lap2);
  vec3 accentCol = mix(vec3(1.0, 0.78, 0.12), vec3(0.24, 0.94, 1.0), u_lap2);

  // Animated diagonal caution hazard bars along extreme top & bottom edges
  float pxY = v_uv.y * u_resolution.y;
  float pxX = v_uv.x * u_resolution.x;
  float edgeBand = step(pxY, 10.0) + step(u_resolution.y - 10.0, pxY);
  float stripe = step(0.5, fract((pxX + pxY + u_time * 90.0) / 28.0));
  float barAlpha = clamp(edgeBand, 0.0, 1.0) * 0.52 * intensity;
  vec3 barCol = mix(vec3(0.08, 0.05, 0.11), accentCol, stripe);

  vec3 col = mix(panicCol, barCol, step(0.01, barAlpha));
  float alpha = max(vig, barAlpha);
  outColor = vec4(col, alpha);
}
`;

// 5. shd_outline: crisp 1px/2px dark ink or telegraph silhouette emphasis
export const SHD_OUTLINE_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_tex;
uniform vec2 u_texelSize;
uniform vec4 u_outlineColor;
uniform float u_thickness;
uniform vec4 u_uvBounds; // (minU, minV, maxU, maxV) prevents atlas bleed!

out vec4 outColor;

float sampleInBounds(vec2 uv) {
  if (uv.x < u_uvBounds.x || uv.x > u_uvBounds.z || uv.y < u_uvBounds.y || uv.y > u_uvBounds.w) {
    return 0.0;
  }
  return texture(u_tex, uv).a;
}

void main() {
  vec4 center = texture(u_tex, v_uv);
  if (center.a >= 0.15) {
    outColor = center * v_color;
    return;
  }

  vec2 stepUv = u_texelSize * max(1.0, u_thickness);
  float maxA = 0.0;
  maxA = max(maxA, sampleInBounds(v_uv + vec2( stepUv.x, 0.0)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2(-stepUv.x, 0.0)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2(0.0,  stepUv.y)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2(0.0, -stepUv.y)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2( stepUv.x,  stepUv.y)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2(-stepUv.x,  stepUv.y)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2( stepUv.x, -stepUv.y)));
  maxA = max(maxA, sampleInBounds(v_uv + vec2(-stepUv.x, -stepUv.y)));

  if (maxA >= 0.15) {
    outColor = u_outlineColor;
  } else {
    discard;
  }
}
`;

// Internal 960x540 FBO nearest-neighbor presentation shader
export const SHD_PRESENT_FRAG = `#version 300 es
precision mediump float;

in vec2 v_uv;

uniform sampler2D u_sceneTex;
uniform vec4 u_screenFlash;

out vec4 outColor;

void main() {
  vec4 col = texture(u_sceneTex, v_uv);
  vec3 mixed = mix(col.rgb, u_screenFlash.rgb, clamp(u_screenFlash.a, 0.0, 1.0));
  outColor = vec4(mixed, 1.0);
}
`;

export interface CompiledShaderProgram {
  name: KrunkedShaderName;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function compileSingleShader(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`Failed to allocate shader handle for ${label}`);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error (${label}): ${info}`);
  }
  return shader;
}

export function createShaderProgram(
  gl: WebGL2RenderingContext,
  name: KrunkedShaderName,
  vertSrc: string,
  fragSrc: string,
  uniformNames: readonly string[]
): CompiledShaderProgram {
  const vs = compileSingleShader(gl, gl.VERTEX_SHADER, vertSrc, `${name}:vert`);
  const fs = compileSingleShader(gl, gl.FRAGMENT_SHADER, fragSrc, `${name}:frag`);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`Failed to create WebGLProgram for ${name}`);
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`Shader link error (${name}): ${info}`);
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const u of uniformNames) {
    uniforms[u] = gl.getUniformLocation(program, u);
  }
  return { name, program, uniforms };
}

export interface KrunkedShaderSuite {
  shd_pal_swapper: CompiledShaderProgram;
  shd_color_afterimage: CompiledShaderProgram;
  shd_hit: CompiledShaderProgram;
  shd_panicbg: CompiledShaderProgram;
  shd_outline: CompiledShaderProgram;
  shd_present: CompiledShaderProgram;
  dispose: () => void;
}

export function createKrunkedShaders(gl: WebGL2RenderingContext): KrunkedShaderSuite {
  const shd_pal_swapper = createShaderProgram(gl, 'shd_pal_swapper', SPRITE_VERT_SRC, SHD_PAL_SWAPPER_FRAG, [
    'u_resolution',
    'u_tex',
    'u_palLut',
    'u_srcColors[0]',
    'u_palRow',
    'u_enableSwap',
  ]);

  const shd_color_afterimage = createShaderProgram(
    gl,
    'shd_color_afterimage',
    SPRITE_VERT_SRC,
    SHD_COLOR_AFTERIMAGE_FRAG,
    ['u_resolution', 'u_tex', 'u_time']
  );

  const shd_hit = createShaderProgram(gl, 'shd_hit', SPRITE_VERT_SRC, SHD_HIT_FRAG, [
    'u_resolution',
    'u_tex',
    'u_flashStrength',
    'u_invertMode',
  ]);

  const shd_panicbg = createShaderProgram(gl, 'shd_panicbg', FULLSCREEN_VERT_SRC, SHD_PANICBG_FRAG, [
    'u_time',
    'u_intensity',
    'u_lap2',
    'u_resolution',
  ]);

  const shd_outline = createShaderProgram(gl, 'shd_outline', SPRITE_VERT_SRC, SHD_OUTLINE_FRAG, [
    'u_resolution',
    'u_tex',
    'u_texelSize',
    'u_outlineColor',
    'u_thickness',
    'u_uvBounds',
  ]);

  const shd_present = createShaderProgram(gl, 'shd_present', FULLSCREEN_VERT_SRC, SHD_PRESENT_FRAG, [
    'u_sceneTex',
    'u_screenFlash',
  ]);

  const all = [
    shd_pal_swapper,
    shd_color_afterimage,
    shd_hit,
    shd_panicbg,
    shd_outline,
    shd_present,
  ];

  return {
    shd_pal_swapper,
    shd_color_afterimage,
    shd_hit,
    shd_panicbg,
    shd_outline,
    shd_present,
    dispose: () => {
      for (const s of all) {
        gl.deleteProgram(s.program);
      }
    },
  };
}
