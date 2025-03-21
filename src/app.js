const express = require('express')
const http = require('http')
const mongoose = require('mongoose')
const cors = require('cors')

const { Server } = require('socket.io')
const { v4: uuidv4 } = require("uuid");
const { VM } = require('vm2')


const app = express()
const server = http.createServer(app)

app.use(express.json())
app.use(cors())



const users = {}
const rooms = {}
let roomCodeContent = {}


const io = new Server(server, {
    cors: {
        origin: "*", // Change this to your frontend URL for security
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket)=>{
    console.log('a user joined', socket.id)


    socket.on('setUsername', (username)=>{
        users[username] = socket.id
        console.log(`${username} joined`, 'users: ', users)
        io.emit('updateUsers', Object.keys(users))
    })

    socket.on('createRoom', ()=>{
        const roomId = uuidv4()
        socket.join(roomId)
        rooms[roomId] = []
        roomCodeContent[roomId] = ''

        socket.emit('roomCreated', roomId)
        console.log(`Room ${roomId} created`);
    })

    socket.on('joinRoom', ({roomId, username})=>{
       if(rooms[roomId]){

          if(!rooms[roomId].includes(username)){
              socket.join(roomId)
              rooms[roomId].push(username)
              console.log(`${username} joined Room ${roomId}`)

              socket.to(roomId).emit('userJoined', {username, roomId})
              socket.emit('codeChange', roomCodeContent[roomId])
              io.to(roomId).emit('updateUsers', rooms[roomId])
          }
       }

        else {
         socket.emit("roomError", "Room does not exist");
        }
    })

    socket.on('leaveRoom', ({ roomId, username }) => {
        if (rooms[roomId]) {
            const index = rooms[roomId].indexOf(username);
            
            if (index !== -1) {
                rooms[roomId].splice(index, 1); // Remove user from room array
                socket.leave(roomId);
                console.log(`${username} left Room ${roomId}`);
    
                // Notify other users in the room
                io.to(roomId).emit('userLeft', { username, roomId });
                io.to(roomId).emit('updateUsers', rooms[roomId]); // Update user list
            }
        }
    });
    

    socket.on("editCode", ({ roomId, newCode }) => {
        if (roomCodeContent[roomId] !== undefined) {
            roomCodeContent[roomId] = newCode; // Store the latest code for the room
            socket.to(roomId).emit("codeChange", newCode); // Send it to others
        }
    });



    socket.on("runCode", ({ roomId }) => {
        if (!rooms[roomId] || !roomCodeContent[roomId]) return;
    
        let capturedLogs = [];
    
        const vm = new VM({
            timeout: 1000, 
            sandbox: { 
                console: { log: (...args) => capturedLogs.push(args.map(arg => safeStringify(arg)).join(" ")) }
            }
        });
    
        let output;
        try {
            const userCode = `
                (async function() {
                    try {
                        ${roomCodeContent[roomId]}
                        return typeof result !== "undefined" ? result : undefined;
                    } catch (err) {
                        return { error: err.message, stack: err.stack };
                    }
                })();
            `;
            output = vm.run(userCode);
    
            // Handle Promises
            if (output instanceof Promise) {
                output.then(res => {
                    socket.emit("CodeResult", { output: safeStringify(res), logs: capturedLogs });
                }).catch(err => {
                    socket.emit("CodeResult", { output: `Promise Rejected: ${err.message}`, logs: capturedLogs });
                });
                return;
            }
    
        } catch (err) {
            console.error("Execution Error:", err);
            output = { error: err.message, stack: err.stack };
        }
    
        // Send final output and logs
        socket.emit("CodeResult", { output: safeStringify(output), logs: capturedLogs });
    });
    
    // Safe stringify function to handle circular references, objects, arrays, etc.
    function safeStringify(obj) {
        try {
            return JSON.stringify(obj, (key, value) =>
                typeof value === "function" ? "[Function]" : value
            );
        } catch (err) {
            return "[Unserializable Object]";
        }
    }
    


    socket.on("sendMessage", ({ message, sender, roomId }) => {
        if (!roomId || !message || !sender) return; // Validate data
    
        console.log(`Message from ${sender} in room ${roomId}: ${message}`);
    
        // Broadcast the message only to users in the room
        socket.to(roomId).emit("receiveGroupMessage", { message, sender });
    });
    

    socket.on('typing', (username)=>{
      socket.broadcast.emit('userTyping', username)
      console.log(`${username} is typing`)
    })


    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("updateUsers", Object.keys(users));
        console.log(`User disconnected: ${socket.id}`);
    });
})
    



    



mongoose.connect('mongodb+srv://root:badboy2007@node-learn.pdbyi.mongodb.net/?retryWrites=true&w=majority&appName=node-learn')
.then( result => {
    console.log('Connected to MongoDB');
    server.listen(2000, console.log('online, server on port 2000'))
   
})
.catch(err => console.log(err))

