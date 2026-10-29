

// ==========================================
// 全オブジェクト配置完了 → 水平線が発光
// ==========================================

AFRAME.registerComponent("horizon-glow", {

  init: function () {

    const T = AFRAME.THREE;

    // ======================================
    // 配置対象の19個
    // ======================================

    this.targetIds = [
      "station",
      "bridge",
      "hospital",
      "supermarket",
      ...Array.from(
        { length: 15 },
        (_, i) => `road-${String(i + 1).padStart(2, "0")}`
      )
    ];

    this.brightness = 0;
    this.checkTimer = 0;
    this.completed = false;

    // ======================================
    // 水平線の光のマテリアル
    // ======================================

    this.material = new T.ShaderMaterial({

      uniforms: {
        uBrightness: { value: 0 }
      },

      vertexShader: `
        varying float vHeight;

        void main() {

          vHeight = normalize(position).y;

          gl_Position =
            projectionMatrix *
            modelViewMatrix *
            vec4(position, 1.0);
        }
      `,

      fragmentShader: `
  uniform float uBrightness;

  varying float vHeight;

  void main() {

    // 水平線を中心に柔らかく広がる光
    float glow = exp(
      -pow(vHeight / 0.085, 2.0)
    );

    // 淡い青白色
    vec3 color = vec3(
      0.48,
      0.72,
      0.82
    );

    // 強すぎない光
    float alpha =
      glow * 0.35 * uBrightness;

    gl_FragColor = vec4(
      color,
      alpha
    );
  }
`,

      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: T.BackSide,
      blending: T.AdditiveBlending

    });

    // ======================================
    // 360度を囲む発光用の球体
    // ======================================

    this.horizon = new T.Mesh(

      new T.SphereGeometry(
        110,
        96,
        48
      ),

      this.material

    );

    // 光を背景より手前に描画
    this.horizon.renderOrder = 999;

    this.horizon.frustumCulled = false;

    this.el.object3D.add(this.horizon);

    this.cameraPosition = new T.Vector3();
    this.objectPosition = new T.Vector3();

  },

  // ======================================
  // 全オブジェクトの配置完了を判定
  // ======================================

  checkCompleted: function () {

    return this.targetIds.every(id => {

      const obj = document.getElementById(id);

      if (!obj || !obj.object3D) {
        return false;
      }

      obj.object3D.getWorldPosition(
        this.objectPosition
      );

      const p = this.objectPosition;

      // 都市エリア内に配置されているか
      return (
        p.x >= -16 &&
        p.x <= 16 &&
        p.z >= -16 &&
        p.z <= 16
      );

    });

  },

  // ======================================
  // 毎フレーム更新
  // ======================================

  tick: function (time, dt) {

    const camera = this.el.camera;

    if (!camera) return;

    // ======================================
    // カメラを中心に水平線を配置
    // ======================================

    camera.getWorldPosition(
      this.cameraPosition
    );

    this.horizon.position.copy(
      this.cameraPosition
    );

    // ======================================
    // 0.5秒ごとに配置状態を確認
    // ======================================

    this.checkTimer += dt;

    if (this.checkTimer >= 500) {

      this.checkTimer = 0;

      const completed = this.checkCompleted();

      if (completed !== this.completed) {

        this.completed = completed;

        console.log(
          completed
            ? "全オブジェクト配置完了！水平線が発光"
            : "配置未完了：水平線を消灯"
        );

      }

    }

    // ======================================
    // 光の強さを滑らかに変化
    // ======================================

    const target = this.completed ? 1 : 0;

    const speed = Math.min(
      dt / 1500,
      1
    );

    this.brightness +=
      (target - this.brightness) * speed;

    // ゆっくり呼吸するような光の変化
    const pulse =
    0.85 + 0.12 * Math.sin(time * 0.00055);

    this.material.uniforms.uBrightness.value =
    this.brightness * pulse;

    },

  // ======================================
  // 後片付け
  // ======================================

  remove: function () {

    this.horizon.geometry.dispose();
    this.material.dispose();

    this.el.object3D.remove(
      this.horizon
    );

  }

});
