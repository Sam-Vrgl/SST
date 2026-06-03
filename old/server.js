const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CSV Merger</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 16px; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    p.sub { color: #666; margin-top: 0; font-size: 0.9rem; }
    label { display: block; margin: 20px 0 6px; font-weight: bold; }
    input[type=file] { display: block; }
    button { margin-top: 24px; padding: 10px 24px; font-size: 1rem; cursor: pointer; }
    #status { margin-top: 16px; color: #c00; white-space: pre-wrap; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>CSV Merger</h1>
  <p class="sub">Upload your source files and get a merged master.csv back.</p>
  <form id="form">
    <label>Intervenants files <span style="font-weight:normal;color:#666">(one or more, must start with Intervenants)</span></label>
    <input type="file" name="files" accept=".csv" multiple required>

    <label>PMC file <span style="font-weight:normal;color:#666">(optional, name must contain PMC)</span></label>
    <input type="file" name="files" accept=".csv">

    <label>Google Results file <span style="font-weight:normal;color:#666">(optional, name must contain google-results)</span></label>
    <input type="file" name="files" accept=".csv">

    <button type="submit">Merge &amp; Download</button>
  </form>
  <div id="status"></div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('status');
      status.textContent = 'Merging…';

      const fd = new FormData();
      for (const input of e.target.querySelectorAll('input[type=file]')) {
        for (const file of input.files) fd.append('files', file, file.name);
      }

      const res = await fetch('/merge', { method: 'POST', body: fd });
      if (!res.ok) {
        status.textContent = 'Error: ' + (await res.text());
        return;
      }
      status.textContent = '';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'master.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>`);
});

app.post('/merge', upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sst-'));
  const outFile = path.join(tmpDir, 'master.csv');

  try {
    for (const file of req.files) {
      if (!file.originalname.endsWith('.csv')) continue;
      fs.writeFileSync(path.join(tmpDir, file.originalname), file.buffer);
    }

    await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(__dirname, 'merge.js'), `--dir=${tmpDir}`, `--out=${outFile}`],
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve();
        }
      );
    });

    const csv = fs.readFileSync(outFile);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="master.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).send(err.message);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
