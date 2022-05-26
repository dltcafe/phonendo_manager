import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { /* options */ });

console.log("Phonendo Manager Initialization");

io.on("connection", (socket) => {
    console.log("New socket connection ", socket.id);

    socket.on("disconnect", (reason) => {
        console.log("Disconnected ", socket.id);
    });

    // Receives data from Phonendo Reader and send to Phonendo Storage
    socket.on("reader_new_data", (data) => {
        console.log("New data received from Reader");
        console.log(data);
        io.sockets.emit("storage_save_data_raw", data);
    });

    // Receives data modeled and saved from Phonendo Storage
    socket.on("storage_return_data_raw", (data) => {
        console.log("Data modeled from Storage");
        console.log(data);
        io.sockets.emit("verifier_init_verification", data);
    });

    // Receives data verified from Phonendo Verifier and send to Phonendo Storage
    socket.on("verifier_return_data_verified", (data) => {
        console.log("Data verified from Verifier");
        console.log(data);
        io.sockets.emit("storage_save_data_processed", data);
    });

    // Receives data already processed and saved and send to Publisher
    socket.on("storage_return_data_processed", (data) => {
        console.log("Data verified saved from Storage");
        console.log(data);
        io.sockets.emit("publisher_init_publication", data);
    });
});

httpServer.listen(3000);