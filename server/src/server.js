const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load .env if exists
try {
  if (fs.existsSync(require('path').join(process.cwd(), '.env'))) {
    require('dotenv').config();
  }
} catch (_) {}

const { ensureSchema } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json());
app.use(morgan('dev'));

// Serve static frontend
app.use(express.static(path.join(process.cwd(), 'public')));
// Serve uploads
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}
app.use('/uploads', express.static(UPLOAD_DIR));

// inject upload dir path into routes
app.use('/api', (req, res, next) => { req.uploadDir = UPLOAD_DIR; next(); }, routes);

// Fallback to index for root
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure schema:', e.message);
    process.exit(1);
  });


