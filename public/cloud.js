// ==========================================
// 道路配置後の雲状パーティクル
// ==========================================

(() => {

  const T = AFRAME.THREE;
  // 発生した雲をすべて管理
  const activeClouds = new Set();

  // 全パーティクルを削除
  window.clearRoadClouds = function () {

  activeClouds.forEach(points => {
    if (points.parent) {
      points.parent.remove(points);
    }
  });

  activeClouds.clear();

};

  let softDotTexture;

  // ======================================
  // 柔らかい粒子のテクスチャ
  // ======================================

  function getSoftDotTexture() {

    if (softDotTexture) return softDotTexture;

    const canvas = document.createElement("canvas");

    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");

    const gradient = ctx.createRadialGradient(
      32, 32, 0,
      32, 32, 32
    );

    gradient.addColorStop(
      0,
      "rgba(255,255,255,1)"
    );

    gradient.addColorStop(
      0.35,
      "rgba(255,255,255,0.65)"
    );

    gradient.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(0, 0, 64, 64);

    softDotTexture = new T.CanvasTexture(canvas);

    return softDotTexture;
  }


  // ======================================
  // 雲状パーティクルを生成
  // ======================================

  window.showRoadCloud = function (road) {

    if (!road || !road.sceneEl) return;

    // 粒子の数
    const COUNT = 300;

    // 粒子1個の循環周期（12秒）
    const LIFE = 12;

    const scene = road.sceneEl;

    // 道路の現在位置
    const center = new T.Vector3();

    road.object3D.getWorldPosition(center);


    // ======================================
    // 粒子の初期位置
    // ======================================

    const origin = new Float32Array(COUNT * 3);

    const positions = new Float32Array(COUNT * 3);

    const wind = new Float32Array(COUNT);


    for (let i = 0; i < COUNT; i++) {

      const j = i * 3;

      // 横方向の広がり
      origin[j] =
        (Math.random() - 0.5) * 4.8;

      // 上下方向のばらつき
      origin[j + 1] =
        (Math.random() - 0.5) * 0.9;

      // 奥行方向の広がり
      origin[j + 2] =
        (Math.random() - 0.5) * 1.8;

      // 粒子ごとの移動速度
      wind[i] =
        0.07 + Math.random() * 0.18;
    }

    positions.set(origin);


    // ======================================
    // 3Dパーティクル生成
    // ======================================

    const geometry = new T.BufferGeometry();

    geometry.setAttribute(
      "position",
      new T.BufferAttribute(positions, 3)
    );


    // ======================================
    // 粒子の見た目
    // ======================================

    const material = new T.PointsMaterial({

    color: "#4CC3D9",

    map: getSoftDotTexture(),

    // 上空20mでも見える大きさ
    size: 4,

    // 距離によって小さくならない
    sizeAttenuation: false,

    transparent: true,

    // 最初から表示する
    opacity: 0.85,

    depthWrite: false

});


    const points = new T.Points(
      geometry,
      material
    );


    // ======================================
    // 雲を道路の20m上空に配置
    // ======================================

    points.position.set(
      center.x,
      center.y + 20,
      center.z
    );

    points.quaternion.copy(
      road.object3D.getWorldQuaternion(
        new T.Quaternion()
      )
    );

    points.frustumCulled = false;

    scene.object3D.add(points);
    activeClouds.add(points);


    // ======================================
    // パーティクルのアニメーション
    // ======================================

    let started = null;

    function animate(now) {

      if (started === null) {
        started = now;
      }

      const elapsed = now - started;


      
    // 雲がシーンから削除された場合だけ終了
if (!points.parent) {
  geometry.dispose();
  material.dispose();
  return;
}

     
      const seconds = elapsed / 1000;


      // 粒子を繰り返し発生させる
for (let i = 0; i < COUNT; i++) {

  const j = i * 3;

  // 粒子ごとに発生タイミングをずらす
  const age =
    (seconds + (i / COUNT) * LIFE) % LIFE;

  // 横方向に漂う
  positions[j] =
    origin[j] + wind[i] * age;

  // ゆっくり上昇
  positions[j + 1] =
    origin[j + 1] + 0.12 * age;

  // 奥行方向に揺れる
  positions[j + 2] =
    origin[j + 2] +
    Math.sin(age * 1.5 + i) * 0.08;
}

      geometry.attributes.position.needsUpdate = true;


      // ======================================
      // フェードイン・フェードアウト
      // ======================================

      // 雲を常に表示する
      material.opacity = 0.85;


      // 次のフレーム
      requestAnimationFrame(animate);

    }

    requestAnimationFrame(animate);

  };

  // ======================================
  // PC間の雲の同期
  // ======================================

const socket = window.multiplayerSocket;

// サーバーから届いた位置に雲を生成
function showSyncedCloud(data) {

  const scene = document.querySelector("a-scene");

  if (!scene || !data) return;

  // 道路の位置と向きを再現
  const object = new T.Object3D();

  object.position.set(
    data.x,
    data.y,
    data.z
  );

  object.quaternion.set(
    data.qx ?? 0,
    data.qy ?? 0,
    data.qz ?? 0,
    data.qw ?? 1
  );

  // 既存の雲生成処理を使う
  window.showRoadCloud({
    id: data.roadId,
    sceneEl: scene,
    object3D: object
  });

}

if (socket) {

  // 道路が配置されたら両PCで雲を表示
  socket.on("road-cloud:spawn", (data) => {
    showSyncedCloud(data);
  });

  // 途中参加したPCに過去の雲を復元
  socket.on("road-cloud:history", (history) => {

    window.clearRoadClouds?.();

    if (Array.isArray(history)) {
      history.forEach(showSyncedCloud);
    }

  });

  // リセット時に雲を削除
  socket.on("road-cloud:clear", () => {
    window.clearRoadClouds?.();
  });

}

})();