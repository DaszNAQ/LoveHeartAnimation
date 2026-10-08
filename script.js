const ui = document.getElementById("ui");
const totalItems = 70;

for(let i = 1; i <= totalItems; i++){
    const love = document.createElement("div");
    love.className = "love";
    love.style.setProperty("--i", i);

    love.innerHTML =`
    <div class="love_horizontal">
        <div class="love_vertical">
            <div class="love_word">I love you</div>
        </div>
    </div>
    `;
    ui.appendChild(love);
}

/* Navbar + 3D scenes */
const canvas  = document.getElementById("gl");
const stageEl = document.querySelector(".stage");
const uiEl    = document.getElementById("ui");
const hintEl  = document.getElementById("gl_hint");
const noteEl  = document.getElementById("gl_note");
let current = "text";

// Scale + centre the original "I love you" heart so it fits any screen.
function fitHeart(){
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if(!w || !h) return;
    const s = Math.min(w / 610, h / 570, 1.2);
    uiEl.style.transform = `translate(${-64.5 * s}px, ${13 * s}px) scale(${s})`;
}
new ResizeObserver(fitHeart).observe(stageEl);
fitHeart();

function initGL(){
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false })
            || canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
    if(!gl) return null;

    const M = {
        id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
        mul(a, b){
            const o = new Float32Array(16);
            for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++){
                let s = 0;
                for(let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
                o[c * 4 + r] = s;
            }
            return o;
        },
        trans(x, y, z){ const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
        scale(x, y = x, z = x){ const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
        rotX(a){ const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
        rotY(a){ const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
        rotZ(a){ const c = Math.cos(a), s = Math.sin(a), m = M.id(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
        persp(fovy, asp, n, f){
            const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
            o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
            return o;
        },
        lookAt(e, c, u){
            let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
            let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
            let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0];
            l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
            const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
            const o = M.id();
            o[0] = sx; o[4] = sy; o[8] = sz;
            o[1] = ux; o[5] = uy; o[9] = uz;
            o[2] = -fx; o[6] = -fy; o[10] = -fz;
            o[12] = -(sx * e[0] + sy * e[1] + sz * e[2]);
            o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]);
            o[14] = fx * e[0] + fy * e[1] + fz * e[2];
            return o;
        },

        trs(p, rx, ry, rz, sx, sy = sx, sz = sx){
            return M.mul(M.trans(p[0], p[1], p[2]), M.mul(M.rotY(ry), M.mul(M.rotX(rx), M.mul(M.rotZ(rz), M.scale(sx, sy, sz)))));
        },
        point(m, v){
            return [m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12],
                    m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13],
                    m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]];
        }
    };
    const hex = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
    const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

    const PREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";

    function makeProgram(vs, fs, names){
        const mk = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, mk(gl.FRAGMENT_SHADER, PREC + fs));
        gl.bindAttribLocation(p, 0, "aPos");
        gl.bindAttribLocation(p, 1, "aExtra");
        gl.linkProgram(p);
        if(!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
        const u = {};
        names.forEach(n => { u[n] = gl.getUniformLocation(p, n); });
        return { p, u };
    }

    const LIT = makeProgram(`
        attribute vec3 aPos; attribute vec3 aExtra;
        uniform mat4 uVP; uniform mat4 uModel;
        varying vec3 vWorld; varying vec3 vNormal;
        void main(){
            vec4 w = uModel * vec4(aPos, 1.0);
            vWorld = w.xyz;
            vNormal = (uModel * vec4(aExtra, 0.0)).xyz;
            gl_Position = uVP * w;
        }`, `
        varying vec3 vWorld; varying vec3 vNormal;
        uniform vec3 uCam, uColor, uEmissive, uKeyDir, uKeyCol, uAmbTop, uAmbBot, uLP0, uLC0, uLP1, uLC1, uFogColor;
        uniform float uShin, uSpec, uRim, uFogNear, uFogFar;
        void main(){
            vec3 N = normalize(vNormal);
            vec3 V = normalize(uCam - vWorld);
            vec3 base = pow(uColor, vec3(2.2));
            vec3 col = base * mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5);
            vec3 spec = vec3(0.0);

            vec3 L = normalize(uKeyDir);
            col += base * uKeyCol * max(dot(N, L), 0.0);
            float nh = max(dot(N, normalize(L + V)), 0.0);
            spec += uKeyCol * (pow(nh, uShin) * uSpec + pow(nh, uShin * 0.12) * uSpec * 0.18);

            vec3 d = uLP0 - vWorld; float len = length(d); L = d / len;
            float at = 1.0 / (1.0 + 0.035 * len * len);
            col += base * uLC0 * max(dot(N, L), 0.0) * at;
            nh = max(dot(N, normalize(L + V)), 0.0);
            spec += uLC0 * pow(nh, uShin) * uSpec * at;

            d = uLP1 - vWorld; len = length(d); L = d / len;
            at = 1.0 / (1.0 + 0.035 * len * len);
            col += base * uLC1 * max(dot(N, L), 0.0) * at;
            nh = max(dot(N, normalize(L + V)), 0.0);
            spec += uLC1 * pow(nh, uShin) * uSpec * at;

            col += vec3(1.0, 0.35, 0.6) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.35 * uRim;
            col += pow(uEmissive, vec3(2.2)) + spec;
            col = pow(col, vec3(1.0 / 2.2));
            float f = clamp((length(uCam - vWorld) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
            gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
        }`, ["uVP","uModel","uCam","uColor","uEmissive","uKeyDir","uKeyCol","uAmbTop","uAmbBot","uLP0","uLC0","uLP1","uLC1","uFogColor","uShin","uSpec","uRim","uFogNear","uFogFar"]);

    // flat things: solid colour, texture (text) or soft radial glow
    const FLAT = makeProgram(`
        attribute vec3 aPos; attribute vec2 aExtra;
        uniform mat4 uVP; uniform mat4 uModel;
        varying vec2 vUV; varying vec3 vWorld;
        void main(){
            vec4 w = uModel * vec4(aPos, 1.0);
            vWorld = w.xyz; vUV = aExtra;
            gl_Position = uVP * w;
        }`, `
        varying vec2 vUV; varying vec3 vWorld;
        uniform vec4 uColor; uniform float uMode; uniform sampler2D uTex;
        uniform vec3 uCam, uFogColor; uniform float uFogNear, uFogFar;
        void main(){
            vec4 c = uColor;
            if(uMode > 1.5){
                float d = length(vUV - 0.5) * 2.0;
                float a = max(1.0 - d, 0.0);
                c.a *= a * a;
            }else if(uMode > 0.5){
                c = texture2D(uTex, vUV);
                c.a *= uColor.a;
            }
            float f = clamp((length(uCam - vWorld) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
            gl_FragColor = vec4(mix(c.rgb, uFogColor, f), c.a);
        }`, ["uVP","uModel","uColor","uMode","uTex","uCam","uFogColor","uFogNear","uFogFar"]);

    // sparkles
    const PTS = makeProgram(`
        attribute vec3 aPos; attribute vec3 aExtra;
        uniform mat4 uVP; uniform mat4 uModel; uniform float uSize;
        void main(){
            gl_Position = uVP * uModel * vec4(aPos, 1.0);
            gl_PointSize = uSize / gl_Position.w;
        }`, `
        uniform vec4 uColor;
        void main(){
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if(d > 1.0) discard;
            float a = 1.0 - d;
            gl_FragColor = vec4(uColor.rgb, uColor.a * a * a);
        }`, ["uVP","uModel","uSize","uColor"]);

    /* geometry */
    const buf = (data, target = gl.ARRAY_BUFFER, Type = Float32Array) => {
        const b = gl.createBuffer();
        gl.bindBuffer(target, b);
        gl.bufferData(target, new Type(data), gl.STATIC_DRAW);
        return b;
    };

    // puffy 3D heart: heart outline shrunk ring by ring (like an inflated cushion), smooth normals
    function buildHeart(N = 96, K = 26, depth = 0.62){
        const outline = [];
        let ymin = 1e9, ymax = -1e9;
        for(let i = 0; i < N; i++){
            const t = (i / N) * Math.PI * 2;
            const x = Math.pow(Math.sin(t), 3);
            const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
            outline.push([x, y]);
            ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
        }
        const cy = (ymin + ymax) / 2;
        const pos = new Float32Array((K + 1) * N * 3);
        for(let k = 0; k <= K; k++){
            const phi = (k / K) * Math.PI;
            const s = Math.pow(Math.sin(phi), 0.5);
            const z = (depth / 2) * Math.cos(phi);
            for(let i = 0; i < N; i++){
                const o = (k * N + i) * 3;
                pos[o] = outline[i][0] * s;
                pos[o + 1] = (outline[i][1] - cy) * s;
                pos[o + 2] = z;
            }
        }
        const idx = [];
        for(let k = 0; k < K; k++) for(let i = 0; i < N; i++){
            const a = k * N + i, b = k * N + (i + 1) % N, c = (k + 1) * N + i, d = (k + 1) * N + (i + 1) % N;
            idx.push(a, c, b, b, c, d);
        }
        const nrm = new Float32Array(pos.length);
        for(let f = 0; f < idx.length; f += 3){
            const [a, b, c] = [idx[f] * 3, idx[f + 1] * 3, idx[f + 2] * 3];
            const ux = pos[b] - pos[a], uy = pos[b+1] - pos[a+1], uz = pos[b+2] - pos[a+2];
            const vx = pos[c] - pos[a], vy = pos[c+1] - pos[a+1], vz = pos[c+2] - pos[a+2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for(const o of [a, b, c]){ nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
        }
        for(const k of [0, K]){                       // poles: share one normal
            let sx = 0, sy = 0, sz = 0;
            for(let i = 0; i < N; i++){ const o = (k * N + i) * 3; sx += nrm[o]; sy += nrm[o+1]; sz += nrm[o+2]; }
            for(let i = 0; i < N; i++){ const o = (k * N + i) * 3; nrm[o] = sx; nrm[o+1] = sy; nrm[o+2] = sz; }
        }
        let dotSum = 0;                               // make normals point outward
        for(let o = 0; o < nrm.length; o += 3){
            const l = Math.hypot(nrm[o], nrm[o+1], nrm[o+2]) || 1;
            nrm[o] /= l; nrm[o+1] /= l; nrm[o+2] /= l;
            dotSum += nrm[o] * pos[o] + nrm[o+1] * pos[o+1] + nrm[o+2] * pos[o+2];
        }
        if(dotSum < 0) for(let o = 0; o < nrm.length; o++) nrm[o] = -nrm[o];
        return { pos: buf(pos), extra: buf(nrm), idx: buf(idx, gl.ELEMENT_ARRAY_BUFFER, Uint16Array), count: idx.length, mode: gl.TRIANGLES, es: 3 };
    }

    function buildQuad(){            // -1..1 square with UVs
        return {
            pos: buf([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0]), extra: buf([0,0, 1,0, 1,1, 0,1]),
            idx: buf([0,1,2, 0,2,3], gl.ELEMENT_ARRAY_BUFFER, Uint16Array), count: 6, mode: gl.TRIANGLES, es: 2
        };
    }
    function buildDisc(r, seg){      // floor, normal up
        const p = [0, 0, 0], n = [0, 1, 0], ix = [];
        for(let i = 0; i <= seg; i++){
            const a = (i / seg) * Math.PI * 2;
            p.push(Math.cos(a) * r, 0, Math.sin(a) * r); n.push(0, 1, 0);
            if(i > 0) ix.push(0, i, i + 1);
        }
        return { pos: buf(p), extra: buf(n), idx: buf(ix, gl.ELEMENT_ARRAY_BUFFER, Uint16Array), count: ix.length, mode: gl.TRIANGLES, es: 3 };
    }
    function buildRing(r0, r1, seg){ // flat ring in the XZ plane
        const p = [], ix = [];
        for(let i = 0; i < seg; i++){
            const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            p.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
            const j = (i + 1) % seg;
            ix.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
        }
        return { pos: buf(p), extra: null, idx: buf(ix, gl.ELEMENT_ARRAY_BUFFER, Uint16Array), count: ix.length, mode: gl.TRIANGLES, es: 0 };
    }
    function buildCircleLine(seg){
        const p = [];
        for(let i = 0; i < seg; i++){ const a = (i / seg) * Math.PI * 2; p.push(Math.cos(a), 0, Math.sin(a)); }
        return { pos: buf(p), extra: null, idx: null, count: seg, mode: gl.LINE_LOOP, es: 0 };
    }
    function buildCyl(r0, r1, seg){  // tube/cone along +Y, y 0..1, radius r0 -> r1
        const p = [], n = [], ix = [];
        for(let i = 0; i <= seg; i++){
            const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            p.push(c * r0, 0, s * r0, c * r1, 1, s * r1); n.push(c, 0, s, c, 0, s);
            if(i < seg){ const k = i * 2; ix.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
        }
        return { pos: buf(p), extra: buf(n), idx: buf(ix, gl.ELEMENT_ARRAY_BUFFER, Uint16Array), count: ix.length, mode: gl.TRIANGLES, es: 3 };
    }
    function buildBlade(){           // thin swept-back feather strip (triangle in the XY plane)
        return { pos: buf([0,0,0, 0,-0.2,0, 0.55,-0.8,0]), extra: null, idx: null, count: 3, mode: gl.TRIANGLES, es: 0 };
    }
    function buildSparkles(n, rMin, rMax){
        const p = [];
        for(let i = 0; i < n; i++){
            const r = rMin + Math.random() * (rMax - rMin), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            p.push(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
        }
        return { pos: buf(p), extra: null, idx: null, count: n, mode: gl.POINTS, es: 0 };
    }

    const heartGeo = buildHeart(), quadGeo = buildQuad();

    /* frame state + draw helpers */
    let FR = null, curProg = null;
    const FOG_COLOR = [0, 0, 0];
    let LIGHT = false;
    function setTheme(light){                 // background + fog colour must match the page
        LIGHT = light;
        const c = light ? [1, 0.961, 0.976] : [0, 0, 0];     
        FOG_COLOR[0] = c[0]; FOG_COLOR[1] = c[1]; FOG_COLOR[2] = c[2];
        gl.clearColor(c[0], c[1], c[2], 1);
    }

    function bindGeo(g, extraSize){
        gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        if(g.extra && extraSize){
            gl.bindBuffer(gl.ARRAY_BUFFER, g.extra);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, extraSize, gl.FLOAT, false, 0, 0);
        }else gl.disableVertexAttribArray(1);
        if(g.idx) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx);
    }
    function draw(g){
        if(g.idx) gl.drawElements(g.mode, g.count, gl.UNSIGNED_SHORT, 0);
        else gl.drawArrays(g.mode, 0, g.count);
    }
    function useLit(){
        if(curProg === LIT) return;
        curProg = LIT;
        const u = LIT.u, L = FR.L;
        gl.useProgram(LIT.p);
        gl.uniformMatrix4fv(u.uVP, false, FR.vp);
        gl.uniform3fv(u.uCam, FR.eye);
        gl.uniform3fv(u.uKeyDir, L.keyDir); gl.uniform3fv(u.uKeyCol, L.keyCol);
        gl.uniform3fv(u.uAmbTop, L.ambTop); gl.uniform3fv(u.uAmbBot, L.ambBot);
        gl.uniform3fv(u.uLP0, L.p0); gl.uniform3fv(u.uLC0, L.c0);
        gl.uniform3fv(u.uLP1, L.p1); gl.uniform3fv(u.uLC1, L.c1);
        gl.uniform3fv(u.uFogColor, FOG_COLOR);
        gl.uniform1f(u.uFogNear, FR.fog[0]); gl.uniform1f(u.uFogFar, FR.fog[1]);
    }
    function useFlat(){
        if(curProg === FLAT) return;
        curProg = FLAT;
        const u = FLAT.u;
        gl.useProgram(FLAT.p);
        gl.uniformMatrix4fv(u.uVP, false, FR.vp);
        gl.uniform3fv(u.uCam, FR.eye);
        gl.uniform3fv(u.uFogColor, FOG_COLOR);
        gl.uniform1f(u.uFogNear, FR.fog[0]); gl.uniform1f(u.uFogFar, FR.fog[1]);
        gl.uniform1i(u.uTex, 0);
    }
    function usePts(){
        if(curProg === PTS) return;
        curProg = PTS;
        gl.useProgram(PTS.p);
        gl.uniformMatrix4fv(PTS.u.uVP, false, FR.vp);
    }
    const opaque = () => { gl.disable(gl.BLEND); gl.depthMask(true); };
    const transparent = additive => {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, additive && !LIGHT ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);   // additive vanishes on a light bg
        gl.depthMask(false);
    };

    // glossy heart
    function drawHeart(pos, rx, ry, rz, s, color, o = {}){
        useLit(); bindGeo(heartGeo, 3);
        const u = LIT.u;
        gl.uniformMatrix4fv(u.uModel, false, o.model || M.trs(pos, rx, ry, rz, s));
        gl.uniform3fv(u.uColor, color);
        gl.uniform3fv(u.uEmissive, o.emissive || [0.32, 0.04, 0.12]);
        gl.uniform1f(u.uShin, o.shin || 90);
        gl.uniform1f(u.uSpec, o.spec === undefined ? 0.9 : o.spec);
        gl.uniform1f(u.uRim, o.rim === undefined ? 1 : o.rim);
        draw(heartGeo);
    }
    function drawMeshLit(geo, model, color, o = {}){
        useLit(); bindGeo(geo, 3);
        const u = LIT.u;
        gl.uniformMatrix4fv(u.uModel, false, model);
        gl.uniform3fv(u.uColor, color);
        gl.uniform3fv(u.uEmissive, o.emissive || [0, 0, 0]);
        gl.uniform1f(u.uShin, o.shin || 30);
        gl.uniform1f(u.uSpec, o.spec === undefined ? 0.6 : o.spec);
        gl.uniform1f(u.uRim, 0);
        draw(geo);
    }
    function drawFlat(geo, model, rgba, mode = 0){
        useFlat(); bindGeo(geo, geo.es);
        gl.uniformMatrix4fv(FLAT.u.uModel, false, model);
        gl.uniform4fv(FLAT.u.uColor, rgba);
        gl.uniform1f(FLAT.u.uMode, mode);
        draw(geo);
    }
    // soft glow that always faces the camera
    function drawGlow(pos, size, color, alpha){
        const m = M.id();
        m[0] = FR.right[0] * size; m[1] = FR.right[1] * size; m[2] = FR.right[2] * size;
        m[4] = FR.up[0] * size;    m[5] = FR.up[1] * size;    m[6] = FR.up[2] * size;
        m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2];
        drawFlat(quadGeo, m, [color[0], color[1], color[2], alpha], 2);
    }
    function drawSparkles(geo, model, size, alpha){
        usePts(); bindGeo(geo, 0);
        gl.uniformMatrix4fv(PTS.u.uModel, false, model);
        gl.uniform1f(PTS.u.uSize, size * (window.devicePixelRatio || 1));
        gl.uniform4fv(PTS.u.uColor, LIGHT ? [0.88, 0.22, 0.5, alpha] : [1, 0.62, 0.78, alpha]);
        draw(geo);
    }

    const bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
    const beat = t => {                       // double "lub-dub" heartbeat
        const ph = (t % 1.3) / 1.3;
        return 0.16 * bump(ph, 0.06, 0.07) + 0.1 * bump(ph, 0.26, 0.07);
    };

    const PINKS = [0xe0245e, 0xff4d8d, 0xc2185b, 0x9c27b0].map(hex);
    const standardLights = () => ({
        keyDir: norm3([3, 5, 6]), keyCol: [1, 0.97, 0.95],
        ambTop: [0.38, 0.2, 0.28], ambBot: [0.12, 0.05, 0.1],
        p0: [-5, -2, 4], c0: [1.4, 0.42, 0.77], p1: [4, 3, -4], c1: [1.25, 0.5, 1.6]
    });

    /* scenes */
    // 2. Heartbeat
    function makeBeat(){
        const sp = buildSparkles(160, 2.6, 5.5);
        return {
            base: 6.4, halfW: 2.4, halfH: 1.9, pitch0: 0.08, target: [0, 0, 0], fog: [30, 60], lights: standardLights(),
            render(t){
                const b = beat(t);
                opaque();
                drawHeart([0, 0, 0], Math.sin(t * 0.6) * 0.1, t * 0.55, 0, 1.5 * (1 + b), PINKS[0]);
                transparent(true);
                drawGlow([FR.fwd[0] * 1.8, FR.fwd[1] * 1.8, FR.fwd[2] * 1.8], 3.5 * (1 + b * 1.2), [1, 0.35, 0.6], Math.min(1, 0.5 + b * 1.5));
                drawSparkles(sp, M.mul(M.rotY(t * 0.06), M.rotX(t * 0.02)), 26, 0.85);
            }
        };
    }

    function makeTextTexture(){
        const tc = document.createElement("canvas");
        tc.width = 512; tc.height = 256;
        const tg = tc.getContext("2d");
        tg.font = "bold 170px 'Segoe UI', Arial, sans-serif";
        tg.textBaseline = "middle";
        const wI = tg.measureText("I").width, wU = tg.measureText("U").width;
        const heartW = 150, gap = 22;
        let cx = (512 - (wI + gap + heartW + gap + wU)) / 2;
        tg.shadowColor = "#ff4d8d"; tg.shadowBlur = 28;
        const tgrad = tg.createLinearGradient(0, 60, 0, 200);
        tgrad.addColorStop(0, "#ffffff"); tgrad.addColorStop(1, "#ffb3d1");
        tg.fillStyle = tgrad;
        tg.fillText("I", cx, 132);
        cx += wI + gap;
        tg.beginPath();
        for(let i = 0; i <= 100; i++){
            const a = (i / 100) * Math.PI * 2;
            const px = 16 * Math.pow(Math.sin(a), 3);
            const py = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
            const X = cx + heartW / 2 + px * (heartW / 34), Y = 132 + py * (heartW / 34);
            if(i === 0) tg.moveTo(X, Y); else tg.lineTo(X, Y);
        }
        tg.closePath();
        const hgrad = tg.createLinearGradient(0, 70, 0, 190);
        hgrad.addColorStop(0, "#ffb3cc"); hgrad.addColorStop(1, "#f0568a");
        tg.fillStyle = hgrad; tg.fill();
        tg.fillStyle = tgrad;
        tg.fillText("U", cx + heartW + gap, 132);
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    // 3. Floating
    function makeFloat(){
        const textTex = makeTextTexture();
        const hearts = [], texts = [];
        for(let i = 0; i < 30; i++){
            hearts.push({
                z: -8 + Math.random() * 10, nx: Math.random() * 2 - 1, phase: Math.random(),
                speed: 0.025 + Math.random() * 0.04, sf: 0.5 + Math.random(), size: 0.18 + Math.random() * 0.34,
                color: PINKS[i % PINKS.length],
                r: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
                v: [Math.random() * 1.2, 0.5 + Math.random() * 1.5, Math.random() * 0.8]
            });
        }
        for(let i = 0; i < 6; i++){
            texts.push({
                z: -2 + Math.random() * 3.5, nx: (i / 5) * 1.6 - 0.8 + (Math.random() - 0.5) * 0.2,
                phase: Math.random(), speed: 0.02 + Math.random() * 0.025, sf: 0.4 + Math.random() * 0.6,
                size: 0.6 + Math.random() * 0.4
            });
        }
        const s = {
            base: 8, halfW: 2, halfH: 0, pitch0: 0, noDrag: true, target: [0, 0, 0], fog: [7, 17], lights: standardLights(),
            render(t, dt){
                const aspect = canvas.width / canvas.height;
                const k = Math.min(1, Math.max(0.5, aspect / 1.5));   // smaller things on narrow screens
                opaque();
                for(const h of hearts){
                    const Hd = (s.dist - h.z) * TAN;
                    const y = (((h.phase + t * h.speed) % 1) * 2 - 1) * Hd * 1.2;
                    const x = h.nx * Hd * aspect + Math.sin(t * h.sf + h.phase * 20) * 0.35;
                    h.r[0] += dt * h.v[0]; h.r[1] += dt * h.v[1]; h.r[2] += dt * h.v[2];
                    drawHeart([x, y, h.z], h.r[0], h.r[1], h.r[2], h.size * k, h.color);
                }
                const list = texts.map(tx => {
                    const Hd = (s.dist - tx.z) * TAN;
                    return {
                        tx, x: tx.nx * Hd * aspect + Math.sin(t * tx.sf + tx.phase * 20) * 0.3,
                        y: (((tx.phase + t * tx.speed) % 1) * 2 - 1) * Hd * 1.2
                    };
                }).sort((a, b) => a.tx.z - b.tx.z);      // far to near
                transparent(false);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, textTex);
                for(const it of list){
                    const tx = it.tx;
                    const m = M.trs([it.x, it.y, tx.z], 0, Math.sin(t * 0.7 + tx.phase * 10) * 0.5,
                                    Math.sin(t * 0.5 + tx.phase * 7) * 0.12, 2 * tx.size * k, tx.size * k, 1);
                    drawFlat(quadGeo, m, [1, 1, 1, 1], 1);
                }
            }
        };
        return s;
    }

    // 4. Orbit
    function makeOrbit(){
        const sp = buildSparkles(110, 3.4, 6), guide = buildCircleLine(128);
        const rings = [
            { n: 14, R: 2.9, size: 0.24, tx: 0.55, tz: 0, spin: 0.45, color: hex(0xff4d8d) },
            { n: 10, R: 2.1, size: 0.16, tx: -0.6, tz: 0.3, spin: -0.7, color: hex(0xff9ec8) }
        ];
        return {
            base: 8.4, halfW: 3.4, halfH: 2.6, pitch0: 0.3, target: [0, 0, 0], fog: [30, 60], lights: standardLights(),
            render(t){
                const b = beat(t);
                opaque();
                drawHeart([0, 0, 0], 0, t * 0.5, 0, 1.1 * (1 + b), PINKS[0]);
                for(const r of rings){
                    const tilt = M.mul(M.rotX(r.tx), M.rotZ(r.tz));
                    for(let i = 0; i < r.n; i++){
                        const a = (i / r.n) * Math.PI * 2 + r.spin * t;
                        const p = M.point(tilt, [Math.cos(a) * r.R, 0, Math.sin(a) * r.R]);
                        drawHeart(p, 0, (r.spin > 0 ? 1 : -1) * t * 2 + i, Math.sin(t + i) * 0.3, r.size, r.color);
                    }
                }
                transparent(true);
                for(const r of rings)
                    drawFlat(guide, M.mul(M.mul(M.rotX(r.tx), M.rotZ(r.tz)), M.scale(r.R)), [1, 0.3, 0.55, 0.5]);
                drawGlow([FR.fwd[0] * 1.5, FR.fwd[1] * 1.5, FR.fwd[2] * 1.5], 2.75 * (1 + b), [1, 0.35, 0.6], Math.min(1, 0.4 + b));
                drawSparkles(sp, M.rotY(t * 0.05), 26, 0.8);
            }
        };
    }

    // 5. Cupid
    function makeCupid(){
        const tube = buildCyl(1, 1, 18), blade = buildBlade(), sp = buildSparkles(120, 3, 6);
        return {
            base: 9, halfW: 3.4, halfH: 2.8, pitch0: 0.1, target: [0, 0, 0], fog: [30, 60], lights: standardLights(),
            render(t){
                const b = beat(t), yaw = Math.sin(t * 0.5) * 0.55, bob = Math.sin(t * 1.1) * 0.12;
                const big = LIGHT ? hex(0xff80b3) : hex(0xffb3d1), small = LIGHT ? hex(0xe0245e) : hex(0xff4d8d);
                const ink = LIGHT ? hex(0x3d3b42) : hex(0xcfc9da);          // dark grey on light, pale grey on dark
                const G = M.mul(M.trans(0, bob, 0), M.rotY(yaw));
                const A = M.mul(G, M.rotZ(-0.96));                          // arrow: lower-left -> upper-right
                opaque();
                drawHeart([0, bob, 0], 0, yaw, 0, 1.7 * (1 + b * 0.6), big, { emissive: [0.22, 0.04, 0.1] });
                drawHeart(M.point(G, [0, -0.1, 0.5]), 0, yaw, 0, 0.75 * (1 + b * 1.2), small);
                // shaft
                drawMeshLit(tube, M.mul(A, M.mul(M.trans(0, -2.75, 0), M.scale(0.05, 5.15, 0.05))), ink, { shin: 50, spec: 0.5 });
                // heart-shaped arrow head: flipped so its point leads
                drawHeart([0, 0, 0], 0, 0, 0, 1, hex(0xf5324a), {
                    model: M.mul(A, M.mul(M.trans(0, 2.62, 0), M.mul(M.rotZ(Math.PI), M.scale(0.56, 0.56, 0.8)))),
                    emissive: [0.25, 0.02, 0.05], shin: 120
                });
                // tail: parallel swept-back feather strips in four directions around the shaft
                const rgba = [ink[0], ink[1], ink[2], 1];
                for(let i = 0; i < 4; i++) for(let j = 0; j < 4; j++)
                    drawFlat(blade, M.mul(A, M.mul(M.rotY(j * Math.PI / 2), M.trans(0, -1.9 - 0.25 * i, 0))), rgba, 0);
                transparent(true);
                drawGlow([FR.fwd[0] * 2, FR.fwd[1] * 2, FR.fwd[2] * 2], 4.2 * (1 + b), [1, 0.35, 0.6], Math.min(1, 0.45 + b * 1.2));
                drawSparkles(sp, M.rotY(t * 0.05), 26, 0.85);
            }
        };
    }

    const FOV = 45 * Math.PI / 180, TAN = Math.tan(FOV / 2);
    const scenes = { beat: makeBeat(), float: makeFloat(), orbit: makeOrbit(), cupid: makeCupid() };
    Object.values(scenes).forEach(s => {
        s.rig = { yaw: 0, pitch: 0 };
        s.dist = s.base;
        if(s.pmin === undefined) s.pmin = -0.5;
        if(s.pmax === undefined) s.pmax = 0.9;
    });

    /* resize */
    function resize(){
        const w = stageEl.clientWidth, h = stageEl.clientHeight;
        if(!w || !h) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const aspect = w / h;
        Object.values(scenes).forEach(s => { s.dist = Math.max(s.base, Math.max(s.halfW / (TAN * aspect), s.halfH / TAN) * 1.08); });
    }
    new ResizeObserver(resize).observe(stageEl);

    /* drag to look around */
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", e => {
        dragging = true; lx = e.clientX; ly = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
        const s = scenes[current];
        if(!dragging || !s || s.noDrag) return;
        s.rig.yaw -= (e.clientX - lx) * 0.008;
        s.rig.pitch = Math.min(s.pmax - s.pitch0, Math.max(s.pmin - s.pitch0, s.rig.pitch + (e.clientY - ly) * 0.006));
        lx = e.clientX; ly = e.clientY;
    });
    ["pointerup", "pointercancel"].forEach(ev => canvas.addEventListener(ev, () => { dragging = false; }));

    /* render loop
       Only runs while a 3D scene is visible and the tab is in the foreground,
       so the "I Love You" scene and background tabs cost no CPU/GPU/battery. */
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const SLOW_FACTOR = 0.25;            // animation speed when the user prefers reduced motion
    let prev = 0, clock = 0, rafId = 0, running = false;
    function loop(){
        if(!running) return;
        rafId = requestAnimationFrame(loop);
        const now = performance.now() / 1000;
        const real = Math.min(now - prev, 0.05);
        prev = now;
        const dt = reduceMotion.matches ? real * SLOW_FACTOR : real;
        clock += dt;                     // scene time (slowed down when reduced motion is on)
        const s = scenes[current];
        if(!s || !canvas.width) return;
        if(!dragging){                       // ease the camera back to its default view
            const k = Math.exp(-dt * 0.6);
            s.rig.yaw *= k; s.rig.pitch *= k;
        }
        const yaw = s.rig.yaw, p = s.pitch0 + s.rig.pitch;
        const eye = [
            s.target[0] + s.dist * Math.sin(yaw) * Math.cos(p),
            s.target[1] + s.dist * Math.sin(p),
            s.target[2] + s.dist * Math.cos(yaw) * Math.cos(p)
        ];
        const view = M.lookAt(eye, s.target, [0, 1, 0]);
        const vp = M.mul(M.persp(FOV, canvas.width / canvas.height, 0.1, 100), view);
        FR = {
            vp, eye, L: s.lights, fog: s.fog,
            right: [view[0], view[4], view[8]], up: [view[1], view[5], view[9]],
            fwd: norm3([s.target[0] - eye[0], s.target[1] - eye[1], s.target[2] - eye[2]])
        };
        curProg = null;
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        s.render(clock, dt);
    }
    function start(){
        if(running) return;
        running = true;
        prev = performance.now() / 1000;     // avoid a big dt jump after a pause
        rafId = requestAnimationFrame(loop);
    }
    function stop(){
        running = false;
        cancelAnimationFrame(rafId);
    }
    // start or stop the loop depending on what the user is currently looking at
    function sync(){
        if(scenes[current] && !document.hidden) start(); else stop();   // only our own 3D scenes
    }

    return { scenes, resize, setTheme, sync };
}

