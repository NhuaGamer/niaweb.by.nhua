const express = require("express");
const session = require("express-session");
const ejs = require("ejs");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const path = require("path");
const MySQLStore = require("express-mysql-session")(session); // Use MySQL for session storage

const app = express();

// Database connection pool configuration
const dbConfig = {
  host: 'biwrjd52s3atmsirhtco-mysql.services.clever-cloud.com',
  user: 'uxgg9lya6jkwgixp',
  password: 'bIoHwUTKlWPQsuDuIc4S',
  database: 'biwrjd52s3atmsirhtco',
  waitForConnections: true,
  connectionLimit: 5, // Matches the 'max_user_connections' in MySQL configuration
  queueLimit: 0,
};

const pool = mysql.createPool(dbConfig); // Create MySQL connection pool

// Check MySQL connection on startup
async function checkMySQLConnection() {
  try {
    const [rows] = await pool.query("SELECT 1"); // Test query to check connectivity
    console.log("Successfully connected to MySQL database!");
  } catch (err) {
    console.error("Error connecting to MySQL database:", err.message);
  }
}

checkMySQLConnection(); // Call the function to verify connection

// Configure session storage using MySQL
const sessionStore = new MySQLStore({}, pool);
app.use(session({
  key: 'NodeJs',
  secret: 'node', // Replace this with a secure secret
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
}));

// Middleware for parsing request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Set up EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to check if a user is logged in
function IfLoggedIn(req, res, next) {
  if (req.session.user) {
    return res.redirect('/'); // Redirect to home if already logged in
  }
  next(); // Proceed to the next middleware or route
}

// Middleware to check if a user is an admin
function IfAdmin(req, res, next) {
  if (req.session.admin) {
    next(); // User is an admin; proceed to the next middleware
  } else {
    res.redirect('/'); // Redirect non-admins to home
  }
}

// Cache videos in memory for better performance
const NodeCache = require('node-cache');
const cache = new NodeCache();

// Main route: Display videos (uses caching for optimization)
app.get('/', async (req, res) => {
  let data = cache.get('videos');
  if (!data) {
    const [rows] = await pool.query("SELECT * FROM urlvideo");
    cache.set('videos', rows, 3600); // Cache data for 1 hour
    data = rows;
  }
  res.render('index', { videos: data, user: req.session.user });
});

// Login page
app.get('/login', IfLoggedIn, (req, res) => {
  res.render('login', {
    user: req.session.user
  });
});

// Sign-up page
app.get('/sign-up', IfLoggedIn, (req, res) => {
  res.render('sign-up', {
    user: req.session.user
  });
});

// Sign out and destroy session
app.get('/sign-out', (req, res) => {
  req.session.destroy(); // Clear session
  res.redirect('/');
});

// About page
app.get('/about', (req, res) => {
  res.render('about', {
    user: req.session.user
  });
});

// Contact page
app.get('/contact', (req, res) => {
  res.render('contact', {
    user: req.session.user
  });
});

// Admin dashboard with role validation
app.get('/admin', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login'); // Redirect to login if user is not authenticated
  }

  const email = req.session.user.email;
  const checkAdmin = "SELECT * FROM users WHERE email = ? AND role = 'admin'";

  try {
    const [result] = await pool.query(checkAdmin, [email]);
    if (result.length > 0) {
      req.session.admin = result[0]; // Set admin session
      return res.render('admin/index', { admin: req.session.admin });
    } else {
      return res.redirect('/'); // Redirect non-admin users
    }
  } catch (err) {
    console.error("Error checking admin role:", err);
    return res.status(500).send("Server error");
  }
});

// Admin: Add video page
app.get('/admin/addvideo', IfAdmin, (req, res) => {
  res.render('admin/addvideo', {
    admin: req.session.admin
  });
});

// Admin: Add a new video
app.post('/admin/addvideo', IfAdmin, async (req, res) => {
  const { title, url, comment, Tlink1, Tlink2, Tlink3, link1, link2, link3 } = req.body;
  const insertVideo = "INSERT INTO urlvideo(title, url, comment, link1, link2, link3, Tlink1, Tlink2, Tlink3) VALUES(?,?,?,?,?,?,?,?,?)";
  try {
    await pool.query(insertVideo, [title, url, comment, link1, link2, link3, Tlink1, Tlink2, Tlink3]);
    res.redirect('/admin/addvideo'); // Redirect after adding the video
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding video");
  }
});

// Admin: Delete a specific video by title
app.post('/deleteName', async (req, res) => {
  const { titleD } = req.body;
  const deleteName = "DELETE FROM urlvideo WHERE title = ?";
  try {
    await pool.query(deleteName, [titleD]);
    res.redirect('/admin/addvideo'); // Redirect after deletion
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting video");
  }
});

// Admin: Delete all videos
app.post('/deleteAll', async (req, res) => {
  const deleteQuery = "DELETE FROM urlvideo";
  const resetAutoIncrementQuery = "ALTER TABLE urlvideo AUTO_INCREMENT = 1";
  try {
    await pool.query(deleteQuery);
    await pool.query(resetAutoIncrementQuery);
    res.redirect('/admin/addvideo'); // Redirect after deletion
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting all videos");
  }
});

// User sign-up logic
app.post('/sign-up', async (req, res) => {
  const { name, email, password, ConfirmPassword } = req.body;
  const checkEmailExists = "SELECT * FROM users WHERE email = ?";
  try {
    const [result] = await pool.query(checkEmailExists, [email]);
    if (result.length > 0) {
      return res.redirect('/sign-up?errorEmailExists=true');
      return res.render('sign-up', { err: 'Email exists.', old_data: req.body });
    }
    if (password.length < 6) {
      return res.redirect('/Sign-up?errorPassword6=true');
      return res.render('sign-up', { err: 'Password must be at least 6 characters.', old_data: req.body });
    }
    if (password !== ConfirmPassword) {
      return res.redirect('/Sign-up?errorPasswordNotMatch=true');
      return res.render('sign-up', { err: 'Passwords do not match.', old_data: req.body });
    }
    const hashPass = bcrypt.hashSync(password);
    const insertUser = "INSERT INTO users(role, name, email, password) VALUES('user', ?, ?, ?)";
    await pool.query(insertUser, [name, email, hashPass]);
    res.redirect('/login?success=true'); // Redirect to login page
  } catch (err) {
    console.error(err);
    res.status(500).send("Error signing up");
  }
});

// User login logic
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  try {
    const [result] = await pool.query(sql, [email]);
    if (result.length > 0) {
      const user = result[0];
      if (bcrypt.compareSync(password, user.password)) {
        req.session.user = user;
        return res.redirect('/?success=true');
      } else {
        return res.redirect('/login?errorPasswordNotMatch=true');
        return res.render('login', { old_data: req.body });
      }
    }
    return res.redirect('/login?errorUserNotFound=true');
    res.render('login', { old_data: req.body });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging in");
  }
});

// 404 error page for undefined routes
app.use((req, res) => {
  res.status(404).render('err/404', {
    user: req.session.user
  });
});

// Start the server on port 4000
app.listen(4000, () => {
  console.log('Server is running on port 4000...');
});
