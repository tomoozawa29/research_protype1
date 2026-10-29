AFRAME.registerComponent('station-grab', {
  init: function () {
    const T = AFRAME.THREE;
    const socket = window.multiplayerSocket;
    if (!socket) {
      console.error('multiplayer.js を station-grab.js より先に読み込んでください');
      return;
    }
    if (!this.el.id) {
      console.error('station-grab を設定した要素に id が必要です');
      return;
    }

    this.scene = this.el.sceneEl;
    this.socket = socket;
    this.held = false;
    this.pressing = false;
    this.hasLock = false;
    this.ready = false;
    this.timer = null;
    this.lastSend = 0;
    this.requestToken = 0;
    this.mouse = new T.Vector2();
    this.raycaster = new T.Raycaster();
    this.point = new T.Vector3();
    this.offset = new T.Vector3();
    this.plane = new T.Plane();
    // ======================================
// 周囲の建物を半透明化
// ======================================

this.fadedMaterials = new Map();

// ======================================
// 操作中のオブジェクトを半透明化
// ======================================

this.fadeNearby = (active) => {

  this.el.object3D.traverse(mesh => {

    if (!mesh.isMesh) return;

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach(mat => {

      if (!mat) return;

      if (active) {

        // 元の状態を保存
        if (!this.fadedMaterials.has(mat)) {
          this.fadedMaterials.set(mat, {
            opacity: mat.opacity,
            transparent: mat.transparent,
            depthWrite: mat.depthWrite
          });
        }

        // 掴んでいる間は半透明
        mat.opacity = 0.4;
        mat.transparent = true;
        mat.depthWrite = false;

      } else {

        // 離したら元に戻す
        const original = this.fadedMaterials.get(mat);

        if (!original) return;

        mat.opacity = original.opacity;
        mat.transparent = original.transparent;
        mat.depthWrite = original.depthWrite;

        this.fadedMaterials.delete(mat);
      }

      mat.needsUpdate = true;

    });

  });

};
    // 道路だけ高さを自動調整する
this.isRoad = this.el.id.startsWith('road-');

// 駅・橋・道路を高さ調整の対象にする
this.autoHeight =
  this.isRoad ||
  this.el.id === 'station' ||
  this.el.id === 'bridge' ||
  this.el.id === 'hospital' ||
  this.el.id === 'supermarket';

// オブジェクトの底面までの距離
this.bottomOffset = 0;

// 道路の設置高さを計算
this.getRoadY = (x, z) => {

  const groundHeight = (px, pz) => {

    // 都市エリア
    if (Math.abs(px) <= 16 && Math.abs(pz) <= 16) {

      const center =
        -4 + 1.3 * Math.sin(pz * 0.16)
           + 0.45 * Math.sin(pz * 0.4);

      const d = Math.abs(px - center);

      const h =
        0.68 - 0.93 * Math.exp(-Math.pow(d / 1.8, 4));

      const hill =
        3.2 * Math.exp(
          -((px + 11) ** 2 / 19 + (pz + 10) ** 2 / 22)
        );

      let ground = h + hill;

      // 既存住宅地の道路
      if (
        px >= -14.7 && px <= -6.1 &&
        pz >= 8.625 && pz <= 9.775
      ) {
        ground = Math.max(ground, 0.8325);
      }

      return ground;
    }

    // オブジェクト置き場
    if (
      px >= 18 && px <= 58 &&
      pz >= -20 && pz <= 20
    ) {
      return -0.995;
    }

    // 周囲の展示床
    return -1.015;
  };

  // 道路の中央と周囲の高さを確認
  let highest = -Infinity;

  for (const dx of [-2, 0, 2]) {
    for (const dz of [-0.575, 0, 0.575]) {

      highest = Math.max(
        highest,
        groundHeight(x + dx, z + dz)
      );

    }
  }

  // 道路の厚さと設置余裕
  return highest + 0.05;
};

    this.currentPosition = () => {
      const p = this.el.object3D.position;
      return { x: p.x, y: p.y, z: p.z };
    };

    // 最初のユーザーが初期位置を登録し、後から来た人は同じ位置を受け取る。
    this.onConnect = () => {
      this.socket.emit('station:register', {
        id: this.el.id,
        position: this.currentPosition()
      }, (reply) => {
        if (!reply?.ok) return;
        this.ready = true;
        if (!this.hasLock && !this.pressing) {

  // サーバーに保存された位置を反映
  this.el.setAttribute('position', reply.position);

  // サーバーに保存された回転角度を反映
  if (typeof reply.rotationY === 'number') {
    this.el.setAttribute('rotation', {
      x: 0,
      y: reply.rotationY,
      z: 0
    });
  }

}
      });
    };
    this.onRemoteMove = (data) => {
      if (data.id !== this.el.id || this.hasLock) return;
      this.el.setAttribute('position', data.position);
    };
    // 他のPCから道路の回転角度を受信
this.onRemoteRotate = (data) => {

  if (data.id !== this.el.id || this.hasLock) return;

  this.el.setAttribute('rotation', {
    x: 0,
    y: data.rotationY,
    z: 0
  });

  console.log('相手の道路回転を反映:', data.id);

};
    // ======================================
// 全オブジェクトの初期位置リセット
// ======================================

this.onResetAll = (objects) => {

  const state = objects?.[this.el.id];

  if (!state || !state.position) return;

  // 掴んでいる場合は操作を終了する
  this.finish();

  // 初期位置に戻す
  this.el.setAttribute(
    'position',
    state.position
  );

  // 初期角度に戻す
  if (typeof state.rotationY === 'number') {

    this.el.setAttribute('rotation', {
      x: 0,
      y: state.rotationY,
      z: 0
    });

  }

  console.log('初期位置に戻しました:', this.el.id);

};
    this.onDisconnect = () => {
      this.ready = false;
      this.finish();
    };
    socket.on('connect', this.onConnect);
    socket.on('station:move', this.onRemoteMove);
    socket.on('station:rotate', this.onRemoteRotate);
    socket.on('station:reset-all', this.onResetAll);
    socket.on('disconnect', this.onDisconnect);
    if (socket.connected) this.onConnect();

    this.updateRay = (event) => {
      const canvas = this.scene.canvas;
      if (!canvas || !this.scene.camera) return false;
      if (this.scene.is('vr-mode')) return false;
      const rect = canvas.getBoundingClientRect();
      this.mouse.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      this.scene.object3D.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.mouse, this.scene.camera);
      return true;
    };

    this.onDown = (event) => {
      if (event.button !== 0 || this.pressing || !this.ready) return;
      if (event.target !== this.scene.canvas) return;
      if (!this.updateRay(event)) return;
      const hits = this.raycaster.intersectObject(this.el.object3D, true);
      if (hits.length === 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      this.pressing = true;
      this.pointerId = event.pointerId;
      const token = ++this.requestToken;
      this.cameraEl = this.scene.camera.el;
      this.look = this.cameraEl?.components['look-controls'];
      this.previousLookEnabled = this.look?.data.enabled;
      if (this.look) this.cameraEl.setAttribute('look-controls', 'enabled', false);
      this.scene.canvas.style.cursor = 'progress';

      // 他方が操作していないかサーバーで確認し、操作権を先に予約。
      socket.timeout(3000).emit('station:lock', this.el.id, (err, reply) => {
        if (err || !reply?.ok) {
          if (this.pressing && token === this.requestToken) {
            console.log('駅は他の人が操作中、または通信に失敗しました');
            this.finish();
          }
          return;
        }
        if (!this.pressing || token !== this.requestToken) {
          // ACK 到着前に指を離した場合は操作権を返却。
          socket.emit('station:release', {
            id: this.el.id, position: this.currentPosition()
          });
          return;
        }
        this.hasLock = true;
        this.timer = setTimeout(() => {
          if (!this.pressing || !this.hasLock) return;
          const position = this.el.object3D.position;
          this.plane.set(new T.Vector3(0, 1, 0), -position.y);
          const hit = this.raycaster.ray.intersectPlane(this.plane, this.point);
          if (!hit) { this.finish(); return; }
          this.offset.copy(position).sub(this.point);

          // 駅・橋・道路を持ち上げる
if (this.autoHeight) {

  const bounds = new T.Box3().setFromObject(this.el.object3D);

  // オブジェクトの原点から底面までの距離
  this.bottomOffset = position.y - bounds.min.y;

  position.y =
    this.getRoadY(position.x, position.z)
    - 0.05
    + this.bottomOffset
    + 0.6;
}

          this.held = true;
          this.fadeNearby(true);
          this.scene.canvas.style.cursor = 'grabbing';
          console.log('駅を掴みました');
        }, 2000);
      });
    };

    this.onMove = (event) => {
      if (!this.pressing || event.pointerId !== this.pointerId) return;
      if ((event.buttons & 1) === 0) { this.finish(); return; }
      if (!this.updateRay(event)) return;
      if (!this.held) {
        const hits = this.raycaster.intersectObject(this.el.object3D, true);
        if (hits.length === 0) this.finish();
        return;
      }
      const hit = this.raycaster.ray.intersectPlane(this.plane, this.point);
      if (!hit) return;
      const position = this.el.object3D.position;
      position.x = this.point.x + this.offset.x;
      position.z = this.point.z + this.offset.z;
      // マウス移動は最大20回/秒で同期。
      // 移動先に応じて周囲の透明化を更新
      this.fadeNearby(true);
      // 駅・橋・道路を持ち上げたまま移動
  if (this.autoHeight) {

  position.y =
    this.getRoadY(position.x, position.z)
    - 0.05
    + this.bottomOffset
    + 0.6;

}

      // マウス移動は最大20回/秒で同期。最終位置は release 時にも送る。
      if (performance.now() - this.lastSend >= 50) {
        this.lastSend = performance.now();
        socket.volatile.emit('station:move', {
          id: this.el.id, position: this.currentPosition()
        });
      }
    };

    this.finish = () => {
      clearTimeout(this.timer);
  this.timer = null;

  if (!this.pressing) return;

  this.requestToken++;
  // 周囲の建物を元の表示に戻す
  this.fadeNearby(false);

  if (this.held) {

    // 駅・橋・道路を地面に設置
    if (this.autoHeight) {

      const position = this.el.object3D.position;

      position.y =
        this.getRoadY(position.x, position.z)
        - 0.05
        + this.bottomOffset
        + 0.01;
    }

    this.el.setAttribute(
      'position',
      this.currentPosition()
    );
  }
      // 道路を配置したら雲を発生させる
      // 道路を置いたときに雲の発生を同期
if (this.held && this.el.id.startsWith("road-")) {

  const T = AFRAME.THREE;

  const p = this.el.object3D.getWorldPosition(
    new T.Vector3()
  );

  const q = this.el.object3D.getWorldQuaternion(
    new T.Quaternion()
  );

  const socket = window.multiplayerSocket;

  if (socket && socket.connected) {

    // サーバーへ道路の配置位置を送信
    socket.emit("road-cloud:place", {
      roadId: this.el.id,
      x: p.x,
      y: p.y,
      z: p.z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w
    });

  } else {

    // オフライン時は自分のPCだけ表示
    window.showRoadCloud?.(this.el);

  }

}
      const release = this.hasLock;
      this.pressing = false;
      this.held = false;
      this.hasLock = false;
      if (this.look) {
        this.cameraEl.setAttribute('look-controls', 'enabled', this.previousLookEnabled);
      }
      if (this.scene.canvas) this.scene.canvas.style.cursor = '';
      if (release && socket.connected) {
        socket.emit('station:release', {
          id: this.el.id, position: this.currentPosition()
        });
      }
    };
    this.onUp = (event) => {
      if (event.pointerId === this.pointerId) this.finish();
    };
    this.onKey = (event) => {

  // Escキー：操作終了
  if (event.code === 'Escape') {
    this.finish();
    return;
  }

  // Rキー：道路を90度回転
  if (
    event.code === 'KeyR' &&
    this.isRoad &&
    this.held &&
    this.hasLock &&
    !event.repeat
  ) {

    event.preventDefault();

    // 現在の回転角度
    const rotation = this.el.getAttribute('rotation');

    // 90度ずつ回転
    const nextY = (rotation.y + 90) % 360;

    this.el.setAttribute('rotation', {
      x: 0,
      y: nextY,
      z: 0
    });

    // 他のPCへ回転角度を送信
socket.emit('station:rotate', {
  id: this.el.id,
  rotationY: nextY
});

    console.log('道路の回転角度:', nextY);
  }
};

    window.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('blur', this.finish);
    this.scene.addEventListener('enter-vr', this.finish);
  },

  remove: function () {
    if (!this.finish) return;
    this.finish();
    window.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('blur', this.finish);
    this.scene.removeEventListener('enter-vr', this.finish);
    this.socket.off('connect', this.onConnect);
    this.socket.off('station:move', this.onRemoteMove);
    this.socket.off('station:rotate', this.onRemoteRotate);
    this.socket.off('station:reset-all', this.onResetAll);
    this.socket.off('disconnect', this.onDisconnect);
  }
});