const GL = initGL();


const THREE_SCENES = ["particles", "crystal"];
const isThreeScene = name => THREE_SCENES.indexOf(name) !== -1;

const TJS = (() => {
    const CDN = {
        gsap:  "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
        three: "https://cdn.jsdelivr.net/npm/three@0.136.0/build/three.min.js",
        orbit: "https://cdn.jsdelivr.net/npm/three@0.136.0/examples/js/controls/OrbitControls.js",
        gltf:  "https://cdn.jsdelivr.net/npm/three@0.136.0/examples/js/loaders/GLTFLoader.js"
    };
    // Crystal heart assets 
    const CRYSTAL_ASSETS = {
        model:  "https://assets.codepen.io/74321/heart.glb",
        sprite: "https://assets.codepen.io/74321/heart.png",
        matcap: "https://assets.codepen.io/74321/3.png",
        music:  "https://assets.codepen.io/74321/ukulele.mp3"
    };
    const HEART_PATH = "M300,107.77C284.68,55.67,239.76,0,162.31,0,64.83,0,0,82.08,0,171.71c0,.48,0,.95,0,1.43-.52,19.5,0,217.94,299.87,379.69v0l0,0,.05,0,0,0,0,0v0C600,391.08,600.48,192.64,600,173.14c0-.48,0-.95,0-1.43C600,82.08,535.17,0,437.69,0,360.24,0,315.32,55.67,300,107.77";
    const BG_LIGHT = 0xfff5f9;                     // same as the page background in light theme

    const threeCanvas = document.getElementById("three");
    const statusEl    = document.getElementById("three_status");
    const crystalText = document.getElementById("crystal_text");
    const musicBtn    = document.getElementById("crystal_music");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => reduceMotion.matches ? 0.25 : 1;   // animation speed factor

    let renderer = null, libs = null, active = null, entered = false;
    let running = false, rafId = 0, token = 0, isLight = false;
    const scenes = {};

    /* load Three.js + GSAP on demand */
    function loadScript(src){
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error("Failed to load " + src));
            document.head.appendChild(s);
        });
    }
    function loadLibs(){
        if(!libs){
            libs = Promise.all([
                loadScript(CDN.gsap),
                loadScript(CDN.three).then(() => Promise.all([loadScript(CDN.orbit), loadScript(CDN.gltf)]))
            ]).catch(err => { libs = null; throw err; });          // allow a retry on the next click
        }
        return libs;
    }

    // Crystal's caption font (Google Fonts), requested only when that tab is first opened
    function loadCaptionFont(){
        if(document.getElementById("lilita_font")) return;
        const l = document.createElement("link");
        l.id = "lilita_font";
        l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Lilita+One&display=swap";
        document.head.appendChild(l);
    }

    /* shared helper: a quad drawn once per particle (instanced) */
    function instancedQuad(count, attrs){
        const quad = new THREE.PlaneGeometry(1, 1);
        const g = new THREE.InstancedBufferGeometry();
        Object.keys(quad.attributes).forEach(k => { g.attributes[k] = quad.attributes[k]; });
        g.index = quad.index;
        g.instanceCount = count;
        Object.keys(attrs).forEach(name => {
            g.setAttribute(name, new THREE.InstancedBufferAttribute(attrs[name][0], attrs[name][1], false));
        });
        return g;
    }

    /* Scene 1: Particles */
    function makeParticles(){
        const SVG_W = 600, SVG_H = 552;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 5000);
        camera.position.z = 500;
        const controls = new THREE.OrbitControls(camera, threeCanvas);
        controls.enabled = false;

        // one GSAP timeline holds every particle's tween
        const tl = gsap.timeline({ repeat: -1, yoyo: true });
        tl.pause();

        // walk along the heart outline (measured on an off-screen SVG path)
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", HEART_PATH);
        svg.appendChild(path);
        document.body.appendChild(svg);
        const vertices = [];
        try{
            const length = path.getTotalLength();
            for(let i = 0; i < length; i += 0.1){
                const point = path.getPointAtLength(i);
                const vector = new THREE.Vector3(point.x, -point.y, 0);
                vector.x += (Math.random() - 0.5) * 30;
                vector.y += (Math.random() - 0.5) * 30;
                vector.z += (Math.random() - 0.5) * 70;
                vertices.push(vector);
                // each particle flies in from the middle of the heart
                tl.from(vector, {
                    x: SVG_W / 2,
                    y: -SVG_H / 2,
                    z: 0,
                    ease: "power2.inOut",
                    duration: "random(2, 5)"
                }, i * 0.002);
            }
        }finally{
            document.body.removeChild(svg);
        }

        const positions = new Float32Array(vertices.length * 3);
        const posAttr = new THREE.BufferAttribute(positions, 3);
        posAttr.setUsage(THREE.DynamicDrawUsage);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", posAttr);
        const material = new THREE.PointsMaterial({ color: 0xee5282, blending: THREE.AdditiveBlending, size: 3 });
        const particles = new THREE.Points(geometry, material);
        particles.frustumCulled = false;                 // positions change every frame
        particles.position.x -= SVG_W / 2;               // centre the heart
        particles.position.y += SVG_H / 2;
        scene.add(particles);

        const spin = gsap.fromTo(scene.rotation, { y: -0.2 }, {
            y: 0.2, repeat: -1, yoyo: true, ease: "power2.inOut", duration: 3
        });
        spin.pause();

        return {
            scene, camera,
            label: "Animated particle heart",
            enter(){ controls.enabled = true; tl.play(); spin.play(); },
            leave(){ controls.enabled = false; tl.pause(); spin.pause(); },
            setMotion(k){ tl.timeScale(k); spin.timeScale(k); },
            update(){
                for(let i = 0, j = 0; i < vertices.length; i++, j += 3){
                    const v = vertices[i];
                    positions[j] = v.x; positions[j + 1] = v.y; positions[j + 2] = v.z;
                }
                posAttr.needsUpdate = true;
            },
            applyTheme(light){
                scene.background = new THREE.Color(light ? BG_LIGHT : 0x000000);
                material.color.setHex(light ? 0xd3367d : 0xee5282);
                // additive blending disappears on a light background
                material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
                material.needsUpdate = true;
            }
        };
    }

    /* Scene 2: Crystal */
    const VERT_DOTS = `
      #define M_PI 3.1415926535897932384626433832795
    uniform float uTime;
    uniform float uSize;
    attribute float aScale;
    attribute vec3 aColor;
    attribute float random;
    attribute float random1;
    attribute float aSpeed;
    varying vec3 vColor;
    varying vec2 vUv;

    void main() {
      float sign = 2.0* (step(random, 0.5) -.5);
      float t = sign*mod(-uTime *  aSpeed* 0.005  + 10.0*aSpeed*aSpeed, M_PI);
      float a = pow(t, 2.0) * pow((t - sign * M_PI), 2.0);
      float radius = 0.14;
      vec3 myOffset =
          vec3(t,  1.0, 0.0);
      myOffset = vec3(radius *16.0 * pow(sin(t), 2.0) * sin(t), radius * (13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)), .15*(a*(random1 - .5))*sin(abs(10.0*(sin(.2*uTime + .2*random)))*t));
      vec3 displacedPosition = myOffset;
      vec4 modelPosition = modelMatrix * vec4(displacedPosition.xyz, 1.0);

      vec4 viewPosition = viewMatrix * modelPosition;
      viewPosition.xyz += position * aScale * uSize * pow(a, .5) * .5;
      gl_Position = projectionMatrix * viewPosition;

      vColor = aColor;
      vUv = uv;
    }
  `;
    const VERT_SNOW = `
      #define M_PI 3.1415926535897932384626433832795


    uniform float uTime;
    uniform float uSize;
    attribute float aScale;
    attribute vec3 aColor;
    attribute float phi;
    attribute float random;
    attribute float random1;
    varying vec3 vColor;
    varying vec2 vUv;

    void main() {
      float t = 0.01 * uTime + 12.0;
      float angle = phi;

      t = mod((-uTime + 100.0) * 0.06* random1 + random *2.0 * M_PI , 2.0 * M_PI);
      vec3 myOffset = vec3(5.85*cos(angle * (t )), 2.0*(t - M_PI), 3.0*sin(angle * (t )/t));
    vec4 modelPosition = modelMatrix * vec4(myOffset, 1.0);
      vec4 viewPosition = viewMatrix * modelPosition;
      viewPosition.xyz += position * aScale * uSize;
      gl_Position = projectionMatrix * viewPosition;

      vColor = aColor;
      vUv = uv;
    }
  `;

    // Glowing dots that trace a heart. On a light page they become normal-blended deep-pink dots.
    const FRAG_DOTS = `
    uniform float uLight;
    varying vec3 vColor;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec3 color = vColor;
      float strength = distance(uv, vec2(0.5));
      strength *= 2.0;
      strength = 1.0 - strength;
      if (uLight > 0.5) {
        vec3 deep = mix(color, vec3(0.83, 0.21, 0.49), 0.55) * 0.85;
        gl_FragColor = vec4(deep, clamp(strength, 0.0, 1.0));
      } else {
        gl_FragColor = vec4(strength * color, 1.0);
      }
    }
  `;

    // Little hearts drifting around (textured sprites). Same light-theme treatment.
    const FRAG_SNOW = `
    uniform sampler2D uTex;
    uniform float uLight;
    varying vec3 vColor;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec3 color = vColor;
      float strength = distance(uv, vec2(0.5, .65));
      strength *= 2.0;
      strength = 1.0 - strength;
      vec3 tex = texture2D(uTex, uv).rgb;
      vec3 lit = tex * color * (strength + .3);
      if (uLight > 0.5) {
        float a = clamp(max(lit.r, max(lit.g, lit.b)) * 1.6, 0.0, 1.0);
        vec3 deep = mix(color, vec3(0.83, 0.21, 0.49), 0.55) * 0.85;
        gl_FragColor = vec4(deep, a);
      } else {
        gl_FragColor = vec4(lit, 1.);
      }
    }
  `;

    function makeCrystal(){
        loadCaptionFont();
        const P = { count: 1500, max: 12.5 * Math.PI, a: 2, c: 4.5 };
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
        camera.position.set(0, 0, 4.5);
        scene.add(camera);

        const clock = new THREE.Clock();
        const textureLoader = new THREE.TextureLoader();
        const sprite = textureLoader.load(CRYSTAL_ASSETS.sprite);
        const time = { current: 0, elapsed: 0, delta: 0, t0: 0, t1: 0, t: 0, frequency: 0.0005 };
        const angle = { x: 0, z: 0 };
        let data = 0, playing = false, k = 1;
        let sound = null, analyser = null, listener = null, model = null;

        /* glowing dots tracing a heart */
        const heartMaterial = new THREE.ShaderMaterial({
            vertexShader: VERT_DOTS,
            fragmentShader: FRAG_DOTS,
            uniforms: { uTime: { value: 0 }, uSize: { value: 0.2 }, uLight: { value: 0 } },
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        {
            const count = P.count;
            const scales = new Float32Array(count), colors = new Float32Array(count * 3);
            const speeds = new Float32Array(count), randoms = new Float32Array(count), randoms1 = new Float32Array(count);
            const choices = ["white", "red", "pink", "crimson", "hotpink", "green"];
            for(let i = 0; i < count; i++){
                randoms[i] = Math.random();
                randoms1[i] = Math.random();
                scales[i] = Math.random() * 0.35;
                const c = new THREE.Color(choices[Math.floor(Math.random() * choices.length)]);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
                speeds[i] = Math.random() * P.max;
            }
            const g = instancedQuad(count, {
                random: [randoms, 1], random1: [randoms1, 1], aScale: [scales, 1], aSpeed: [speeds, 1], aColor: [colors, 3]
            });
            const mesh = new THREE.Mesh(g, heartMaterial);
            mesh.frustumCulled = false;
            scene.add(mesh);
        }

        /* small hearts drifting around */
        const snowMaterial = new THREE.ShaderMaterial({
            vertexShader: VERT_SNOW,
            fragmentShader: FRAG_SNOW,
            uniforms: { uTime: { value: 0 }, uSize: { value: 0.3 }, uTex: { value: sprite }, uLight: { value: 0 } },
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        {
            const count = 550;
            const scales = new Float32Array(count), colors = new Float32Array(count * 3);
            const phis = new Float32Array(count), randoms = new Float32Array(count), randoms1 = new Float32Array(count);
            const choices = ["red", "pink", "hotpink", "green"];
            for(let i = 0; i < count; i++){
                phis[i] = (Math.random() - 0.5) * 10;
                randoms[i] = Math.random();
                randoms1[i] = Math.random();
                scales[i] = Math.random() * 0.35;
                const c = new THREE.Color(choices[Math.floor(Math.random() * choices.length)]);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
            const g = instancedQuad(count, {
                phi: [phis, 1], random: [randoms, 1], random1: [randoms1, 1], aScale: [scales, 1], aColor: [colors, 3]
            });
            const mesh = new THREE.Mesh(g, snowMaterial);
            mesh.frustumCulled = false;
            scene.add(mesh);
        }

        /* the heart model (glTF + matcap) */
        new THREE.GLTFLoader().load(CRYSTAL_ASSETS.model, gltf => {
            model = gltf.scene.children[0];
            if(!model) return;
            model.scale.set(0.01, 0.01, 0.01);
            const grow = () => gsap.to(model.scale, { x: 0.35, y: 0.35, z: 0.35, duration: 1.5, ease: "elastic.out(1, 0.3)" });
            model.material = new THREE.MeshMatcapMaterial({
                matcap: textureLoader.load(CRYSTAL_ASSETS.matcap, grow, undefined, grow),
                color: "#ff89aC"
            });
            scene.add(model);
        }, undefined, err => console.warn("Crystal heart: model failed to load", err));

        /* camera follows the mouse a little */
        threeCanvas.addEventListener("pointermove", e => {
            if(active !== "crystal" || e.pointerType !== "mouse") return;
            const r = threeCanvas.getBoundingClientRect();
            gsap.to(camera.position, {
                x: gsap.utils.mapRange(0, r.width, 0.2, -0.2, e.clientX - r.left),
                y: gsap.utils.mapRange(0, r.height, 0.2, -0.2, -(e.clientY - r.top))
            });
        });

        /* music: loaded on the first click, drives speed + camera while it plays */
        function resetMusicUI(){
            gsap.killTweensOf(musicBtn);
            musicBtn.disabled = false;
            musicBtn.style.opacity = "";
        }
        function loadMusic(){
            return new Promise((resolve, reject) => {
                listener = new THREE.AudioListener();
                camera.add(listener);
                sound = new THREE.Audio(listener);
                new THREE.AudioLoader().load(CRYSTAL_ASSETS.music, buffer => {
                    sound.setBuffer(buffer);
                    sound.setLoop(false);
                    sound.setVolume(0.5);
                    sound.play();
                    analyser = new THREE.AudioAnalyser(sound, 32);
                    resolve();
                }, progress => {
                    if(progress && progress.total){
                        gsap.to(musicBtn, { opacity: 1 - progress.loaded / progress.total, duration: 1, ease: "power1.out" });
                    }
                }, reject);
            });
        }
        function beginPlayback(){
            time.t0 = time.elapsed;
            data = 0;
            playing = true;
            gsap.to(musicBtn, { opacity: 0, duration: 1, ease: "power1.out" });
        }
        function stopMusic(){
            if(sound && sound.isPlaying) sound.stop();
            playing = false;
            data = 0;
            angle.x = 0; angle.z = 0;
            resetMusicUI();
        }
        musicBtn.addEventListener("click", () => {
            musicBtn.disabled = true;
            if(analyser){
                sound.play();
                beginPlayback();
            }else{
                loadMusic().then(beginPlayback).catch(err => {
                    console.warn("Crystal heart: music failed to load", err);
                    resetMusicUI();
                });
            }
        });

        return {
            scene, camera,
            label: "Animated crystal heart",
            enter(){
                time.current = clock.getElapsedTime();      // no big time jump after being away
                camera.position.set(0, 0, 4.5);
            },
            leave(){ stopMusic(); },
            setMotion(f){ k = f; },
            update(){
                time.elapsed = clock.getElapsedTime();
                time.delta = Math.max(-60, Math.min(60, (time.current - time.elapsed) * 1000)) * k;

                if(analyser && playing){
                    time.t = time.elapsed - time.t0 + time.t1;
                    data = analyser.getAverageFrequency();
                    data *= data / 2000;
                    angle.x += time.delta * 0.001 * 0.63;
                    angle.z += time.delta * 0.001 * 0.39;
                    if(!sound.isPlaying){                    // the song just ended: glide the camera home
                        time.t1 = time.t;
                        musicBtn.disabled = false;
                        playing = false;
                        angle.x = 0; angle.z = 0;
                        const tl = gsap.timeline();
                        tl.to(camera.position, { x: 0, z: 4.5, duration: 4, ease: "expo.in" });
                        tl.to(musicBtn, { opacity: 1, duration: 1, ease: "power1.out" });
                    }else{
                        camera.position.x = Math.sin(angle.x) * P.a;
                        camera.position.z = Math.min(Math.max(Math.cos(angle.z) * P.c, 1.75), 6.5);
                    }
                }
                camera.lookAt(scene.position);

                heartMaterial.uniforms.uTime.value += time.delta * time.frequency * (1 + data * 0.2);
                snowMaterial.uniforms.uTime.value += time.delta * 0.0004 * (1 + data);
                if(model) model.rotation.y -= 0.0005 * time.delta * (1 + data);
                time.current = time.elapsed;
            },
            applyTheme(light){
                scene.background = new THREE.Color(light ? BG_LIGHT : 0x16000a);
                [heartMaterial, snowMaterial].forEach(m => {
                    m.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
                    m.uniforms.uLight.value = light ? 1 : 0;
                });
            }
        };
    }

    const FACTORIES = { particles: makeParticles, crystal: makeCrystal };

    /* renderer + loop */
    function createRenderer(){
        renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
        new ResizeObserver(() => { if(entered) resize(); }).observe(stageEl);
        if(reduceMotion.addEventListener){
            reduceMotion.addEventListener("change", () => { const s = scenes[active]; if(s) s.setMotion(motion()); });
        }
    }
    function resize(){
        if(!renderer) return;
        const w = stageEl.clientWidth, h = stageEl.clientHeight;
        if(!w || !h) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);                       // CSS sizes the canvas
        Object.keys(scenes).forEach(n => {
            scenes[n].camera.aspect = w / h;
            scenes[n].camera.updateProjectionMatrix();
        });
    }
    function frame(){
        if(!running) return;
        rafId = requestAnimationFrame(frame);
        const s = scenes[active];
        if(!s) return;
        s.update();
        renderer.render(s.scene, s.camera);
    }
    function start(){ if(!running){ running = true; rafId = requestAnimationFrame(frame); } }
    function stop(){ running = false; cancelAnimationFrame(rafId); }
    // run only while a Three.js scene is on screen and the browser tab is visible
    function sync(){ if(entered && !document.hidden) start(); else stop(); }

    function enter(name){
        const s = scenes[name];
        active = name;
        entered = true;
        threeCanvas.classList.add("active");
        threeCanvas.classList.toggle("drag", name === "particles");
        threeCanvas.setAttribute("aria-label", s.label);
        crystalText.classList.toggle("active", name === "crystal");
        musicBtn.classList.toggle("active", name === "crystal");
        s.applyTheme(isLight);                               // the theme may have changed while we were away
        s.setMotion(motion());
        s.enter();
        resize();
        sync();
    }

    function close(){
        token++;                                             // cancels a pending open()
        stop();
        entered = false;
        if(active && scenes[active]) scenes[active].leave();
        active = null;
        threeCanvas.classList.remove("active");
        crystalText.classList.remove("active");
        musicBtn.classList.remove("active");
        statusEl.classList.remove("active");
    }

    async function open(name){
        close();
        const my = ++token;
        statusEl.textContent = "Loading\u2026";
        statusEl.classList.add("active");
        try{
            await loadLibs();
            if(my !== token) return;                         // the user already moved on
            if(!renderer) createRenderer();
            if(!scenes[name]) scenes[name] = FACTORIES[name]();
            scenes[name].applyTheme(isLight);
        }catch(err){
            console.error(err);
            if(my === token) statusEl.textContent = "Couldn't start this scene. It needs an internet connection to load Three.js.";
            return;
        }
        if(my !== token) return;
        statusEl.classList.remove("active");
        enter(name);
    }

    function setTheme(light){
        isLight = light;
        Object.keys(scenes).forEach(n => scenes[n].applyTheme(light));
    }

    return { open, close, resize, setTheme, sync };
})();

// Navbar switching
const buttons = document.querySelectorAll(".nav_btn");
buttons.forEach(btn => {
    btn.addEventListener("click", () => {
        current = btn.dataset.scene;
        buttons.forEach(b => {
            const on = b === btn;
            b.classList.toggle("active", on);
            if(on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
        });
        const isText  = current === "text";
        const isThree = isThreeScene(current);        // Particles / Crystal (Three.js)
        const isGL    = !isText && !isThree;          // one of our own WebGL scenes
        uiEl.classList.toggle("active", isText);
        canvas.classList.toggle("active", isGL && !!GL);
        noteEl.classList.toggle("active", !isText && !GL);
        hintEl.classList.toggle("active", !!GL && ((isGL && !GL.scenes[current].noDrag) || current === "particles"));
        if(GL && isGL) GL.resize();
        if(GL) GL.sync();                       // our own 3D loop runs only on our own 3D scenes
        if(isThree && GL) TJS.open(current); else TJS.close();
    });
});

// Pause rendering while the tab is in the background
document.addEventListener("visibilitychange", () => { if(GL) GL.sync(); TJS.sync(); });

// Dark / light theme
const themeBtn = document.getElementById("theme_btn");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme){
    const light = theme === "light";
    document.documentElement.dataset.theme = theme;
    if(themeColorMeta) themeColorMeta.setAttribute("content", light ? "#fff5f9" : "#000000");
    if(GL) GL.setTheme(light);
    TJS.setTheme(light);
    themeBtn.setAttribute("aria-pressed", String(light));
    themeBtn.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    try{ localStorage.setItem("theme", theme); }catch(e){}
}
themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});
applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
