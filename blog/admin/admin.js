/* Administrace blogu – jednoduchý editor článku (bez knihoven). */
(function () {
  'use strict';
  var form = document.querySelector('[data-editor-form]');

  // potvrzení smazání
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-confirm]');
    if (b && !window.confirm(b.getAttribute('data-confirm'))) e.preventDefault();
  });

  if (!form) return;
  var editor = form.querySelector('[data-editor]');
  var content = form.querySelector('[data-content]');
  var imageInput = form.querySelector('[data-image-input]');
  var csrf = document.body.getAttribute('data-csrf') || '';
  var dirty = false;

  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (err) { /* starší prohlížeč */ }
  if (!editor.innerHTML.trim()) editor.innerHTML = '<p><br></p>';

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function exec(cmd, val) { editor.focus(); document.execCommand(cmd, false, val); dirty = true; }

  var actions = {
    p: function () { exec('formatBlock', '<p>'); },
    h2: function () { exec('formatBlock', '<h2>'); },
    h3: function () { exec('formatBlock', '<h3>'); },
    bold: function () { exec('bold'); },
    italic: function () { exec('italic'); },
    ul: function () { exec('insertUnorderedList'); },
    ol: function () { exec('insertOrderedList'); },
    quote: function () { exec('formatBlock', '<blockquote>'); },
    link: function () {
      var url = window.prompt('Adresa odkazu (např. https://www.priklad.cz nebo ../../kontakt/index.html):', 'https://');
      if (url && url !== 'https://') exec('createLink', url.trim());
    },
    unlink: function () { exec('unlink'); },
    image: function () { saveRange(); imageInput.click(); }
  };

  form.querySelector('.toolbar').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  form.querySelector('.toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cmd]');
    if (b && actions[b.dataset.cmd]) actions[b.dataset.cmd]();
  });

  // vložený text: jen čistý text rozdělený do odstavců (formátování z Wordu apod. se zahodí)
  editor.addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    e.preventDefault();
    var parts = text.replace(/\r/g, '').split(/\n{2,}/).map(function (p) { return p.trim(); }).filter(Boolean);
    var html = parts.length > 1 ? parts.map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('') : esc(text).replace(/\n/g, '<br>');
    exec('insertHTML', html);
  });
  editor.addEventListener('input', function () { dirty = true; });

  // obrázek do textu
  var range = null;
  function saveRange() { var s = window.getSelection(); if (s.rangeCount && editor.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); }
  imageInput.addEventListener('change', function () {
    var file = imageInput.files[0];
    if (!file) return;
    var alt = window.prompt('Krátký popis obrázku (pomáhá ve vyhledávání):', '') || '';
    var fd = new FormData();
    fd.append('action', 'upload');
    fd.append('csrf', csrf);
    fd.append('image', file);
    editor.classList.add('is-busy');
    fetch('index.php', { method: 'POST', body: fd, headers: { 'X-CSRF': csrf }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { window.alert(d.error || 'Obrázek se nepodařilo nahrát.'); return; }
        editor.focus();
        if (range) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(range); }
        exec('insertHTML', '<figure><img src="' + esc(d.url) + '" alt="' + esc(alt) + '"></figure><p><br></p>');
      })
      .catch(function () { window.alert('Obrázek se nepodařilo nahrát. Zkuste to znovu.'); })
      .then(function () { editor.classList.remove('is-busy'); imageInput.value = ''; });
  });

  form.addEventListener('submit', function () { content.value = editor.innerHTML; dirty = false; });
  form.addEventListener('input', function () { dirty = true; });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
