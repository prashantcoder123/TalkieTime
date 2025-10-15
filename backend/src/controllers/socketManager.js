// import { Server } from "socket.io";
// // import { connectToSocket } from "./controllers/socketManager.js";

// let connections = {};
// let messages = {};
// let timeOnline = {};

// export const connectToSocket = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: "*",
//       methods: ["GET", "POST"],
//       allowedHeaders: ["*"],
//       credentials: true,
//     },
//   });

//   io.on("connection", (socket) => {
//     console.log("SOMETHING CONNECTED");

//     socket.on("join-call", (path) => {
//       if (connections[path] === undefined) {
//         connections[path] = [];
//       }
//       connections[path].push(socket.id);

//       timeOnline[socket.id] = new Date();

//       // connections[path].forEach(elem => {
//       //     io.to(elem)
//       // })

//       for (let a = 0; a < connections[path].length; a++) {
//         io.to(connections[path][a]).emit(
//           "user-joined",
//           socket.id,
//           connections[path]
//         );
//       }

//       if (messages[path] !== undefined) {
//         for (let a = 0; a < messages[path].length; ++a) {
//           io.to(socket.id).emit(
//             "chat-message",
//             messages[path][a]["data"],
//             messages[path][a]["sender"],
//             messages[path][a]["socket-id-sender"]
//           );
//         }
//       }
//     });

//     socket.on("signal", (toId, message) => {
//       io.to(toId).emit("signal", socket.id, message);
//     });

//     socket.on("chat-message", (data, sender) => {
//       const [matchingRoom, found] = Object.entries(connections).reduce(
//         ([room, isFound], [roomKey, roomValue]) => {
//           if (!isFound && roomValue.includes(socket.id)) {
//             return [roomKey, true];
//           }

//           return [room, isFound];
//         },
//         ["", false]
//       );

//       if (found === true) {
//         if (messages[matchingRoom] === undefined) {
//           messages[matchingRoom] = [];
//         }

//         messages[matchingRoom].push({
//           sender: sender,
//           data: data,
//           "socket-id-sender": socket.id,
//         });
//         console.log("message", matchingRoom, ":", sender, data);

//         // connections[matchingRoom].forEach((elem) => {
//         //   io.to(elem).emit("chat-message", {
//         //     sender: sender,
//         //     data: data,
//         //     socketIdSender: socket.id,
//         //   });
//         // });
//         // 🧩 around line 79–88
//         connections[matchingRoom].forEach((elem) => {
//           io.to(elem).emit("chat-message", {
//             sender: typeof sender === "string" ? sender : "Anonymous",
//             data: typeof data === "string" ? data : "",
//             socketIdSender: socket.id,
//           });
//         });
//       }
//     });

//     socket.on("disconnect", () => {
//       var diffTime = Math.abs(timeOnline[socket.id] - new Date());

//       var key;

//       for (const [k, v] of JSON.parse(
//         JSON.stringify(Object.entries(connections))
//       )) {
//         for (let a = 0; a < v.length; ++a) {
//           if (v[a] === socket.id) {
//             key = k;

//             for (let a = 0; a < connections[key].length; ++a) {
//               io.to(connections[key][a]).emit("user-left", socket.id);
//             }

//             var index = connections[key].indexOf(socket.id);

//             connections[key].splice(index, 1);

//             if (connections[key].length === 0) {
//               delete connections[key];
//             }
//           }
//         }
//       }
//     });
//   });

//   return io;
// };


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
