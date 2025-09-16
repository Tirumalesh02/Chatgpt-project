require('dotenv').config();
const app = require('./src/app');
const connectDB = require("./src/db/db");
connectDB();
const initSocketServer = require('./src/socket/socket.server')
const http = require('http');


const server = http.createServer(app);
initSocketServer(server);


server.listen(3000, ()=>{
    console.log('Server is running on port 3000');
})