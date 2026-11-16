import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { basename } from 'node:path';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import { fail } from './model.mjs';

export const FILE_LIMIT = 3_000_000;
const TEXT_LIMIT = 16_000;
const ZIP_LIMIT = 15_000_000;
const trim = text => text.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').trim();
const decoder = bytes => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[\x00-\x08\x0e-\x1f\uFFFD]/u.test(text)) throw Error();
    return text;
  } catch { fail(422, 'The source is not readable UTF-8 text. Save it as UTF-8 and try again.'); }
};

export async function limited(stream, maximum) {
  const parts = [];
  let size = 0;
  if (stream) for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximum) fail(413, 'This source is too large. Import a shorter source.');
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts, size);
}

function source(type, title, sections) {
  const fragments = [];
  let total = 0;
  for (const { text, location } of sections) {
    const plain = trim(text);
    total += plain.length;
    if (total > TEXT_LIMIT) fail(413, 'The extracted text exceeds 16,000 characters. Import a shorter excerpt.');
    // Preserve all text within the advertised limit, including long code lines.
    for (let offset = 0; offset < plain.length;) {
      let end = Math.min(plain.length, offset + 1000);
      if (end < plain.length) {
        const boundary = plain.lastIndexOf(' ', end);
        if (boundary > offset + 650) end = boundary;
        if (/[\uD800-\uDBFF]/.test(plain[end - 1])) end--;
      }
      const fragment = plain.slice(offset, end).trim();
      if (fragment) fragments.push({ id: 's' + (fragments.length + 1), text: fragment, location });
      offset = end;
    }
  }
  if (!fragments.length || !/[\p{L}\p{N}]/u.test(fragments.map(f => f.text).join('')))
    fail(422, type === 'pdf' ? 'This PDF has no usable text. Scans and images need a text edition; OCR is unavailable.' :
      'There is no usable text in this source.');
  if (fragments.length > 160) fail(413, 'The source has too many separate sections. Import a shorter excerpt.');
  return { type, title: trim(title).slice(0, 200), status: 'extracted', characterCount: total, fragments };
}

export async function pinnedTarget(raw, resolve = lookup) {
  let url;
  try { url = new URL(raw); } catch { fail(400, 'Enter a valid public HTTPS URL.'); }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !host.includes('.') ||
      isIP(host) || host.startsWith('[') || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)\.?$/i.test(host))
    fail(422, 'Use a public HTTPS domain on port 443 without credentials.');
  url.hash = '';
  const answers = await resolve(host, { all: true, verbatim: true });
  if (!answers.length || answers.some(({ address }) => {
    try { return ipaddr.process(address).range() !== 'unicast'; } catch { return true; }
  })) fail(422, 'This address resolves to a restricted network.');
  return { url, ...answers[0] };
}

function requestPinned({ url, address, family }, signal) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { signal, agent: false, maxHeaderSize: 16_384, family,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address, family }]) :
        callback(null, address, family),
      headers: { 'Accept': 'text/html, text/plain', 'Accept-Encoding': 'identity', 'User-Agent': 'SkillLoop-SourceImport/3' },
    }, resolve);
    req.once('error', reject);
    req.end();
  });
}

export async function importUrl(raw, { resolve, request = requestPinned, timeoutMs = 9000 } = {}) {
  if (typeof raw !== 'string' || raw.length > 1800) fail(400, 'Enter one public HTTPS URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = new Promise((_, reject) => controller.signal.addEventListener('abort',
    () => reject(new Error('timeout')), { once: true }));
  try {
    let next = raw;
    for (let hop = 0; hop < 4; hop++) {
      const target = await Promise.race([pinnedTarget(next, resolve), abort]);
      const response = await Promise.race([request(target, controller.signal), abort]);
      try {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          next = new URL(response.headers.location, target.url).href;
          continue;
        }
        if (response.statusCode !== 200) fail(422, 'This page is unavailable or restricted. Use another public URL or upload a file.');
        const mime = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
        if (!['text/html', 'text/plain', 'application/xhtml+xml'].includes(mime) ||
            (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity'))
          fail(415, 'Use a public HTML or text page. Download documents and upload the file instead.');
        if (Number(response.headers['content-length']) > FILE_LIMIT) fail(413, 'This page is too large.');
        const text = decoder(await Promise.race([limited(response, FILE_LIMIT), abort]));
        if (mime === 'text/plain') return source('url', target.url.hostname, plainSections(text, target.url.href));
        const $ = load(text);
        $('script,style,noscript,template,iframe,nav,footer,aside,svg,[hidden],[aria-hidden=true]').remove();
        const body = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
        if (body.find('input[type=password]').length && trim(body.text()).length < 1500)
          fail(422, 'This page appears to require sign-in. Import a public page or upload a file.');
        body.find('p,pre,li,h1,h2,h3,h4,section,br,td').append('\n');
        const title = $('title').first().text() || body.find('h1').first().text() || target.url.hostname;
        return source('url', title, plainSections(body.text(), target.url.href));
      } finally { response.destroy(); }
    }
    fail(422, 'This page redirected too many times.');
  } catch (error) {
    if (error.status) throw error;
    fail(422, controller.signal.aborted ? 'The page took too long to respond. Try again or upload a file.' :
      'Could not safely fetch this public HTTPS page. Check the URL or upload a file.');
  } finally { clearTimeout(timer); }
}

