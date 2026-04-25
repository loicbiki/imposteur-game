const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

function makeCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function chooseImpostor(room) {
  if (room.players.length >= 3) {
    const randomIndex = Math.floor(Math.random() * room.players.length);
    room.impostorId = room.players[randomIndex].id;
    room.started = true;
  }
}

function sendRoomUpdate(code) {
  const room = rooms[code];

  room.players.forEach(function (player) {
    const role = room.started
      ? player.id === room.impostorId
        ? "IMPOSTEUR"
        : "INNOCENT"
      : "En attente de 3 joueurs minimum...";

    io.to(player.id).emit("roomUpdate", {
      code: code,
      players: room.players.map(p => p.name),
      role: role,
      maxPlayers: room.maxPlayers
    });
  });
}

io.on("connection", function (socket) {
  socket.on("createRoom", function (data) {
    const name = data.name;
    const maxPlayers = parseInt(data.maxPlayers, 10);
    const code = makeCode();

    if (!name || !maxPlayers || maxPlayers < 3) {
      socket.emit("errorMsg", "Pseudo obligatoire et minimum 3 joueurs.");
      return;
    }

    rooms[code] = {
      maxPlayers: maxPlayers,
      players: [],
      impostorId: null,
      started: false
    };

    rooms[code].players.push({
      id: socket.id,
      name: name
    });

    socket.join(code);
    chooseImpostor(rooms[code]);
    sendRoomUpdate(code);
  });

  socket.on("joinRoom", function (data) {
    const name = data.name;
    const code = data.code.toUpperCase();

    if (!name || !code) {
      socket.emit("errorMsg", "Pseudo et code obligatoires.");
      return;
    }

    if (!rooms[code]) {
      socket.emit("errorMsg", "Salon introuvable.");
      return;
    }

    if (rooms[code].players.length >= rooms[code].maxPlayers) {
      socket.emit("errorMsg", "Salon plein.");
      return;
    }

    rooms[code].players.push({
      id: socket.id,
      name: name
    });

    socket.join(code);

    // Tirage refait à chaque nouveau joueur
    chooseImpostor(rooms[code]);
    sendRoomUpdate(code);
  });

  socket.on("disconnect", function () {
    for (const code in rooms) {
      const room = rooms[code];
      const before = room.players.length;

      room.players = room.players.filter(player => player.id !== socket.id);

      if (room.players.length !== before) {
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          room.started = false;
          room.impostorId = null;
          chooseImpostor(room);
          sendRoomUpdate(code);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, function () {
  console.log("Serveur lancé sur http://localhost:" + PORT);
});