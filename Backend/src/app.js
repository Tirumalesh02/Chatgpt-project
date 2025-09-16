const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");


const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://chatgpt-project-0vpi.onrender.com",
];

app.use(cors({
  origin: (origin, callback) => {
    if(!origin) return callback(null, true); // same-origin or curl
    if(allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed: '+origin));
  },
  credentials: true
}));

const cookieParser = require("cookie-parser");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(cookieParser());


const authRoutes = require("./routes/auth.routes");
const chatRoutes = require("./routes/chat.routes");



// THIS IS ROUTES - register API endpoints before serving static assets
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

app.get("*name", (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});



module.exports = app;

