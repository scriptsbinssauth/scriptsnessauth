const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sanitize = require('sanitize-filename');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const ALLOWED_EXT = new Set(['.lua', '.txt']);

// Ensure data & uploads dirs exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [], nextId: 1 }, null, 2));

// Simple JSON users DB (for demo). Structure: { users: [{id, username, passwordHash}], nextId: N }
function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
}

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth helpers
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Multer storage - destination depends on logged user
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!req.session || !req.session.username) {
      return cb(new Error('Usuário não está autenticado'), null);
    }
    const userDir = path.join(UPLOADS_DIR, sanitize(req.session.username));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    const name = sanitize(file.originalname) || 'file';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + '-' + name);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new Error('Tipo de arquivo não permitido. Apenas .lua e .txt'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// Auth routes
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username e password são obrigatórios' });
  const cleanUser = sanitize(username);
  if (cleanUser !== username) return res.status(400).json({ error: 'username inválido' });

  const db = loadUsers();
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Usuário já existe' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = { id: db.nextId++, username, passwordHash };
  db.users.push(user);
  saveUsers(db);

  // create uploads dir for user
  const userDir = path.join(UPLOADS_DIR, sanitize(username));
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  // auto login after register
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username e password são obrigatórios' });

  const db = loadUsers();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Credenciais inválidas' });

  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Credenciais inválidas' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Erro ao deslogar' });
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ logged: true, username: req.session.username });
  }
  res.json({ logged: false });
});

// Upload endpoint (requires login)
app.post('/upload', requireLogin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Nenhum arquivo enviado ou tipo não permitido.');
  }
  res.redirect('/');
});

// List files for current user
app.get('/files', requireLogin, (req, res) => {
  const userDir = path.join(UPLOADS_DIR, sanitize(req.session.username));
  if (!fs.existsSync(userDir)) return res.json([]);
  const files = fs.readdirSync(userDir).map(f => {
    const stat = fs.statSync(path.join(userDir, f));
    return {
      name: f,
      size: stat.size,
      mtime: stat.mtime,
      ext: path.extname(f).toLowerCase(),
      // public raw url includes username so it's namespaced
      rawUrl: `${getBaseUrl(req)}/raw/${encodeURIComponent(req.session.username)}/${encodeURIComponent(f)}`
    };
  });
  res.json(files);
});

// Serve raw file contents (publicly accessible by URL)
// Raw path includes username to namespace uploads: /raw/:username/:filename
app.get('/raw/:username/:filename', (req, res) => {
  const username = sanitize(req.params.username);
  const filename = req.params.filename;
  const userDir = path.resolve(UPLOADS_DIR, username);
  const filePath = path.resolve(userDir, filename);

  if (!filePath.startsWith(userDir)) {
    return res.status(400).send('Bad request');
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado');
  }
  res.sendFile(filePath);
});

// Helper to compose base URL
function getBaseUrl(req) {
  const protocol = (req.headers['x-forwarded-proto'] || req.protocol);
  return `${protocol}://${req.get('host')}`;
}

app.listen(PORT, () => {
  console.log(`ScriptsNessAuth rodando em http://localhost:${PORT}`);
});
