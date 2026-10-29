const express = require('express');
const { createServer } = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = createServer(app);
const io = new Server(server);

const stations = new Map(); // id => { position, owner }
const players = new Map();  // socket.id => pose
// ======================================
// オブジェクトの固定初期位置
// ======================================

const INITIAL_POSITIONS = new Map();

// 駅
INITIAL_POSITIONS.set('station', {
  x: 28,
  y: -1.01,
  z: -10
});

// 橋
INITIAL_POSITIONS.set('bridge', {
  x: 28,
  y: -0.25,
  z: 4
});

// 道路15枚
const roadX = [39, 46, 53];
const roadZ = [-14, -7, 0, 7, 14];

let roadNumber = 1;

for (const z of roadZ) {
  for (const x of roadX) {

    const id = `road-${String(roadNumber).padStart(2, '0')}`;

    INITIAL_POSITIONS.set(id, {
      x: x,
      y: -0.945,
      z: z
    });

    roadNumber++;
  }
}

function validPosition(p) {
  return p && ['x', 'y', 'z'].every(
    (axis) => typeof p[axis] === 'number' &&
      Number.isFinite(p[axis]) && Math.abs(p[axis]) < 100000
  );
}
function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 80;
}

io.on('connection', (socket) => {
  console.log('接続:', socket.id);
  socket.emit('world:players', Object.fromEntries(players));

  // 初期位置を登録。2人目以降には共有済みの位置を返す。
  socket.on('station:register', ({ id, position } = {}, ack) => {

  if (!validId(id) || !validPosition(position)) {
    if (typeof ack === 'function') {
      ack({ ok: false });
    }
    return;
  }

  if (!stations.has(id)) {

    // 固定初期位置を優先する
    const initial =
      INITIAL_POSITIONS.get(id) ?? position;

    stations.set(id, {
      position: { ...initial },
      initialPosition: { ...initial },
      owner: null,
      rotationY: 0,
      initialRotationY: 0
    });
  }

  const state = stations.get(id);

  if (typeof ack === 'function') {
    ack({
      ok: true,
      position: state.position,
      rotationY: state.rotationY
    });
  }

});

  // 2秒長押し開始時点で、サーバー側の操作権を予約する。
  socket.on('station:lock', (id, ack) => {
    const state = validId(id) && stations.get(id);
    const ok = Boolean(state && !state.owner);
    if (ok) {
  // 操作権を取得したプレイヤーを記録
  state.owner = socket.id;
  // 操作状態を表示
  console.log(
    "操作権取得:",
    socket.id,
    "対象:",
    id
  );
  // PC1・PC2に操作状態を共有
  io.emit('work:state', {
    playerId: socket.id,
    objectId: id,
    active: true
  });
}
    if (typeof ack === 'function') ack({ ok });
  });

  // 操作権を持つユーザーからの移動だけを反映。
  socket.on('station:move', ({ id, position } = {}) => {
    const state = stations.get(id);
    if (!state || state.owner !== socket.id || !validPosition(position)) return;
    state.position = { ...position };
    socket.broadcast.emit('station:move', { id, position: state.position });
  });

  // ======================================
// 道路オブジェクトの回転同期
// ======================================

socket.on('station:rotate', ({ id, rotationY } = {}) => {

  const state = stations.get(id);

  // 操作権がある人だけ回転できる
  if (!state || state.owner !== socket.id) return;

  // 回転角度の確認
  if (typeof rotationY !== 'number' ||
      !Number.isFinite(rotationY)) return;

  // サーバーに回転角度を保存
  state.rotationY = rotationY;

  // 他のPCへ回転情報を送信
  socket.broadcast.emit('station:rotate', {
    id: id,
    rotationY: rotationY
  });

});

  socket.on('station:release', ({ id, position } = {}) => {
    const state = stations.get(id);
    if (!state || state.owner !== socket.id) return;
    if (validPosition(position)) state.position = { ...position };
    state.owner = null;
    io.emit('station:move', { id, position: state.position });
  });

  socket.on('player:pose', (pose) => {
    if (!validPosition(pose) ||
        typeof pose.ry !== 'number' || !Number.isFinite(pose.ry)) return;
    players.set(socket.id, { x: pose.x, y: pose.y, z: pose.z, ry: pose.ry });
    socket.broadcast.emit('player:pose', { id: socket.id, pose: players.get(socket.id) });
  });

  // ======================================
// 全オブジェクトを初期位置に戻す
// ======================================

socket.on('station:reset-all', () => {

  const resetObjects = {};

  for (const [id, state] of stations) {

    // 初期位置に戻す
    state.position = {
      ...state.initialPosition
    };

    // 初期角度に戻す
    state.rotationY = state.initialRotationY ?? 0;

    // 操作権を解除する
    state.owner = null;

    // PC1・PC2へ送る情報
    resetObjects[id] = {
      position: { ...state.position },
      rotationY: state.rotationY
    };
  }

  // 全員へリセット情報を送信
  io.emit('station:reset-all', resetObjects);

  console.log('全オブジェクトを初期位置に戻しました');

});

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('player:left', socket.id);
    for (const [id, state] of stations) {
      if (state.owner === socket.id) {
        state.owner = null;
        io.emit('station:move', { id, position: state.position });
      }
    }
    console.log('切断:', socket.id);
  });
});
// ======================================
// 雲状パーティクルの同期
// ======================================

// 雲の発生履歴
const roadCloudHistory = [];

io.on("connection", (socket) => {

  // 新しく参加したPCにも過去の雲を送る
  socket.emit(
    "road-cloud:history",
    roadCloudHistory
  );

  // 道路を置いたとき
  socket.on("road-cloud:place", (data) => {

    if (
      !data ||
      !/^road-(0[1-9]|1[0-5])$/.test(data.roadId) ||
      !["x", "y", "z"].every(
        key => Number.isFinite(data[key])
      )
    ) return;

    // 履歴に保存
    roadCloudHistory.push(data);

    // PC1・PC2の両方に送信
    io.emit("road-cloud:spawn", data);

  });

  // 全オブジェクトのリセット
  socket.on("road-cloud:reset", () => {

    roadCloudHistory.length = 0;

    // 両方のPCの雲を削除
    io.emit("road-cloud:clear");

  });

});

server.listen(8080, '0.0.0.0', () => {
  console.log('起動: http://localhost:8080');
});
