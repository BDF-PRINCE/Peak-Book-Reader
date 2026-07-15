const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateId(filePath) {
  return 'book_' + crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
}

function getFormat(extension) {
  const ext = extension.toLowerCase().replace(/^\./, '');
  const epubFormats = ['epub', 'mobi', 'azw3', 'azw', 'fb2'];
  const pdfFormats = ['pdf'];
  const comicFormats = ['cbz', 'cbt', 'cbr', 'cb7'];
  const textFormats = ['txt', 'md', 'html', 'htm', 'xml', 'xhtml', 'mhtml', 'docx'];

  if (epubFormats.includes(ext)) return 'epub';
  if (pdfFormats.includes(ext)) return 'pdf';
  if (comicFormats.includes(ext)) return 'comic';
  if (textFormats.includes(ext)) return 'text';
  return 'text';
}

async function extractEPUBMetadata(filePath) {
  try {
    const JSZip = require('jszip');
    const cheerio = require('cheerio');
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);

    let title = 'Unknown';
    let author = 'Unknown';
    let coverPath = null;
    let coverBuffer = null;

    // Try OPF file
    const containerXml = zip.files['META-INF/container.xml'];
    if (containerXml) {
      const containerContent = await containerXml.async('text');
      const $container = cheerio.load(containerContent);
      const rootfilePath = $container('rootfile').attr('full-path');

      if (rootfilePath) {
        const opfFile = zip.files[rootfilePath];
        if (opfFile) {
          const opfContent = await opfFile.async('text');
          const $ = cheerio.load(opfContent, { xmlMode: true });

          // Get title
          const titleEl = $('dc\\:title, metadata > title');
          if (titleEl.length > 0) {
            title = titleEl.first().text().trim();
          }

          // Get author
          const authorEl = $('dc\\:creator, metadata > creator');
          if (authorEl.length > 0) {
            author = authorEl.first().text().trim();
          }

          // Get cover image reference
          const coverMeta = $('meta[name="cover"], item[id="cover-image"], item[id="cover"]');
          let coverItemId = coverMeta.attr('content') || coverMeta.attr('id');
          if (coverItemId) {
            const coverItem = $(`item[id="${coverItemId}"]`);
            const coverHref = coverItem.attr('href');
            if (coverHref) {
              const coverFile = zip.files[coverHref] || zip.files[path.posix.join(path.posix.dirname(rootfilePath), coverHref)];
              if (coverFile) {
                coverBuffer = await coverFile.async('nodebuffer');
              }
            }
          }

          // Fallback: look for cover images
          if (!coverBuffer) {
            const imgItems = $('item[media-type^="image"]');
            for (let i = 0; i < imgItems.length; i++) {
              const item = $(imgItems[i]);
              if (item.attr('properties')?.includes('cover-image')) {
                const href = item.attr('href');
                const coverFile = zip.files[href] || zip.files[path.posix.join(path.posix.dirname(rootfilePath), href)];
                if (coverFile) {
                  coverBuffer = await coverFile.async('nodebuffer');
                  break;
                }
              }
            }
          }

          // Another fallback: find any image named cover
          if (!coverBuffer) {
            for (const [filename, file] of Object.entries(zip.files)) {
              if (filename.toLowerCase().includes('cover') && (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.png'))) {
                coverBuffer = await file.async('nodebuffer');
                break;
              }
            }
          }
        }
      }
    }

    return { title, author, coverBuffer };
  } catch (e) {
    console.error('EPUB metadata extraction failed:', e.message);
    return { title: path.basename(filePath, path.extname(filePath)), author: '', coverBuffer: null };
  }
}

async function extractPDFMetadata(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const title = data.info?.Title || path.basename(filePath, '.pdf');
    const author = data.info?.Author || '';
    return { title, author, coverBuffer: null };
  } catch (e) {
    console.error('PDF metadata extraction failed:', e.message);
    return { title: path.basename(filePath, '.pdf'), author: '', coverBuffer: null };
  }
}

async function extractTextMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let title = path.basename(filePath, path.extname(filePath));
    let author = '';

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      // Title is the filename; first line might be title
      const lines = result.value.split('\n');
      if (lines.length > 0 && lines[0].trim()) {
        title = lines[0].trim().substring(0, 100);
      }
    } else if (ext === '.md') {
      const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
      if (firstLine) title = firstLine.substring(0, 100);
    } else {
      // TXT, HTML, etc.
      const firstLine = content.split('\n')[0].trim().replace(/<[^>]*>/g, '');
      if (firstLine && firstLine.length < 100) {
        title = firstLine;
      }
    }

    return { title, author, coverBuffer: null };
  } catch (e) {
    console.error('Text metadata extraction failed:', e.message);
    return { title: path.basename(filePath, path.extname(filePath)), author: '', coverBuffer: null };
  }
}

async function extractMetadata(filePath) {
  const ext = path.extname(filePath);
  const format = getFormat(ext);

  let metadata;
  switch (format) {
    case 'epub':
      metadata = await extractEPUBMetadata(filePath);
      break;
    case 'pdf':
      metadata = await extractPDFMetadata(filePath);
      break;
    case 'text':
      metadata = await extractTextMetadata(filePath);
      break;
    case 'comic':
      metadata = {
        title: path.basename(filePath, path.extname(filePath)),
        author: '',
        coverBuffer: null
      };
      // Try to extract cover from comic archive
      try {
        const JSZip = require('jszip');
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        // Find first image in root
        const files = Object.keys(zip.files).sort();
        for (const f of files) {
          if (!f.startsWith('__MACOSX') && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp'))) {
            const coverFile = zip.files[f];
            if (coverFile) {
              metadata.coverBuffer = await coverFile.async('nodebuffer');
              break;
            }
          }
        }
      } catch (e) {
        console.error('Comic cover extraction failed:', e.message);
      }
      break;
    default:
      metadata = {
        title: path.basename(filePath, ext),
        author: '',
        coverBuffer: null
      };
  }

  return {
    id: generateId(filePath),
    path: filePath,
    format,
    title: metadata.title,
    author: metadata.author,
    coverBuffer: metadata.coverBuffer,
    last_opened: 0,
    total_time_spent: 0,
    progress_percent: 0,
    current_location: null,
    status: 'unread',
    favourite: false,
    date_added: Math.floor(Date.now() / 1000)
  };
}

module.exports = {
  extractMetadata,
  generateId,
  getFormat
};
