

import { Server } from "socket.io";

let connections = {}; // stores rooms and their socket IDs
let messages = {}; // stores messages per room

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join a room
    socket.on("join-call", (room) => {
      if (!connections[room]) {
        connections[room] = [];
      }
      connections[room].push(socket.id);

      // Send existing messages to the newly joined user
      if (messages[room]) {
        messages[room].forEach((msg) => {
          io.to(socket.id).emit("chat-message", msg);
        });
      }

      // Notify others in the room about new user
      connections[room].forEach((id) => {
        io.to(id).emit("user-joined", socket.id, connections[room]);
      });
    });

    // Handle chat messages
    socket.on("chat-message", ({ sender, data }) => {
      // Find the room of the sender
      let userRoom = null;
      for (let room in connections) {
        if (connections[room].includes(socket.id)) {
          userRoom = room;
          break;
        }
      }
      if (!userRoom) return;

      // Save the message in the room
      if (!messages[userRoom]) messages[userRoom] = [];
      messages[userRoom].push({ sender, data });

      // Broadcast to all users in the room
      connections[userRoom].forEach((id) => {
        io.to(id).emit("chat-message", { sender, data });
      });

      console.log("Message in room", userRoom, ":", sender, data);
    });

    // Handle socket disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (let room in connections) {
        const index = connections[room].indexOf(socket.id);
        if (index !== -1) {
          connections[room].splice(index, 1);

          // Notify others in the room
          connections[room].forEach((id) => {
            io.to(id).emit("user-left", socket.id);
          });

          // Remove room if empty
          if (connections[room].length === 0) {
            delete connections[room];
            delete messages[room];
          }
        }
      }
    });
  });

  return io;
};
