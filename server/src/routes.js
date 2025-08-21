const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function createMulter(uploadDir){
  try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}
  const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => {
      const safe = Date.now() + '-' + Math.round(Math.random()*1e9);
      const ext = path.extname(file.originalname || '').slice(0,10);
      cb(null, safe + ext);
    },
  });
  const fileFilter = (_, file, cb) => {
    if(!/^image\//.test(file.mimetype || '')) return cb(new Error('이미지 파일만 업로드 가능합니다.'));
    cb(null, true);
  };
  return multer({ storage, fileFilter, limits: { fileSize: 5*1024*1024 } });
}
const { query } = require('./db');

// Health check
router.get('/health', async (req, res) => {
  try {
    const rows = await query('SELECT 1 as ok');
    res.json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List tasks by date range
router.get('/tasks', async (req, res) => {
  const { start, end } = req.query; // YYYY-MM-DD
  try {
    const rows = await query(
      `SELECT * FROM tasks WHERE task_date BETWEEN ? AND ? ORDER BY task_date, start_time IS NULL, start_time`,
      [start, end]
    );
    const mapped = rows.map(r=>({
      ...r,
      images: safeParseJSON(r.images_json) || (r.image_path ? [r.image_path] : []),
    }));
    res.json(mapped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create task
router.post('/tasks', (req, res, next)=> createMulter((req.uploadDir)||'uploads').array('images', 5)(req, res, next), async (req, res) => {
  const { title, note, status = 'todo', task_date, start_time = null, end_time = null } = req.body || {};
  if (!title || !task_date) return res.status(400).json({ error: 'title, task_date required' });
  try {
    const image_paths = (req.files||[]).map(f=>`/uploads/${f.filename}`);
    const completed_date = status === 'done' ? new Date().toISOString().slice(0,10) : null;
    const result = await query(
      `INSERT INTO tasks (title, note, status, task_date, start_time, end_time, completed_date, image_path, images_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, note, status, task_date, start_time, end_time, completed_date, image_paths[0] || null, JSON.stringify(image_paths)]
    );
    const insertedRows = await query(`SELECT * FROM tasks WHERE id = ?`, [result.insertId]);
    const inserted = insertedRows[0];
    res.status(201).json({ ...inserted, images: image_paths });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update task
router.put('/tasks/:id', (req, res, next)=> createMulter((req.uploadDir)||'uploads').array('images', 5)(req, res, next), async (req, res) => {
  const id = req.params.id;
  const { title, note, status, task_date, start_time, end_time } = req.body || {};
  try {
    const image_paths = (req.files||[]).map(f=>`/uploads/${f.filename}`);

    // Determine image update intent
    const clearFlag = String(req.body?.image_clear || '').toLowerCase() === 'true';

    // Fetch current to delete old file if needed
    let current = [];
    if (clearFlag || image_paths[0]) {
      current = await query(`SELECT image_path, images_json FROM tasks WHERE id = ?`, [id]);
      const imagesOld = safeParseJSON(current[0]?.images_json) || (current[0]?.image_path ? [current[0].image_path] : []);
      const toDelete = clearFlag ? imagesOld : (image_paths[0] ? imagesOld : []);
      for (const oldPath of toDelete) {
        try {
          if (oldPath && oldPath.startsWith('/uploads/')) {
            const abs = path.join(req.uploadDir || 'uploads', path.basename(oldPath));
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          }
        } catch (_) {}
      }
    }

    // Use sentinel to keep existing when not changing image
    const sentinel = '__KEEP__';
    const nextImage = image_paths[0] ?? (clearFlag ? null : sentinel);
    const nextImagesJSON = image_paths.length ? JSON.stringify(image_paths) : (clearFlag ? JSON.stringify([]) : sentinel);

    // completed_date 로직: status가 done으로 변경될 때 오늘 날짜로 설정, 그 외 상태로 변경 시 null로 초기화(요청에 맞춰 시간 관리 없이 날짜만 저장)
    const nextCompletedExpr = `CASE 
      WHEN COALESCE(?, status) = 'done' THEN CURDATE() 
      WHEN COALESCE(?, status) IN ('todo','doing') THEN NULL 
      ELSE completed_date END`;

    await query(
      `UPDATE tasks SET 
        title = COALESCE(?, title), 
        note = COALESCE(?, note), 
        status = COALESCE(?, status), 
        task_date = COALESCE(?, task_date), 
        start_time = ?, 
        end_time = ?, 
        completed_date = ${nextCompletedExpr},
        image_path = CASE WHEN ? = '${sentinel}' THEN image_path ELSE ? END,
        images_json = CASE WHEN ? = '${sentinel}' THEN images_json ELSE ? END 
      WHERE id = ?`,
      [title ?? null, note ?? null, status ?? null, task_date ?? null, start_time ?? null, end_time ?? null, status ?? null, status ?? null, nextImage, nextImage, nextImagesJSON, nextImagesJSON, id]
    );
    const updatedRows = await query(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!updatedRows.length) return res.status(404).json({ error: 'Not found' });
    const updated = updatedRows[0];
    res.json({ ...updated, images: safeParseJSON(updated.images_json) || (updated.image_path ? [updated.image_path] : []) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete task
router.delete('/tasks/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const before = await query(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!before.length) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM tasks WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a single image from a task
router.delete('/tasks/:id/image', async (req, res) => {
  const id = req.params.id;
  const src = req.query.src;
  if (!src) return res.status(400).json({ error: 'src required' });
  try {
    const rows = await query(`SELECT image_path, images_json FROM tasks WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const currentImages = safeParseJSON(rows[0].images_json) || (rows[0].image_path ? [rows[0].image_path] : []);
    const remaining = currentImages.filter(x => x !== src);

    // delete file from disk if under uploads
    try {
      if (src.startsWith('/uploads/')) {
        const abs = path.join(req.uploadDir || 'uploads', path.basename(src));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      }
    } catch (_) {}

    await query(
      `UPDATE tasks SET image_path = ?, images_json = ? WHERE id = ?`,
      [remaining[0] || null, JSON.stringify(remaining), id]
    );

    const updatedRows = await query(`SELECT * FROM tasks WHERE id = ?`, [id]);
    const updated = updatedRows[0];
    res.json({ ...updated, images: remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

function safeParseJSON(s){
  try{ return s ? JSON.parse(s) : null; }catch(_){ return null; }
}