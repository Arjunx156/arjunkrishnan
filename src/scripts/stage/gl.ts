// Thin WebGL2 helpers: programs that compile off the main thread, float textures, framebuffers.

export interface Program {
  prog: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
}

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error("stage: could not create shader");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const COMPILE_TIMEOUT_MS = 8000;

// Starts every link at once, then polls KHR_parallel_shader_compile so the main thread never stalls.
// Gives up if the context is lost or the driver never reports back.
export function programs(gl: WebGL2RenderingContext, sources: [string, string][]): Promise<Program[]> {
  const started = performance.now();
  const ext = gl.getExtension("KHR_parallel_shader_compile");
  const built = sources.map(([vs, fs]) => {
    const prog = gl.createProgram();
    if (!prog) throw new Error("stage: could not create program");
    const v = shader(gl, gl.VERTEX_SHADER, vs);
    const f = shader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    return { prog, v, f };
  });
  return new Promise((resolve, reject) => {
    const check = () => {
      if (gl.isContextLost()) {
        reject(new Error("stage: context lost while compiling"));
        return;
      }
      const waiting = ext && built.some((b) => !gl.getProgramParameter(b.prog, ext.COMPLETION_STATUS_KHR));
      if (waiting && performance.now() - started < COMPILE_TIMEOUT_MS) {
        requestAnimationFrame(check);
        return;
      }
      const bad = built.find((b) => !gl.getProgramParameter(b.prog, gl.LINK_STATUS));
      if (bad) {
        reject(
          new Error(
            `stage: ${gl.getShaderInfoLog(bad.f) || gl.getShaderInfoLog(bad.v) || gl.getProgramInfoLog(bad.prog)}`,
          ),
        );
        return;
      }
      resolve(
        built.map(({ prog }) => {
          const cache = new Map<string, WebGLUniformLocation | null>();
          return {
            prog,
            u: (name: string) => {
              if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
              return cache.get(name) ?? null;
            },
          };
        }),
      );
    };
    check();
  });
}

export function texture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  format: "f32" | "f16",
  data: Float32Array | null = null,
): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error("stage: could not create texture");
  gl.bindTexture(gl.TEXTURE_2D, t);
  const internal = format === "f32" ? gl.RGBA32F : gl.RGBA16F;
  const filter = format === "f32" ? gl.NEAREST : gl.LINEAR;
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function framebuffer(gl: WebGL2RenderingContext, targets: WebGLTexture[]): WebGLFramebuffer {
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("stage: could not create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const attachments = targets.map((t, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    return gl.COLOR_ATTACHMENT0 + i;
  });
  gl.drawBuffers(attachments);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("stage: framebuffer incomplete");
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

export function bindTexture(
  gl: WebGL2RenderingContext,
  unit: number,
  t: WebGLTexture,
  loc: WebGLUniformLocation | null,
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.uniform1i(loc, unit);
}

// Without a GPU every particle is simulated on the CPU, so the stage scales itself down.
export function softwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}
