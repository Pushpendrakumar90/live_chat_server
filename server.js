const io = require("socket.io")(3001, {
  cors: { 
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const roomStore = {}; 

const updateRoomCount = (roomId) => {
  if (!roomId) return;
  const clients = io.sockets.adapter.rooms.get(roomId);
  const numClients = clients ? clients.size : 0;
  io.to(roomId).emit("room-users", numClients);
};

io.on("connection", (socket) => {
  console.log("New Connection:", socket.id);

  socket.on("join-room", (data) => {
    const roomId = data.roomId?.toString();
    const username = data.username || "Guest";
    
    socket.username = username;
    socket.currentRoom = roomId;

    if (roomId) {
      socket.join(roomId);
      console.log(`[JOIN] ${username} joined ${roomId}`);

      if (!roomStore[roomId]) {
        roomStore[roomId] = {
          hostId: socket.id,
          permissions: false,
          videoStatus: {
            state: "pause",
            time: 0,
            lastUpdated: Date.now()
          }
        };
        socket.emit("host-status", true);
      } else {
        socket.emit("host-status", false);
        // Note: Yahan hum video-sync turant nahi bhej rahe kyunki user 
        // pehle "Join" button dabayega, tab maangega.
      }

      updateRoomCount(roomId);

      socket.to(roomId).emit("new-user-message", {
        message: `${username} has joined the party! 🎉`,
        type: "JOIN"
      });
    }
  });

  // --- NEW: Handle Join Button Click from Participant ---
  socket.on("video-update-request", (data) => {
    const roomId = data.roomId?.toString();
    const room = roomStore[roomId];
    
    if (room && room.videoStatus) {
      const status = room.videoStatus;
      let seekTime = status.time;

      // Agar video chal rahi hai toh time drift calculate karo
      if (status.state === "play") {
        const timePassed = (Date.now() - status.lastUpdated) / 1000;
        seekTime += timePassed;
      }

      // Sirf request karne wale bande ko bhej do
      socket.emit("video-sync", { 
        state: status.state, 
        time: seekTime 
      });
    }
  });

  socket.on("change-video", (data) => {
    const room = roomStore[data.roomId];
    if (room && (room.hostId === socket.id || room.permissions)) {
      if (room.videoStatus) {
        room.videoStatus.time = 0;
        room.videoStatus.state = "play";
        room.videoStatus.lastUpdated = Date.now();
      }
      socket.to(data.roomId).emit("video-changed", data.videoId);
    }
  });

  socket.on("video-update", (data) => {
    const room = roomStore[data.roomId];
    if (room && (room.hostId === socket.id || room.permissions)) {
      room.videoStatus = {
        state: data.state,
        time: data.time,
        lastUpdated: Date.now()
      };
      socket.to(data.roomId).emit("video-sync", { 
        state: data.state, 
        time: data.time 
      });
    }
  });

  // Permissions Toggle logic (optional but good to have)
  socket.on("toggle-permissions", (data) => {
    const room = roomStore[data.roomId];
    if (room && room.hostId === socket.id) {
      room.permissions = data.allowed;
      io.to(data.roomId).emit("permission-updated", data.allowed);
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        if (roomStore[roomId] && roomStore[roomId].hostId === socket.id) {
          socket.to(roomId).emit("video-sync", { state: "pause", time: 0 });
          socket.to(roomId).emit("host-left-sync"); 
          delete roomStore[roomId]; 
        }

        socket.to(roomId).emit("new-user-message", {
          message: `${socket.username || "Someone"} left the room. 🚪`,
          type: "LEAVE"
        });
        setTimeout(() => updateRoomCount(roomId), 100);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

console.log("Server running on port 3001");