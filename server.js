require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS country_code TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT
  `);
};

initDb().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});


// OPEN HTML PAGE
app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "VYBERA.html")
  );

});


// SIGNUP API
app.post("/signup", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      countryCode,
      city,
      password,
    } = req.body;

    const cleanFirstName = String(firstName || username || "").trim();
    const cleanLastName = String(lastName || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPhone = String(phone || "").trim();
    const cleanCountryCode = String(countryCode || "+91").trim();
    const cleanCity = String(city || "").trim();

    if (!cleanFirstName || !cleanEmail || !password) {
      return res.status(400).json({
        error: "First name, email, and password are required",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = [cleanFirstName, cleanLastName].filter(Boolean).join(" ");

    const result = await pool.query(
      `INSERT INTO users (
        username,
        first_name,
        last_name,
        email,
        phone,
        country_code,
        city,
        password
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, username, first_name, last_name, email, phone, country_code, city, created_at`,
      [
        displayName || cleanFirstName,
        cleanFirstName,
        cleanLastName,
        cleanEmail,
        cleanPhone,
        cleanCountryCode,
        cleanCity,
        hashedPassword,
      ]
    );

    res.json({
      message: "Signup successful",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists",
      });
    }

    res.status(500).json({
      error: "Signup failed",
    });
  }
});


// LOGIN API
app.post("/login", async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        username,
        first_name,
        last_name,
        email,
        phone,
        country_code,
        city,
        password
      FROM users
      WHERE email=$1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "User not found",
      });
    }

    const user = result.rows[0];

    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {
      return res.status(400).json({
        error: "Invalid password",
      });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        countryCode: user.country_code,
        city: user.city,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Login failed",
    });
  }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