function plainSections(text, url) {
  return text.split(/\n\s*\n/u).filter(text => text.trim()).map((text, index) => ({
    text, location: { kind: url ? 'url' : 'paragraph', number: index + 1, ...(url ? { url } : {}) },
  }));
}

function docxXml(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) { reject(error); return; }
      let total = 0;
      let document;
      let types;
      const abort = error => { zip.close(); reject(error); };
      zip.on('error', abort);
      zip.on('end', () => resolve({ document, types }));
      zip.on('entry', entry => {
        total += entry.uncompressedSize;
        if (zip.entryCount > 700 || total > ZIP_LIMIT || entry.isEncrypted() ||
            /(?:vbaProject|activeX|embeddings|customUI)/i.test(entry.fileName)) {
          abort(new Error('Unsafe archive')); return;
        }
        const role = entry.fileName === 'word/document.xml' ? 'document' :
          entry.fileName === '[Content_Types].xml' ? 'types' : null;
        if (!role) { zip.readEntry(); return; }
        if (entry.uncompressedSize > 1_500_000 || (role === 'document' ? document : types)) {
          abort(new Error('Invalid part')); return;
        }
        zip.openReadStream(entry, async (error, stream) => {
          if (error) { abort(error); return; }
          try {
            const body = decoder(await limited(stream, 1_500_000));
            if (role === 'document') document = body;
            else types = body;
            zip.readEntry();
          } catch (error) { abort(error); }
        });
      });
      zip.readEntry();
    });
  });
}

async function docx(bytes) {
  const { document, types } = await docxXml(bytes);
  if (!document || !types?.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') ||
      /<!DOCTYPE|<!ENTITY/i.test(document)) throw Error('Not safe DOCX');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const strictNs = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
  const parser = new SaxesParser({ xmlns: true });
  const tags = [];
  let current = '';
  let number = 0;
  const sections = [];
  parser.on('opentag', tag => tags.push(tag.uri === ns || tag.uri === strictNs ? tag.local : ''));
  parser.on('text', text => { if (tags.at(-1) === 't' && tags.includes('p')) current += text; });
  parser.on('closetag', () => {
    const tag = tags.pop();
    if (tag === 'p') { sections.push({ text: current, location: { kind: 'paragraph', number: ++number } }); current = ''; }
    if (tag === 'tab' || tag === 'br') current += ' ';
  });
  parser.write(document).close();
  return sections;
}

async function pdf(bytes) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const doc = await getDocumentProxy(Uint8Array.from(bytes), { isEvalSupported: false, useSystemFonts: false, useWasm: false });
  try {
    if (doc.numPages > 50) fail(413, 'This PDF exceeds 50 pages. Upload an excerpt.');
    const { text } = await extractText(doc, { mergePages: false });
    return text.map((text, i) => ({ text, location: { kind: 'page', number: i + 1 } }));
  } finally { await doc.loadingTask.destroy(); }
}

export async function importFile(name, bytes) {
  if (typeof name !== 'string' || name.length > 200 || /[\x00-\x1f]/u.test(name))
    fail(400, 'Choose a PDF, DOCX or UTF-8 TXT file.');
  const title = basename(name.replaceAll('\\', '/'));
  const type = title.split('.').at(-1)?.toLowerCase();
  if (bytes.length > FILE_LIMIT) fail(413, 'Files may be at most 3 MB.');
  if (!['pdf', 'docx', 'txt'].includes(type)) fail(415, 'Choose a PDF, DOCX or UTF-8 TXT file.');
  if ((type === 'pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) ||
      (type === 'docx' && !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))))
    fail(415, 'The file contents do not match its extension.');
  try {
    const sections = type === 'txt' ? plainSections(decoder(bytes)) : type === 'docx' ? await docx(bytes) : await pdf(bytes);
    return source(type, title, sections);
  } catch (error) {
    if (error.status) throw error;
    fail(422, 'This ' + type.toUpperCase() + ' cannot be read safely. Export a fresh copy or upload a UTF-8 TXT file.');
  }
}
