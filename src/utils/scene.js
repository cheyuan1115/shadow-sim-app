/**
 * Three.js 3D 光影場景
 * 支援兩個場景切換：台北101都市街道 / 台科大校園
 *
 * RN → WebView message：{ azimuth, altitude, month, lat, preset }
 */

export function generateSceneHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:100%; height:100%; background:#0D1117; overflow:hidden; }
    canvas { display:block; width:100%; height:100%; }
    #loading {
      position:absolute; inset:0; display:flex; align-items:center;
      justify-content:center; background:#0D1117; color:#6A8A6A;
      font:15px -apple-system,sans-serif; flex-direction:column; gap:10px; z-index:10;
    }
    #hint {
      position:absolute; bottom:10px; left:50%; transform:translateX(-50%);
      color:rgba(255,255,255,0.4); font:11px -apple-system,sans-serif;
      pointer-events:none; transition:opacity 1s;
    }
  </style>
</head>
<body>
  <div id="loading"><div style="font-size:36px">🏙</div><div>載入場景中...</div></div>
  <canvas id="c"></canvas>
  <div id="hint">拖曳旋轉視角</div>
  <script src="https://unpkg.com/three@0.150.0/build/three.min.js"></script>
  <script>
  (function() {
    const DEG = Math.PI / 180;

    // ── Renderer ──────────────────────────────────────────────
    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById('loading').style.display = 'none';
    setTimeout(() => { document.getElementById('hint').style.opacity = '0'; }, 3000);

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xA8C4DC, 0.007);

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 800);
    let camTheta = DEG * 40, camPhi = DEG * 55;
    let camRadius = 65, camTarget = new THREE.Vector3(0, 8, 0);

    function updateCamera() {
      camera.position.set(
        camTarget.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta),
        camTarget.y + camRadius * Math.cos(camPhi),
        camTarget.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
      );
      camera.lookAt(camTarget);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'camera', theta: camTheta}));
      }
    }
    updateCamera();

    // ── Touch: 1-finger orbit, 2-finger pinch zoom + pan ─────
    let drag = null, pinchDist = null, pinchMid = null;
    let touchStartPos = null, touchStartTime = 0;
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchStartTime = Date.now();
        pinchDist = null; pinchMid = null;
      } else if (e.touches.length === 2) {
        drag = null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDist = Math.sqrt(dx*dx + dy*dy);
        pinchMid = { x: (e.touches[0].clientX+e.touches[1].clientX)/2,
                     y: (e.touches[0].clientY+e.touches[1].clientY)/2 };
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && drag) {
        const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
        camTheta -= dx * 0.007;
        camPhi = Math.max(0.10, Math.min(1.48, camPhi + dy * 0.007));
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCamera();
      } else if (e.touches.length === 2 && pinchDist !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const newDist = Math.sqrt(dx*dx + dy*dy);
        const scale = pinchDist / newDist;
        const minR = currentPreset === 'indoor' ? 4 : 15;
        const maxR = currentPreset === 'indoor' ? 20 : (currentPreset === 'ntust' ? 500 : (currentPreset === 'custom' ? 300 : 120));
        camRadius = Math.max(minR, Math.min(maxR, camRadius * scale));
        // Pan with midpoint
        const newMid = { x: (e.touches[0].clientX+e.touches[1].clientX)/2,
                         y: (e.touches[0].clientY+e.touches[1].clientY)/2 };
        if (pinchMid) {
          const mdx = newMid.x - pinchMid.x, mdy = newMid.y - pinchMid.y;
          const speed = camRadius * 0.002;
          const right = new THREE.Vector3(Math.cos(camTheta), 0, -Math.sin(camTheta));
          const forward = new THREE.Vector3(-Math.sin(camTheta), 0, -Math.cos(camTheta));
          camTarget.addScaledVector(right, -mdx * speed);
          camTarget.addScaledVector(forward, mdy * speed);
        }
        pinchDist = newDist;
        pinchMid = newMid;
        updateCamera();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (e.touches.length === 0) {
        if (currentPreset === 'custom' && touchStartPos) {
          var elapsed = Date.now() - touchStartTime;
          var cx = e.changedTouches[0].clientX, cy = e.changedTouches[0].clientY;
          var moveDist = Math.sqrt(Math.pow(cx - touchStartPos.x, 2) + Math.pow(cy - touchStartPos.y, 2));
          if (elapsed < 300 && moveDist < 10) {
            var raycaster = new THREE.Raycaster();
            var mouse = new THREE.Vector2(
              (cx / window.innerWidth) * 2 - 1,
              -(cy / window.innerHeight) * 2 + 1
            );
            raycaster.setFromCamera(mouse, camera);
            // Check building hits first
            var bldgMeshes = [];
            var bIds = Object.keys(customBuildingMeshes);
            for (var bi = 0; bi < bIds.length; bi++) {
              customBuildingMeshes[bIds[bi]].traverse(function(child) {
                if (child.isMesh && child.userData.buildingId !== undefined) bldgMeshes.push(child);
              });
            }
            var bHits = raycaster.intersectObjects(bldgMeshes);
            if (bHits.length > 0) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'buildingTap', id: bHits[0].object.userData.buildingId }));
            } else if (customGround) {
              var gHits = raycaster.intersectObject(customGround);
              if (gHits.length > 0) {
                var pt = gHits[0].point;
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'groundTap', x: Math.round(pt.x), z: Math.round(pt.z) }));
              }
            }
          }
        }
        drag = null; pinchDist = null; pinchMid = null; touchStartPos = null;
      }
      else if (e.touches.length === 1) {
        drag = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        pinchDist = null; pinchMid = null;
      }
    });

    // ── Lighting ──────────────────────────────────────────────
    const sunLight = new THREE.DirectionalLight(0xFFF5DC, 1.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 600;
    sunLight.shadow.camera.left = -55; sunLight.shadow.camera.right = 55;
    sunLight.shadow.camera.top = 55; sunLight.shadow.camera.bottom = -55;
    sunLight.shadow.bias = -0.0006;
    scene.add(sunLight); scene.add(sunLight.target);

    const hemi = new THREE.HemisphereLight(0x9ABCD0, 0xC8B490, 0.6);
    scene.add(hemi);

    // ── Sun sphere ────────────────────────────────────────────
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xFFE055 }));
    sunMesh.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xFFCC00, transparent: true, opacity: 0.22 })));
    scene.add(sunMesh);

    // ── Sky gradient sphere ─────────────────────────────────
    var skyGeo = new THREE.SphereGeometry(350, 32, 16);
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xC8DCF0) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
        '  vWorldPosition = worldPos.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 bottomColor;',
        'uniform float offset;',
        'uniform float exponent;',
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  float h = normalize(vWorldPosition + offset).y;',
        '  gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);',
        '}'
      ].join('\\n'),
      side: THREE.BackSide
    });
    var skyMesh2 = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh2);

    // ── Helpers ───────────────────────────────────────────────
    function sunDir(az, alt) {
      return { x: Math.sin(az)*Math.cos(alt), y: Math.sin(alt), z: -Math.cos(az)*Math.cos(alt) };
    }

    function calcSunInline(hour, month, day, lat) {
      var dm = [0,31,28,31,30,31,30,31,31,30,31,30,31];
      var N = day;
      for (var i = 1; i < month; i++) N += dm[i];
      var dec = 23.45 * Math.sin(DEG * (360/365) * (284+N));
      var ha = (hour - 12) * 15;
      var sinAlt = Math.sin(DEG*lat)*Math.sin(DEG*dec) + Math.cos(DEG*lat)*Math.cos(DEG*dec)*Math.cos(DEG*ha);
      var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
      var cosAlt = Math.cos(DEG * alt);
      var az = 180;
      if (cosAlt > 0.0001) {
        var cosAzS = (Math.sin(DEG*dec) - Math.sin(DEG*lat)*sinAlt) / (Math.cos(DEG*lat)*cosAlt);
        var azFS = Math.acos(Math.max(-1, Math.min(1, cosAzS))) / DEG;
        az = ha > 0 ? 360 - azFS : azFS;
        az = ((az % 360) + 360) % 360;
      }
      return { alt: alt, az: az };
    }

    function addBox(parent, x, y, z, w, h, d, mat, shadow = true) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (shadow) { m.castShadow = true; m.receiveShadow = true; }
      parent.add(m); return m;
    }

    function addCylinder(parent, x, y, z, rt, rb, h, seg, mat) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    }

    function textLabel(text, w, h) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const ctx = cv.getContext('2d');
      ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    }

    function compassLabel(text, x, z, rotZ) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
      const ctx = cv.getContext('2d');
      ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 32);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ || 0;
      m.position.set(x, 0.05, z); return m;
    }

    function addTree(parent, x, z) {
      const matT = new THREE.MeshLambertMaterial({ color: 0x7A5828 });
      const matL1 = new THREE.MeshLambertMaterial({ color: 0x3A6820 });
      const matL2 = new THREE.MeshLambertMaterial({ color: 0x285018 });
      const th = 1.0 + Math.random() * 0.6;
      addCylinder(parent, x, th/2, z, 0.11, 0.17, th, 6, matT);
      const ch = 1.6 + Math.random() * 0.5;
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.85, ch, 7), matL1);
      c1.position.set(x, th + ch*0.5, z); c1.castShadow = true; parent.add(c1);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.6, ch*0.65, 7), matL2);
      c2.position.set(x, th + ch*0.85, z); c2.castShadow = true; parent.add(c2);
    }

    function addWindowBand(parent, bx, bz, bw, bd, y, mat) {
      [[0, bd/2+0.02, 0],[0,-bd/2-0.02,Math.PI],[bw/2+0.02,0,Math.PI/2],[-bw/2-0.02,0,-Math.PI/2]].forEach(([ox,oz,ry]) => {
        const ww = oz !== 0 ? bw*0.72 : bd*0.72;
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(ww, 0.7), mat);
        wm.position.set(bx+ox, y, bz+oz); wm.rotation.y = ry; parent.add(wm);
      });
    }

    // ── Scene objects container ───────────────────────────────
    const group101   = new THREE.Group(); scene.add(group101);
    const groupNTUST = new THREE.Group(); scene.add(groupNTUST);
    const groupIndoor = new THREE.Group(); scene.add(groupIndoor);
    groupNTUST.visible  = false;
    groupIndoor.visible = false;
    const groupCustom = new THREE.Group(); scene.add(groupCustom);
    groupCustom.visible = false;
    let MAIN_H_REF = 38;

    // ════════════════════════════════════════════════════════════
    // 場景A：台北101 都市街道
    // ════════════════════════════════════════════════════════════
    function buildTaipei101() {
      const g = group101;

      const matGnd  = new THREE.MeshLambertMaterial({ color: 0xC0AC90 });
      const matRoad = new THREE.MeshLambertMaterial({ color: 0x686860 });
      const matSW   = new THREE.MeshLambertMaterial({ color: 0xA89878 });
      const matRoof = new THREE.MeshLambertMaterial({ color: 0x7A8888 });
      const matWin  = new THREE.MeshLambertMaterial({ color: 0x607888, transparent:true, opacity:0.75 });
      const matBldg = [0xE8DDD0,0xDED2C0,0xD8CAB8,0xE4D8C8,0xCEC2B2].map(c => new THREE.MeshLambertMaterial({color:c}));

      // 地面
      const gnd = new THREE.Mesh(new THREE.PlaneGeometry(80,80), matGnd);
      gnd.rotation.x = -Math.PI/2; gnd.receiveShadow = true; g.add(gnd);

      // 道路
      [[0,-3.5,80,3.0],[0,3.5,80,3.0],[-3.5,0,3.0,80],[3.5,0,3.0,80],[0,0,3.0,3.0]].forEach(([x,z,w,d]) => {
        const r = new THREE.Mesh(new THREE.PlaneGeometry(w,d), matRoad);
        r.rotation.x = -Math.PI/2; r.position.set(x,0.01,z); r.receiveShadow=true; g.add(r);
      });
      // 人行道
      [[0,-2.0,80,0.8],[0,2.0,80,0.8],[-2.0,0,0.8,80],[2.0,0,0.8,80]].forEach(([x,z,w,d]) => {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(w,d), matSW);
        s.rotation.x = -Math.PI/2; s.position.set(x,0.02,z); s.receiveShadow=true; g.add(s);
      });

      // 配樓（8棟）
      [{x:-7,z:-7,h:5.5,mi:0},{x:0,z:-7,h:8.0,mi:1},{x:7,z:-7,h:4.5,mi:2},
       {x:-7,z:0,h:9.5,mi:3},{x:7,z:0,h:7.0,mi:1},
       {x:-7,z:7,h:4.5,mi:2},{x:0,z:7,h:6.0,mi:0},{x:7,z:7,h:5.5,mi:3}
      ].forEach(b => {
        addBox(g, b.x, b.h/2, b.z, 3.8, b.h, 3.8, matBldg[b.mi]);
        addBox(g, b.x, b.h+0.15, b.z, 3.95, 0.3, 3.95, matRoof);
        const floors = Math.floor(b.h/2.8);
        for (let f=1; f<=floors; f++) addWindowBand(g, b.x, b.z, 3.8, 3.8, (f/(floors+1))*b.h, matWin);
      });

      // 台北101主塔
      const mat101  = new THREE.MeshLambertMaterial({ color: 0x5A8878 });
      const mat101L = new THREE.MeshLambertMaterial({ color: 0x4A7868 });
      const mat101W = new THREE.MeshLambertMaterial({ color: 0x8ABCB0, transparent:true, opacity:0.7 });
      const matPod  = new THREE.MeshLambertMaterial({ color: 0x8A9090 });
      const matSp   = new THREE.MeshLambertMaterial({ color: 0xCCCCBB });

      addBox(g, 0, 1.5, 0, 7.5, 3.0, 7.5, matPod);  // 裙樓
      const segs = [{w:4.5,h:4.0},{w:4.1,h:4.0},{w:3.7,h:3.8},{w:3.3,h:3.8},
                    {w:3.0,h:3.5},{w:2.7,h:3.5},{w:2.4,h:3.2},{w:2.0,h:3.2}];
      let yb = 3.0;
      segs.forEach((s,i) => {
        addBox(g, 0, yb+(s.h-0.4)/2, 0, s.w, s.h-0.4, s.w, i%2===0 ? mat101 : mat101L);
        addBox(g, 0, yb+0.175, 0, s.w+0.5, 0.35, s.w+0.5, mat101L);
        const rows = Math.floor((s.h-0.4)/1.4);
        for (let r=1; r<=rows; r++) {
          [0,Math.PI/2,Math.PI,Math.PI*1.5].forEach(ry => {
            const wm = new THREE.Mesh(new THREE.PlaneGeometry(s.w*0.75, 0.65), mat101W);
            wm.position.set(Math.sin(ry)*(s.w/2+0.01), yb+(r/(rows+1))*(s.h-0.4), -Math.cos(ry)*(s.w/2+0.01));
            wm.rotation.y = ry; g.add(wm);
          });
        }
        yb += s.h;
      });
      addCylinder(g, 0, yb+1.0, 0, 0.25, 0.35, 2.0, 8, matSp);
      addCylinder(g, 0, yb+6.0, 0, 0.04, 0.22, 8.0, 8, matSp);
      const lbl = textLabel('TAIPEI 101', 4.5, 1.1);
      lbl.position.set(0, yb+12, 3.5); g.add(lbl);

      // 樹木
      [[-5,-5],[5,-5],[-5,5],[5,5],[-14,-14],[14,-14],[-14,14],[14,14],
       [-14,0],[14,0],[0,-14],[0,14]].forEach(([x,z]) => addTree(g, x, z));

      // 羅盤
      g.add(compassLabel('N 北', 0,-24)); g.add(compassLabel('S 南', 0,24));
      g.add(compassLabel('E 東',24,0,Math.PI/2)); g.add(compassLabel('W 西',-24,0,Math.PI/2));
    }

    // ════════════════════════════════════════════════════════════
    // 場景B：台科大校園（由編輯器產生）
    // ════════════════════════════════════════════════════════════
    function buildNTUST() {
      const g = groupNTUST;
      g.rotation.y = -Math.PI * 0.25;

      const matGnd   = new THREE.MeshLambertMaterial({color:0xC8C090});
      const matPath  = new THREE.MeshLambertMaterial({color:0xB8B080});
      const matRoad  = new THREE.MeshLambertMaterial({color:0x888078});
      const matTrack = new THREE.MeshLambertMaterial({color:0xA04838});
      const matCourt = new THREE.MeshLambertMaterial({color:0x8B4A30});
      const matCourtLine = new THREE.MeshLambertMaterial({color:0x2A5E2A});
      const matGrass = new THREE.MeshLambertMaterial({color:0x3A6828});
      const matRoof  = new THREE.MeshLambertMaterial({color:0x7A7870});
      const matTR  = new THREE.MeshLambertMaterial({color:0xC89858});
      const matT1  = new THREE.MeshLambertMaterial({color:0x9AB0C0});
      const matAU  = new THREE.MeshLambertMaterial({color:0xB89060});
      const matRB  = new THREE.MeshLambertMaterial({color:0xB8A080});
      const matLib = new THREE.MeshLambertMaterial({color:0xD8C080});
      const matT4  = new THREE.MeshLambertMaterial({color:0xAA9068});
      const matE1  = new THREE.MeshLambertMaterial({color:0x90A098});
      const matWin = new THREE.MeshLambertMaterial({color:0x4868A0,transparent:true,opacity:0.75});

      // Ground
      const gnd = new THREE.Mesh(new THREE.PlaneGeometry(200, 300), matGnd);
      gnd.rotation.x = -Math.PI/2; gnd.position.set(30, 0, 20);
      gnd.receiveShadow = true; g.add(gnd);

      // Road
      const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 200), matRoad);
      road.rotation.x = -Math.PI/2; road.position.set(-15, 0.01, 20);
      road.receiveShadow = true; g.add(road);

      // Walkways
      [[0,0.01,5,50,4],[12,0.01,25,4,40],[8,0.01,50,4,40]].forEach(([x,y,z,w,d])=>{
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w,d), matPath);
        p.rotation.x = -Math.PI/2; p.position.set(x,y,z); p.receiveShadow = true; g.add(p);
      });

      // Running Track (rounded stadium shape)
      function makeTrackShape(w, d) {
        const r = w/2, s = new THREE.Shape();
        s.moveTo(-d/2+r, -w/2);
        s.lineTo(d/2-r, -w/2);
        s.absarc(d/2-r, 0, w/2, -Math.PI/2, Math.PI/2, false);
        s.lineTo(-d/2+r, w/2);
        s.absarc(-d/2+r, 0, w/2, Math.PI/2, Math.PI*3/2, false);
        return s;
      }
      const trkOuter = new THREE.Mesh(new THREE.ShapeGeometry(makeTrackShape(45,80)), matTrack);
      trkOuter.rotation.set(-Math.PI/2, 0, Math.PI/2); trkOuter.position.set(19, 0.02, -2);
      trkOuter.receiveShadow = true; g.add(trkOuter);
      const trkInner = new THREE.Mesh(new THREE.ShapeGeometry(makeTrackShape(30,60)), matGrass);
      trkInner.rotation.set(-Math.PI/2, 0, Math.PI/2); trkInner.position.set(18.5, 0.03, -0.5);
      trkInner.receiveShadow = true; g.add(trkInner);

      // Basketball Courts
      [-28,-15,18.5].forEach(lz => {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), matCourt);
        c.rotation.x = -Math.PI/2; c.position.set(59, 0.02, lz);
        c.receiveShadow = true; g.add(c);
        const cl = new THREE.Mesh(new THREE.PlaneGeometry(29, 8.5), matCourtLine);
        cl.rotation.x = -Math.PI/2; cl.position.set(59, 0.03, lz);
        cl.receiveShadow = true; g.add(cl);
      });

      // TR
      addBox(g, 40.5, 16.5, -50.5, 90, 33, 20, matTR);
      addBox(g, 40.5, 33.3, -50.5, 91.5, 0.6, 21.5, matRoof);
      [5,9,14,18,23,27,32].forEach(y => addWindowBand(g,40.5,-50.5,90,20,y,matWin));
      const trLbl = textLabel('研揚大樓 TR', 8, 2); trLbl.position.set(40.5,35,-50.5); g.add(trLbl);

      // T1
      addBox(g, 22, 5, 47, 50, 10, 15, matT1);
      addBox(g, 22, 10.3, 47, 51.5, 0.6, 16.5, matRoof);
      [3,6,9].forEach(y => addWindowBand(g,22,47,50,15,y,matWin));
      const t1Lbl = textLabel('T1', 4, 1.5); t1Lbl.position.set(22,12,47); g.add(t1Lbl);

      // AU
      addBox(g, 35, 3, 72, 8, 6, 8, matAU);
      addBox(g, 35, 6.3, 72, 9.5, 0.6, 9.5, matRoof);
      [3].forEach(y => addWindowBand(g,35,72,8,8,y,matWin));
      const auLbl = textLabel('視聽館 AU', 5, 1.5); auLbl.position.set(35,8,72); g.add(auLbl);

      // T4
      addBox(g, 51.5, 5, 82, 15, 10, 42, matT4);
      addBox(g, 51.5, 10.3, 82, 16.5, 0.6, 43.5, matRoof);
      [3,6,9].forEach(y => addWindowBand(g,51.5,82,15,42,y,matWin));
      const t4Lbl = textLabel('T4', 4, 1.5); t4Lbl.position.set(51.5,12,82); g.add(t4Lbl);

      // RB（8F 建築系）
      addBox(g, 18.5, 10, 73.5, 17, 20, 31, matRB);
      addBox(g, 18.5, 20.3, 73.5, 18.5, 0.6, 32.5, matRoof);
      [4,8,12,16].forEach(y => addWindowBand(g,18.5,73.5,17,31,y,matWin));
      // 8F 建築系發光標示帶（暖橘色光帶環繞頂層）
      var matGlow = new THREE.MeshBasicMaterial({color:0xFFAA44, transparent:true, opacity:0.6});
      [[0,31/2+0.02,0],[0,-31/2-0.02,Math.PI],[17/2+0.02,0,Math.PI/2],[-17/2-0.02,0,-Math.PI/2]].forEach(function(f){
        var glow = new THREE.Mesh(new THREE.PlaneGeometry(f[2]===Math.PI/2||f[2]===-Math.PI/2?31:17, 2.5), matGlow);
        glow.position.set(18.5+f[0], 19, 73.5+f[1]); glow.rotation.y = f[2]; g.add(glow);
      });
      var matGlowEdge = new THREE.LineBasicMaterial({color:0xFFAA44, transparent:true, opacity:0.8});
      var glowPts = [new THREE.Vector3(18.5-17/2,20.2,73.5-31/2),new THREE.Vector3(18.5+17/2,20.2,73.5-31/2),
        new THREE.Vector3(18.5+17/2,20.2,73.5+31/2),new THREE.Vector3(18.5-17/2,20.2,73.5+31/2),new THREE.Vector3(18.5-17/2,20.2,73.5-31/2)];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(glowPts), matGlowEdge));
      const rbLbl = textLabel('RB', 4, 1.5); rbLbl.position.set(18.5,22,73.5); g.add(rbLbl);

      // Library
      addBox(g, 25.5, 5, 97, 30, 10, 15, matLib);
      addBox(g, 25.5, 10.3, 97, 31.5, 0.6, 16.5, matRoof);
      [3,6,9].forEach(y => addWindowBand(g,25.5,97,30,15,y,matWin));
      const libLbl = textLabel('圖書館', 5, 1.5); libLbl.position.set(25.5,12,97); g.add(libLbl);

      // E1
      addBox(g, 69, 4.25, 82, 8, 8.5, 42, matE1);
      addBox(g, 69, 8.8, 82, 9.5, 0.6, 43.5, matRoof);
      [3,6].forEach(y => addWindowBand(g,69,82,8,42,y,matWin));
      const e1Lbl = textLabel('E1', 4, 1.5); e1Lbl.position.set(69,10,82); g.add(e1Lbl);

      // Trees
      [[-5,-45],[-5,-25],[-5,0],[5,-50],[-8,20],
       [-8,10],[20,55],[45,55],[35,60],[2,75],[18,80],
       [2,58],[28,70],[-8,35],[-8,55],[0,90],[15,90]].forEach(([x,z])=>addTree(g,x,z));

      // Fence (沿道路內側)
      const matFence = new THREE.MeshLambertMaterial({color:0x666660});
      for (let lz = -60; lz <= 100; lz += 5) addBox(g, -18, 1.2, lz, 0.3, 2.4, 0.3, matFence, false);
      const railGeo = new THREE.BoxGeometry(0.15, 0.15, 165);
      const rail1 = new THREE.Mesh(railGeo, matFence); rail1.position.set(-18, 2.2, 20); g.add(rail1);
      const rail2 = new THREE.Mesh(railGeo, matFence); rail2.position.set(-18, 0.8, 20); g.add(rail2);

      // Gate (校門口)
      const matGate = new THREE.MeshLambertMaterial({color:0x888880});
      addBox(g, -18, 2.5, -12, 0.5, 5, 1, matGate, false);
      addBox(g, -18, 2.5, -4, 0.5, 5, 1, matGate, false);
      addBox(g, -18, 4.8, -8, 0.3, 0.6, 9, matGate, false);

      // Taxi
      const taxi = new THREE.Group();
      addBox(taxi,0,0.6,0,2.5,1.2,1.2,new THREE.MeshLambertMaterial({color:0xFFCC00}));
      taxi.position.set(-12, 0, -10); g.add(taxi);
    }

    // ════════════════════════════════════════════════════════════
    // 場景C：室內採光
    // ════════════════════════════════════════════════════════════
    function buildIndoor() {
      const g = groupIndoor;

      const matWall  = new THREE.MeshLambertMaterial({ color: 0xEEE8DE, side: THREE.DoubleSide });
      const matFloor = new THREE.MeshLambertMaterial({ color: 0xD4C6A8 });
      const matGnd   = new THREE.MeshLambertMaterial({ color: 0x848478 });
      const matGlass = new THREE.MeshLambertMaterial({ color: 0x88AABB, transparent:true, opacity:0.18, side:THREE.DoubleSide });
      const matPerson= new THREE.MeshLambertMaterial({ color: 0x8090A8 });

      // 室外地面（延伸夠遠，覆蓋相機所在位置）
      const extGnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), matGnd);
      extGnd.rotation.x = -Math.PI/2; extGnd.position.set(0, 0, 7);
      extGnd.receiveShadow = true; g.add(extGnd);

      // 室內地板（含格線幫助判斷進深）
      const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 6.0), matFloor);
      floorMesh.rotation.x = -Math.PI/2; floorMesh.position.set(0, 0.01, -3);
      floorMesh.receiveShadow = true; g.add(floorMesh);
      const grid = new THREE.GridHelper(6, 6, 0xB8A888, 0xC8B898);
      grid.position.set(0, 0.02, -3); g.add(grid);

      // 四面牆 + 天花板（完整封閉，陽光只從窗口進入）
      addBox(g, 0, 3.05, -3, 8.0, 0.1, 6.0, matWall);   // 天花板
      addBox(g, 0, 1.5, -6.05, 8.0, 3.0, 0.1, matWall); // 後牆
      addBox(g, -4.05, 1.5, -3, 0.1, 3.0, 6.0, matWall); // 左牆
      addBox(g,  4.05, 1.5, -3, 0.1, 3.0, 6.0, matWall); // 右牆

      // 前牆（窗戶牆 z=0）— 窗口開口 x:-3~+3, y:0.9~2.7
      addBox(g, -3.5, 1.5, 0.05, 1.0, 3.0, 0.1, matWall); // 左段
      addBox(g,  3.5, 1.5, 0.05, 1.0, 3.0, 0.1, matWall); // 右段
      addBox(g,  0,  0.45, 0.05, 6.0, 0.9, 0.1, matWall); // 窗台
      addBox(g,  0,  2.85, 0.05, 6.0, 0.3, 0.1, matWall); // 窗頂樑

      // 玻璃
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.8), matGlass);
      glass.position.set(0, 1.8, 0.06); g.add(glass);

      // 窗框橘色線
      const winGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(6.0, 1.8, 0.05));
      const winEdge = new THREE.LineSegments(winGeo,
        new THREE.LineBasicMaterial({ color: 0xFFAA44, transparent:true, opacity:0.9 }));
      winEdge.position.set(0, 1.8, 0.06); g.add(winEdge);

      // 人形比例參考（站在窗邊 1.7m高）
      addBox(g, 2.5, 0.85, -1.0, 0.35, 1.7, 0.35, matPerson);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), matPerson);
      head.position.set(2.5, 1.85, -1.0);
      head.castShadow = true; head.receiveShadow = true;
      g.add(head);
    }

    // ════════════════════════════════════════════════════════════
    // 場景D：自訂建築模式
    // ════════════════════════════════════════════════════════════
    let customGround = null;
    let customBuildingMeshes = {};
    var analysisGroup = null;
    var spacingLine = null;

    function buildCustom() {
      const g = groupCustom;

      const matGnd = new THREE.MeshLambertMaterial({ color: 0xC8C0A8 });
      customGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matGnd);
      customGround.rotation.x = -Math.PI / 2;
      customGround.receiveShadow = true;
      g.add(customGround);

      var gridH = new THREE.GridHelper(200, 20, 0x888878, 0xAAA898);
      gridH.position.set(0, 0.01, 0);
      g.add(gridH);

      g.add(compassLabel('N 北', 0, -105));
      g.add(compassLabel('S 南', 0, 105));
      g.add(compassLabel('E 東', 105, 0, Math.PI / 2));
      g.add(compassLabel('W 西', -105, 0, Math.PI / 2));

      // Ground texture areas
      var matGrassLight = new THREE.MeshLambertMaterial({color: 0x5A8A48});
      var matGrassDark = new THREE.MeshLambertMaterial({color: 0x4A7838});
      var matAsphalt = new THREE.MeshLambertMaterial({color: 0x606060});
      var matTile = new THREE.MeshLambertMaterial({color: 0xB8B0A0});

      // Central grass area
      var grass1 = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), matGrassLight);
      grass1.rotation.x = -Math.PI/2; grass1.position.set(-30, 0.02, 0);
      grass1.receiveShadow = true; g.add(grass1);

      // Road crossing
      var road1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 200), matAsphalt);
      road1.rotation.x = -Math.PI/2; road1.position.set(0, 0.015, 0);
      road1.receiveShadow = true; g.add(road1);
      var road2 = new THREE.Mesh(new THREE.PlaneGeometry(200, 6), matAsphalt);
      road2.rotation.x = -Math.PI/2; road2.position.set(0, 0.015, 0);
      road2.receiveShadow = true; g.add(road2);

      // Tile plaza in center
      var tile = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), matTile);
      tile.rotation.x = -Math.PI/2; tile.position.set(30, 0.02, 30);
      tile.receiveShadow = true; g.add(tile);

      var scaleMat = new THREE.MeshBasicMaterial({ color: 0x999990, transparent: true, opacity: 0.6 });
      for (var si = -100; si <= 100; si += 20) {
        if (si === 0) continue;
        var cv1 = document.createElement('canvas'); cv1.width = 128; cv1.height = 32;
        var cx1 = cv1.getContext('2d');
        cx1.font = '18px sans-serif'; cx1.fillStyle = 'rgba(255,255,255,0.5)';
        cx1.textAlign = 'center'; cx1.textBaseline = 'middle';
        cx1.fillText(Math.abs(si) + 'm', 64, 16);
        var tex1 = new THREE.CanvasTexture(cv1);
        var lm1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex1, transparent: true, depthWrite: false }));
        lm1.rotation.x = -Math.PI / 2; lm1.position.set(si, 0.02, -103); g.add(lm1);
        var lm2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex1, transparent: true, depthWrite: false }));
        lm2.rotation.x = -Math.PI / 2; lm2.rotation.z = Math.PI / 2; lm2.position.set(-103, 0.02, si); g.add(lm2);
      }
    }

    var customBuildingColors = [0xC8B8A0, 0xB0A890, 0xD0C0A0, 0xA8B8C0, 0xC0A880];

    function setCustomBuildings(buildings) {
      // Remove old
      var oldIds = Object.keys(customBuildingMeshes);
      for (var oi = 0; oi < oldIds.length; oi++) {
        var oldGroup = customBuildingMeshes[oldIds[oi]];
        groupCustom.remove(oldGroup);
      }
      customBuildingMeshes = {};

      if (!buildings || !buildings.length) return;

      var matWin = new THREE.MeshLambertMaterial({ color: 0x607888, transparent: true, opacity: 0.75 });
      var matRoof = new THREE.MeshLambertMaterial({ color: 0x7A8888 });

      for (var bi = 0; bi < buildings.length; bi++) {
        var b = buildings[bi];
        var bg = new THREE.Group();
        var colorIdx = bi % customBuildingColors.length;
        var matBody = new THREE.MeshLambertMaterial({ color: customBuildingColors[colorIdx] });

        var body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), matBody);
        body.position.set(b.x, b.h / 2, b.z);
        body.castShadow = true; body.receiveShadow = true;
        body.userData.buildingId = b.id;
        bg.add(body);

        var roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.2, 0.3, b.d + 0.2), matRoof);
        roof.position.set(b.x, b.h + 0.15, b.z);
        roof.castShadow = true;
        bg.add(roof);

        var floors = Math.floor(b.h / 3);
        for (var fi = 1; fi <= floors; fi++) {
          addWindowBand(bg, b.x, b.z, b.w, b.d, (fi / (floors + 1)) * b.h, matWin);
        }

        var lblCv = document.createElement('canvas'); lblCv.width = 128; lblCv.height = 48;
        var lblCtx = lblCv.getContext('2d');
        lblCtx.font = 'bold 28px sans-serif'; lblCtx.fillStyle = 'rgba(255,255,255,0.85)';
        lblCtx.textAlign = 'center'; lblCtx.textBaseline = 'middle';
        lblCtx.fillText(b.h + 'm', 64, 24);
        var lblMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lblCv), transparent: true, depthWrite: false }));
        lblMesh.position.set(b.x, b.h + 2, b.z);
        bg.add(lblMesh);

        // CAD-style dimension annotations
        var dimMat = new THREE.LineBasicMaterial({color: 0xFF6644, transparent: true, opacity: 0.6});
        var hPts = [
          new THREE.Vector3(b.x + b.w/2 + 1, 0, b.z + b.d/2 + 1),
          new THREE.Vector3(b.x + b.w/2 + 1, b.h, b.z + b.d/2 + 1)
        ];
        var hLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPts), dimMat);
        bg.add(hLine);
        // Width tick at bottom
        var wPts = [
          new THREE.Vector3(b.x - b.w/2, 0.1, b.z + b.d/2 + 1.5),
          new THREE.Vector3(b.x + b.w/2, 0.1, b.z + b.d/2 + 1.5)
        ];
        var wLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(wPts), dimMat);
        bg.add(wLine);
        // Width label
        var wLblCv = document.createElement('canvas'); wLblCv.width = 128; wLblCv.height = 48;
        var wCtx = wLblCv.getContext('2d');
        wCtx.font = 'bold 24px sans-serif'; wCtx.fillStyle = 'rgba(255,100,68,0.85)';
        wCtx.textAlign = 'center'; wCtx.textBaseline = 'middle';
        wCtx.fillText(b.w + 'm', 64, 24);
        var wLbl = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1),
          new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(wLblCv), transparent: true, depthWrite: false}));
        wLbl.position.set(b.x, 1.5, b.z + b.d/2 + 1.5);
        bg.add(wLbl);

        groupCustom.add(bg);
        customBuildingMeshes[b.id] = bg;
      }
    }

    function selectCustomBuilding(id) {
      var ids = Object.keys(customBuildingMeshes);
      for (var si = 0; si < ids.length; si++) {
        var grp = customBuildingMeshes[ids[si]];
        grp.children.forEach(function(child) {
          if (child.material && child.material.emissive) {
            child.material.emissive.setHex(ids[si] === String(id) ? 0x333322 : 0x000000);
          }
        });
      }
    }

    function analyzeSunlight(lat) {
      if (analysisGroup) { groupCustom.remove(analysisGroup); }
      analysisGroup = new THREE.Group();

      var buildingMeshes = [];
      var ids = Object.keys(customBuildingMeshes);
      for (var i = 0; i < ids.length; i++) {
        var grp = customBuildingMeshes[ids[i]];
        grp.traverse(function(child) {
          if (child.isMesh && child.userData && child.userData.buildingId) {
            buildingMeshes.push(child);
          }
        });
      }

      if (buildingMeshes.length === 0) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'analysisComplete', maxHours:'0'}));
        }
        return;
      }

      var gridSize = 80;
      var gridRes = 16;
      var cellSize = gridSize / gridRes;

      var sampleDays = [
        {month:12, day:21},
        {month:3, day:20},
        {month:6, day:21},
        {month:9, day:23}
      ];

      var raycaster = new THREE.Raycaster();
      var maxHours = 0;
      var results = [];

      for (var gx = 0; gx < gridRes; gx++) {
        for (var gz = 0; gz < gridRes; gz++) {
          var px = (gx - gridRes/2 + 0.5) * cellSize;
          var pz = (gz - gridRes/2 + 0.5) * cellSize;
          var totalHours = 0;

          for (var di = 0; di < sampleDays.length; di++) {
            for (var h = 5; h <= 19; h += 0.5) {
              var s = calcSunInline(h, sampleDays[di].month, sampleDays[di].day, lat);
              if (s.alt <= 1) continue;
              var sd = sunDir(s.az * DEG, s.alt * DEG);
              var dir = new THREE.Vector3(sd.x, sd.y, sd.z).normalize();
              raycaster.set(new THREE.Vector3(px, 0.5, pz), dir);
              raycaster.far = 500;
              var hits = raycaster.intersectObjects(buildingMeshes);
              if (hits.length === 0) {
                totalHours += 0.5;
              }
            }
          }
          totalHours /= sampleDays.length;
          if (totalHours > maxHours) maxHours = totalHours;
          results.push({x: px, z: pz, hours: totalHours});
        }
      }

      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        var t = maxHours > 0 ? r.hours / maxHours : 1;
        var hue = (1 - t) * 0.65;
        var color = new THREE.Color().setHSL(hue, 0.85, 0.45);
        var cell = new THREE.Mesh(
          new THREE.PlaneGeometry(cellSize * 0.92, cellSize * 0.92),
          new THREE.MeshBasicMaterial({color: color, transparent: true, opacity: 0.55})
        );
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(r.x, 0.08, r.z);
        analysisGroup.add(cell);

        if (gridRes <= 20) {
          var hCv = document.createElement('canvas'); hCv.width = 64; hCv.height = 32;
          var hCtx = hCv.getContext('2d');
          hCtx.font = 'bold 18px sans-serif';
          hCtx.fillStyle = t > 0.5 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)';
          hCtx.textAlign = 'center'; hCtx.textBaseline = 'middle';
          hCtx.fillText(r.hours.toFixed(1), 32, 16);
          var hLbl = new THREE.Mesh(new THREE.PlaneGeometry(cellSize * 0.7, cellSize * 0.35),
            new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(hCv), transparent: true, depthWrite: false}));
          hLbl.rotation.x = -Math.PI / 2;
          hLbl.position.set(r.x, 0.09, r.z);
          analysisGroup.add(hLbl);
        }
      }

      groupCustom.add(analysisGroup);

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'analysisComplete',
          maxHours: maxHours.toFixed(1)
        }));
      }
    }

    function clearAnalysis() {
      if (analysisGroup) {
        groupCustom.remove(analysisGroup);
        analysisGroup = null;
      }
    }

    function showSpacingLine(data) {
      if (spacingLine) { groupCustom.remove(spacingLine); }
      spacingLine = new THREE.Group();

      var bx = data.x, bz = data.z, bw = data.w, bd = data.d, spacing = data.spacing;
      var matLine = new THREE.LineBasicMaterial({color: 0x00AAFF, linewidth: 2});

      var p1 = new THREE.Vector3(bx, 0.2, bz + bd/2);
      var p2 = new THREE.Vector3(bx, 0.2, bz + bd/2 + spacing);
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), matLine);
      spacingLine.add(line);

      var tick1pts = [new THREE.Vector3(bx - 2, 0.2, bz + bd/2), new THREE.Vector3(bx + 2, 0.2, bz + bd/2)];
      spacingLine.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tick1pts), matLine));
      var tick2pts = [new THREE.Vector3(bx - 2, 0.2, bz + bd/2 + spacing), new THREE.Vector3(bx + 2, 0.2, bz + bd/2 + spacing)];
      spacingLine.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tick2pts), matLine));

      var zoneMat = new THREE.MeshBasicMaterial({color: 0x00AAFF, transparent: true, opacity: 0.12});
      var zone = new THREE.Mesh(new THREE.PlaneGeometry(bw + 4, spacing), zoneMat);
      zone.rotation.x = -Math.PI/2;
      zone.position.set(bx, 0.06, bz + bd/2 + spacing/2);
      spacingLine.add(zone);

      var sCv = document.createElement('canvas'); sCv.width = 256; sCv.height = 64;
      var sCtx = sCv.getContext('2d');
      sCtx.font = 'bold 28px sans-serif'; sCtx.fillStyle = '#00AAFF';
      sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
      sCtx.fillText(spacing.toFixed(1) + 'm 最小間距', 128, 32);
      var sLbl = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5),
        new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(sCv), transparent: true, depthWrite: false}));
      sLbl.position.set(bx, 2, bz + bd/2 + spacing/2);
      spacingLine.add(sLbl);

      groupCustom.add(spacingLine);
    }

    function clearSpacingLine() {
      if (spacingLine) { groupCustom.remove(spacingLine); spacingLine = null; }
    }

    // ── 初始建場景（全部先建好，用 visible 切換）────────────────
    let currentPreset = 'taipei101';
    let currentOrientation = 'south'; // 窗戶朝向
    const ORIENT_AZ = { south: 180, east: 90, west: 270, north: 0 }; // 窗戶法線方位角
    buildTaipei101();
    buildNTUST();
    buildIndoor();
    buildCustom();

    // ── 太陽軌跡弧 ───────────────────────────────────────────
    let pathLine = null;
    function getDOY(m,d) { const dm=[0,31,28,31,30,31,30,31,31,30,31,30,31]; let r=d; for(let i=1;i<m;i++) r+=dm[i]; return r; }

    function buildSunPath(month, latDeg) {
      if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); }
      const pts = [], N = getDOY(month,15), dec = 23.45*Math.sin(DEG*(360/365)*(284+N));
      for (let h=4.5; h<=19.5; h+=0.25) {
        const ha=(h-12)*15;
        const sinAlt = Math.sin(DEG*latDeg)*Math.sin(DEG*dec)+Math.cos(DEG*latDeg)*Math.cos(DEG*dec)*Math.cos(DEG*ha);
        const alt = Math.asin(Math.max(-1,Math.min(1,sinAlt)))/DEG;
        if (alt<=0) continue;
        const cosAlt = Math.cos(DEG*alt);
        const cosAzS = (Math.sin(DEG*dec)-Math.sin(DEG*latDeg)*sinAlt)/(Math.cos(DEG*latDeg)*Math.max(0.001,cosAlt));
        let az = Math.acos(Math.max(-1,Math.min(1,cosAzS)))/DEG;
        if (ha>0) az=360-az; az=((az%360)+360)%360;
        const sd=sunDir(az*DEG,alt*DEG);
        const pathR=currentPreset==='ntust'?150:(currentPreset==='custom'?60:38);
        pts.push(new THREE.Vector3(sd.x*pathR,sd.y*pathR,sd.z*pathR));
      }
      if (pts.length<2) return;
      pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color:0xFFAA44, transparent:true, opacity:0.5 }));
      scene.add(pathLine);
    }

    // ── 陰影線 ────────────────────────────────────────────────
    let shadowLine = null;
    function updateShadowLine(azDeg, altDeg) {
      if (shadowLine) { scene.remove(shadowLine); shadowLine.geometry.dispose(); }
      if (altDeg<=0.5) return;
      const len = MAIN_H_REF / Math.tan(altDeg*DEG);
      const saz = (azDeg+180)*DEG;
      const pts = [new THREE.Vector3(0,0.05,0), new THREE.Vector3(Math.sin(saz)*len,0.05,-Math.cos(saz)*len)];
      shadowLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color:0xFF6644, transparent:true, opacity:0.7 }));
      scene.add(shadowLine);
    }

    // ── 天空色 ────────────────────────────────────────────────
    const cDay=new THREE.Color(0x87CEEB), cDawn=new THREE.Color(0xFF7040),
          cTwi=new THREE.Color(0x253050), cNight=new THREE.Color(0x0D1117);

    function updateScene(azDeg, altDeg, month, latDeg) {
      const isIndoor = currentPreset === 'indoor';
      const sd=sunDir(azDeg*DEG,altDeg*DEG), dist=currentPreset==='ntust'?150:80;
      const tgt = currentPreset === 'ntust' ? new THREE.Vector3(0,0,2) : new THREE.Vector3(0,0,0);
      // 室內：依太陽方位與窗戶法線夾角計算進光比例（cosine衰減）
      var windowFactor = 1;
      if (isIndoor && altDeg > 0) {
        var winNormalAz = ORIENT_AZ[currentOrientation] || 180;
        var diff = Math.abs(azDeg - winNormalAz);
        if (diff > 180) diff = 360 - diff;
        windowFactor = diff >= 90 ? 0 : Math.cos(diff * DEG);
      }
      if (altDeg>0) {
        sunLight.position.set(sd.x*dist+tgt.x,sd.y*dist,sd.z*dist+tgt.z);
        sunLight.target.position.copy(tgt); sunLight.target.updateMatrixWorld();
        var baseIntensity = isIndoor ? 1.5+Math.sin(altDeg*DEG)*2.5 : 0.5+Math.sin(altDeg*DEG)*2.2;
        sunLight.intensity = isIndoor ? 0.15 + baseIntensity * windowFactor : baseIntensity;
        if (!isIndoor) {
          var shadowSize = Math.max(60, Math.min(300, MAIN_H_REF / Math.max(0.05, Math.tan(altDeg*DEG)) + 30));
          if (currentPreset === 'ntust') shadowSize = Math.max(shadowSize, 200);
          sunLight.shadow.camera.left = -shadowSize; sunLight.shadow.camera.right = shadowSize;
          sunLight.shadow.camera.top = shadowSize; sunLight.shadow.camera.bottom = -shadowSize;
          sunLight.shadow.camera.updateProjectionMatrix();
        }
        sunLight.color.setHex(altDeg<20 ? 0xFF9050 : 0xFFF5DC);
        sunMesh.visible = !isIndoor;
        if (!isIndoor) {
          const sunR=currentPreset==='ntust'?120:43;
          sunMesh.position.set(sd.x*sunR,sd.y*sunR,sd.z*sunR);
          sunMesh.material.color.setHex(altDeg<15 ? 0xFF7030 : 0xFFE055);
        }
      } else { sunLight.intensity=0; sunMesh.visible=false; }
      hemi.intensity = isIndoor ? 0.30 : Math.max(0.05, 0.08+Math.max(0,Math.sin(altDeg*DEG))*0.65);
      let sky;
      if      (altDeg<=-5)  sky=cNight.clone();
      else if (altDeg<=0)   sky=cNight.clone().lerp(cTwi,(altDeg+5)/5);
      else if (altDeg<=12)  sky=cTwi.clone().lerp(cDawn,altDeg/6).lerp(cDay,altDeg/12);
      else                  sky=cDay.clone();
      scene.background = null;
      skyMat.uniforms.topColor.value.copy(sky);
      skyMat.uniforms.bottomColor.value.copy(sky.clone().lerp(new THREE.Color(0xE8E0D0), 0.5));
      scene.fog.density = isIndoor ? 0 : (currentPreset==='ntust' ? 0.002 : 0.007);
      scene.fog.color.copy(sky.clone().lerp(new THREE.Color(0xC8DCF0),0.5));
      if (!isIndoor) {
        if (month!==undefined && latDeg!==undefined) buildSunPath(month, latDeg);
        updateShadowLine(azDeg, altDeg);
      } else {
        if (pathLine) { pathLine.visible = false; }
        if (shadowLine) { scene.remove(shadowLine); shadowLine.geometry.dispose(); shadowLine=null; }
      }
    }

    // ── Message ───────────────────────────────────────────────
    let lastMonth=6, lastLat=25.04;
    function onMsg(raw) {
      try {
        const d = JSON.parse(typeof raw==='string' ? raw : raw.data);
        if (d.preset && d.preset !== currentPreset) {
          currentPreset = d.preset;
          group101.visible   = (d.preset === 'taipei101');
          groupNTUST.visible = (d.preset === 'ntust');
          groupIndoor.visible = (d.preset === 'indoor');
          groupCustom.visible = (d.preset === 'custom');
          if (d.preset === 'ntust') {
            MAIN_H_REF = 24;
            camRadius = 180; camTarget.set(-5, 15, -36);
            camTheta = DEG * 220; camPhi = DEG * 55;
            sunLight.shadow.camera.left = -250; sunLight.shadow.camera.right = 250;
            sunLight.shadow.camera.top = 250; sunLight.shadow.camera.bottom = -250;
            sunLight.shadow.camera.updateProjectionMatrix();
          } else if (d.preset === 'indoor') {
            MAIN_H_REF = 3;
            camRadius = 12; camTarget.set(0, 1.5, -2);
            camTheta = DEG * 18; camPhi = DEG * 82;
            sunLight.shadow.camera.left = -10; sunLight.shadow.camera.right = 10;
            sunLight.shadow.camera.top = 10; sunLight.shadow.camera.bottom = -10;
            sunLight.shadow.camera.updateProjectionMatrix();
          } else if (d.preset === 'custom') {
            MAIN_H_REF = 20;
            camRadius = 80; camTarget.set(0, 8, 0);
            camTheta = DEG * 40; camPhi = DEG * 55;
            sunLight.shadow.camera.left = -80; sunLight.shadow.camera.right = 80;
            sunLight.shadow.camera.top = 80; sunLight.shadow.camera.bottom = -80;
            sunLight.shadow.camera.updateProjectionMatrix();
          } else {
            MAIN_H_REF = 38;
            camRadius = 65; camTarget.set(0, 8, 0);
            sunLight.shadow.camera.left = -90; sunLight.shadow.camera.right = 90;
            sunLight.shadow.camera.top = 90; sunLight.shadow.camera.bottom = -90;
            sunLight.shadow.camera.updateProjectionMatrix();
          }
          updateCamera();
        }
        if (d.orientation !== undefined && currentPreset === 'indoor') {
          const orientMap = { south: 0, east: Math.PI/2, west: -Math.PI/2, north: Math.PI };
          groupIndoor.rotation.y = orientMap[d.orientation] !== undefined ? orientMap[d.orientation] : 0;
          currentOrientation = d.orientation;
        }
        if (d.action === 'setBuildings') setCustomBuildings(d.buildings);
        if (d.action === 'selectBuilding') selectCustomBuilding(d.id);
        if (d.action === 'screenshot') {
          renderer.render(scene, camera);
          var dataURL = renderer.domElement.toDataURL('image/png');
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'screenshot', data: dataURL}));
        }
        if (d.action === 'analyzeSunlight') {
          analyzeSunlight(d.lat || 25.04);
        }
        if (d.action === 'clearAnalysis') {
          clearAnalysis();
        }
        if (d.action === 'showSpacing') {
          showSpacingLine(d);
        }
        if (d.action === 'clearSpacing') {
          clearSpacingLine();
        }
        if (d.action === 'toggleTransparency') {
          var bid = d.id;
          if (customBuildingMeshes[bid]) {
            var grp = customBuildingMeshes[bid];
            grp.children.forEach(function(child) {
              if (child.material && child.material.color) {
                child.material.transparent = !child.material.transparent || child.material.opacity >= 1;
                child.material.opacity = child.material.opacity < 1 ? 1.0 : 0.35;
                child.material.needsUpdate = true;
              }
            });
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'transparencyChanged',
              id: bid,
              transparent: grp.children[0].material.opacity < 1
            }));
          }
        }
        if (d.action === 'saveBuildings') {
          try { localStorage.setItem('customBuildings', JSON.stringify(d.buildings)); } catch(e) {}
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({type: 'saved'}));
          }
        }
        if (d.action === 'loadBuildings') {
          try {
            var saved = localStorage.getItem('customBuildings');
            if (saved) {
              var parsed = JSON.parse(saved);
              setCustomBuildings(parsed);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({type: 'loaded', buildings: parsed}));
              }
            }
          } catch(e) {}
        }
        if (d.azimuth!==undefined) {
          lastMonth=d.month||lastMonth; lastLat=d.lat||lastLat;
          updateScene(d.azimuth,d.altitude,lastMonth,lastLat);
        }
      } catch(e) {}
    }
    window.addEventListener('message', onMsg);
    document.addEventListener('message', e => onMsg(e.data));

    // ── Animate ───────────────────────────────────────────────
    (function animate() { requestAnimationFrame(animate); renderer.render(scene,camera); })();
    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth,window.innerHeight);
      camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    });

    updateScene(155, 58, 6, 25.04);
  })();
  </script>
</body>
</html>`;
}
