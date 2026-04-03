const io = require("socket.io")(process.env.PORT || 3001, {
  cors: { 
    // origin: ["http://localhost:3000", "https://your-vercel-link.vercel.app"], // Apna vercel link yahan add karein
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
      }

      updateRoomCount(roomId);

      // Sabko batane ke liye ki naya banda aaya hai
      io.to(roomId).emit("new-user-message", {
        message: `${username} has joined the party! 🎉`,
        username: "System",
        type: "JOIN"
      });
    }
  });

 
  socket.on("send-message", (data) => {
    const roomId = data.roomId?.toString();
    if (roomId) {
      // io.to use karne se Sender ko bhi apna message dikhega
      io.to(roomId).emit("new-user-message", {
        message: data.message,
        username: data.username || socket.username || "Guest",
        type: "CHAT"
      });
    }
  });

  socket.on("video-update-request", (data) => {
    const roomId = data.roomId?.toString();
    const room = roomStore[roomId];
    if (room && room.videoStatus) {
      const status = room.videoStatus;
      let seekTime = status.time;
      if (status.state === "play") {
        const timePassed = (Date.now() - status.lastUpdated) / 1000;
        seekTime += timePassed;
      }
      socket.emit("video-sync", { state: status.state, time: seekTime });
    }
  });

  socket.on("change-video", (data) => {
    const roomId = data.roomId?.toString();
    const room = roomStore[roomId];
    if (room && (room.hostId === socket.id || room.permissions)) {
      if (room.videoStatus) {
        room.videoStatus.time = 0;
        room.videoStatus.state = "play";
        room.videoStatus.lastUpdated = Date.now();
      }
      io.to(roomId).emit("video-changed", data.videoId);
    }
  });

  socket.on("video-update", (data) => {
    const roomId = data.roomId?.toString();
    const room = roomStore[roomId];
    if (room && (room.hostId === socket.id || room.permissions)) {
      room.videoStatus = {
        state: data.state,
        time: data.time,
        lastUpdated: Date.now()
      };
      // Sabko sync bhejo
      io.to(roomId).emit("video-sync", { 
        state: data.state, 
        time: data.time 
      });
    }
  });

  socket.on("disconnecting", () => {
    const rooms = Array.from(socket.rooms);
    rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        if (roomStore[roomId] && roomStore[roomId].hostId === socket.id) {
          socket.to(roomId).emit("host-left-sync"); 
          delete roomStore[roomId]; 
        }

        io.to(roomId).emit("new-user-message", {
          message: `${socket.username || "Someone"} left the room. 🚪`,
          username: "System",
          type: "LEAVE"
        });
        setTimeout(() => updateRoomCount(roomId), 100);
      }
    });
  });
});

console.log(`Server running on port ${process.env.PORT || 3001}`);
