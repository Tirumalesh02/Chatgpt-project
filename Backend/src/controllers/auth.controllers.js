const userModel = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function buildUserResponse(user) {
  return {
    id: user._id,
    email: user.email,
    fullName: user.fullName,
  };
}

async function register(req, res) {
  try {
    const { email, fullName, password } = req.body;
    const firstName = fullName?.firstName;
    const lastName = fullName?.lastName;

    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    let existing = await userModel.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists. Please login" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await userModel.create({
      email,
      fullName: { firstName, lastName },
      password: hashedPassword,
    });

    const token = signToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
    });

    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: buildUserResponse(user),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = signToken(user._id);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
    });

    return res.status(200).json({
      message: "User logged in successfully",
      token,
      user: buildUserResponse(user),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

async function status(req, res) {
  // auth.middleware already attached user
  if (!req.user) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, user: buildUserResponse(req.user) });
}

async function logout(req, res) {
  res.clearCookie("token");
  return res.json({ message: "Logged out" });
}

module.exports = {
  register,
  login,
  status,
  logout,
};
