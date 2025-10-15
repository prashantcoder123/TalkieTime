import express from "express";
import {createServer} from "node:http";

import {Server} from "socket.io";
import mongoose from "mongoose";
import { connectToSocket } from "./controllers/socketManager.js";


import cors from "cors";
import { connect } from "node:http2";
import userRoutes from  "./routes/users.routes.js";

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port",(process.env.PORT || 8000))

app.use(cors());
app.use(express.json({limit:"40kb"}));
app.use(express.urlencoded({limit:"40kb",extended:true}));

app.get("/", (req, res) => {
  res.json({ message: "Server is running 🚀" });
});

app.get("/home",(req,res)=>{
res.json({"hello": "world"})
});

app.use("/api/v1/users",userRoutes);

const  start = async() =>{
    app.set("mongo_user")
    const connectionDb = await mongoose.connect("mongodb+srv://prashantkum7676_db_user:A6jfNEZDAjKYq9Jk@cluster0.kwa6wyc.mongodb.net/");
    console.log(`MONGO Connected DB Host: ${connectionDb.connection.host}`)
    server.listen(app.get("port"),()=>{
    console.log("server is listening to port 8000");
});
}

start();

