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

function getPublicPlayers(room) {
  return room.players.map(function (player) {
    return player.name;
  });
}

io.on("connection", function (socket) {
  socket.on("createRoom", function (data) {
    const name = data.name;
    const pin = data.pin;
    const code = makeCode();

    rooms[code] = {
      players: [],
      started: false,
      impostorId: null,
      word: "Pizza"
    };

    rooms[code].players.push({
      id: socket.id,
      name: name,
      pin: pin
    });

    socket.join(code);

    socket.emit("roomCreated", {
      code: code
    });

    io.to(code).emit("roomUpdate", getPublicPlayers(rooms[code]));
  });

  socket.on("joinRoom", function (data) {
    let code = data.code.toUpperCase();
    const name = data.name;
    const pin = data.pin;

    if (!rooms[code]) {
      socket.emit("errorMsg", "Salon introuvable.");
      return;
    }

    if (rooms[code].started) {
      socket.emit("errorMsg", "La partie a déjà commencé.");
      return;
    }

    if (rooms[code].players.length >= 4) {
      socket.emit("errorMsg", "Le salon est plein.");
      return;
    }

    rooms[code].players.push({
      id: socket.id,
      name: name,
      pin: pin
    });

    socket.join(code);

    socket.emit("joinedRoom", {
      code: code
    });

    io.to(code).emit("roomUpdate", getPublicPlayers(rooms[code]));
  });

  socket.on("startGame", function (data) {
    const code = data.code;
    const room = rooms[code];

    if (!room) {
      socket.emit("errorMsg", "Salon introuvable.");
      return;
    }

    if (room.players.length !== 4) {
      socket.emit("errorMsg", "Il faut exactement 4 joueurs.");
      return;
    }

    const randomIndex = Math.floor(Math.random() * room.players.length);
    room.impostorId = room.players[randomIndex].id;
    room.started = true;

    io.to(code).emit("gameStarted");
  });

  socket.on("revealRole", function (data) {
    const code = data.code;
    const name = data.name;
    const pin = data.pin;
    const room = rooms[code];

    if (!room) {
      socket.emit("errorMsg", "Salon introuvable.");
      return;
    }

    if (!room.started) {
      socket.emit("errorMsg", "La partie n'a pas commencé.");
      return;
    }

    const player = room.players.find(function (p) {
      return p.name === name && p.pin === pin;
    });

    if (!player) {
      socket.emit("errorMsg", "Nom ou PIN incorrect.");
      return;
    }

    if (player.id === room.impostorId) {
      socket.emit("roleResult", "Tu es l'IMPOSTEUR.");
    } else {
      socket.emit("roleResult", "Tu es innocent. Mot secret : " + room.word);
    }
  });

  socket.on("disconnect", function () {
    // Pour cette version simple, on ne supprime pas automatiquement les joueurs.
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, function () {
  console.log("Serveur lancé sur http://localhost:" + PORT);
});