// station-grab.js が利用できるよう、接続前にグローバル変数を作成。
window.multiplayerSocket = io({ autoConnect: false });

window.addEventListener('DOMContentLoaded', () => {
  const socket = window.multiplayerSocket;
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  const otherPlayers = new Map();
  const THREE = AFRAME.THREE;
  const cameraPosition = new THREE.Vector3();
  const cameraRotation = new THREE.Quaternion();
  const cameraEuler = new THREE.Euler();

  function upsertPlayer(id, pose) {
    if (id === socket.id || !pose) return;
    let avatar = otherPlayers.get(id);
    if (!avatar) {
      avatar = document.createElement('a-entity');
      avatar.setAttribute('data-peer-id', id);
    // 相手の人型アバターを生成
avatar.innerHTML = `
  <a-entity
    gltf-model="url(models/avatar.glb)"
    position="0 0 0"
    rotation="0 0 0"
    scale="2 2 2">
  </a-entity>
`;
      scene.appendChild(avatar);
      otherPlayers.set(id, avatar);
    }
    avatar.setAttribute('position', { x: pose.x, y: pose.y - 1.6, z: pose.z });
    avatar.setAttribute('rotation', { x: 0, y: pose.ry, z: 0 });
  }

  socket.on('world:players', (players) => {
    for (const [id, pose] of Object.entries(players)) upsertPlayer(id, pose);
  });
  socket.on('player:pose', ({ id, pose }) => upsertPlayer(id, pose));
  socket.on('player:left', (id) => {
    const avatar = otherPlayers.get(id);
    if (avatar) avatar.remove();
    otherPlayers.delete(id);
  });
  socket.on('connect', () => console.log('共有空間に接続:', socket.id));
  socket.on('disconnect', () => {
    for (const avatar of otherPlayers.values()) avatar.remove();
    otherPlayers.clear();
  });

  socket.connect();

  // 0.1秒ごとに、自分の視点位置・向きを送信する（10回/秒）。
  const interval = setInterval(() => {
    if (!socket.connected || !scene.camera) return;
    scene.object3D.updateMatrixWorld(true);
    scene.camera.getWorldPosition(cameraPosition);
    scene.camera.getWorldQuaternion(cameraRotation);
    cameraEuler.setFromQuaternion(cameraRotation, 'YXZ');
    socket.volatile.emit('player:pose', {
      x: cameraPosition.x,
      y: cameraPosition.y,
      z: cameraPosition.z,
      ry: cameraEuler.y * 180 / Math.PI
    });
  }, 100);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
});
