<?php
// Administrace blogu Emplastrum Design. Přihlášení heslem, přidání / úprava / smazání článku,
// nahrání obrázků. Po každé změně se blog přegeneruje do statických stránek (viz lib.php).
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('empblog');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();

$authFile = data_dir() . '/auth.php';
$keyFile = data_dir() . '/setup-key.php';
$auth = is_file($authFile) ? (array)(include $authFile) : null;

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
$csrf = $_SESSION['csrf'];
$logged = !empty($_SESSION['blog_admin']) && $auth && hash_equals((string)$_SESSION['blog_admin'], substr((string)$auth['hash'], -16));

function redirect(string $q = ''): void { header('Location: index.php' . $q, true, 303); exit; }
function flash(string $msg, string $type = 'ok'): void { $_SESSION['flash'] = [$type, $msg]; }
function check_csrf(): void {
    $t = (string)($_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF'] ?? '');
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), $t)) { http_response_code(403); exit('Platnost formuláře vypršela. Načtěte stránku znovu.'); }
}

// --- ochrana přihlášení: po 5 chybách 15 minut pauza (podle IP)
function login_locked(): bool {
    $d = read_data('login-attempts', []);
    $r = $d[$_SERVER['REMOTE_ADDR'] ?? '?'] ?? ['n' => 0, 't' => 0];
    return $r['n'] >= 5 && time() - $r['t'] < 900;
}
function login_failed(bool $reset = false): void {
    $d = read_data('login-attempts', []);
    $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
    if ($reset) unset($d[$ip]);
    else { $r = $d[$ip] ?? ['n' => 0, 't' => 0]; if (time() - $r['t'] > 900) $r['n'] = 0; $d[$ip] = ['n' => $r['n'] + 1, 't' => time()]; }
    write_data('login-attempts', $d);
}

$action = (string)($_POST['action'] ?? '');

// Příliš velký požadavek (např. obří fotka): PHP zahodí celý formulář. Místo tichého
// vyprázdnění editoru to návštěvníkovi srozumitelně řekneme.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$_POST && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    flash('Odeslaná data jsou pro server příliš velká (nejvýše ' . ini_get('post_max_size') . 'B). Zkuste menší fotku – text článku prosím zkopírujte znovu.', 'err');
    redirect(isset($_GET['edit']) ? '?edit=' . rawurlencode((string)$_GET['edit']) : '');
}

// ------------------------------------------------------------------ první nastavení hesla
if (!$auth) {
    $err = '';
    if ($action === 'setup') {
        check_csrf();
        $key = is_file($keyFile) ? trim((string)(include $keyFile)) : '';
        $pass = (string)($_POST['password'] ?? '');
        if ($key === '' || login_locked()) $err = 'Nastavení není dostupné. Chybí soubor blog/data/setup-key.php.';
        elseif (!hash_equals($key, trim((string)($_POST['key'] ?? '')))) { login_failed(); $err = 'Klíč pro nastavení nesouhlasí.'; }
        elseif (mb_strlen($pass) < 10) $err = 'Heslo musí mít alespoň 10 znaků.';
        elseif ($pass !== (string)($_POST['password2'] ?? '')) $err = 'Hesla se neshodují.';
        else {
            $hash = password_hash($pass, PASSWORD_DEFAULT);
            file_put_contents($authFile, "<?php\nreturn " . var_export(['hash' => $hash], true) . ";\n", LOCK_EX);
            @unlink($keyFile);
            session_regenerate_id(true);
            $_SESSION['blog_admin'] = substr($hash, -16);
            flash('Heslo je nastavené. Vítejte v administraci blogu.');
            redirect();
        }
    }
    page('Nastavení administrace', function () use ($csrf, $err) { ?>
      <form class="card narrow" method="post" autocomplete="off">
        <h1>Nastavení administrace blogu</h1>
        <p class="muted">Jednorázové nastavení. Klíč najdete v souboru <code>blog/data/setup-key.php</code> na hostingu.</p>
        <?php if ($err): ?><p class="alert"><?= h($err) ?></p><?php endif; ?>
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="setup">
        <label>Klíč pro nastavení<input name="key" required></label>
        <label>Nové heslo (alespoň 10 znaků)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
        <label>Heslo znovu<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label>
        <button class="btn" type="submit">Nastavit heslo</button>
      </form>
    <?php });
    exit;
}

// ------------------------------------------------------------------ přihlášení / odhlášení
if ($action === 'login') {
    check_csrf();
    if (login_locked()) { flash('Příliš mnoho pokusů. Zkuste to za 15 minut.', 'err'); redirect(); }
    if (password_verify((string)($_POST['password'] ?? ''), (string)$auth['hash'])) {
        login_failed(true);
        session_regenerate_id(true);
        $_SESSION['blog_admin'] = substr((string)$auth['hash'], -16);
        redirect();
    }
    login_failed(); usleep(600000);
    flash('Nesprávné heslo.', 'err'); redirect();
}
if ($action === 'logout') { check_csrf(); $_SESSION = []; session_destroy(); header('Location: index.php', true, 303); exit; }

if (!$logged) {
    page('Přihlášení', function () use ($csrf) { ?>
      <form class="card narrow" method="post">
        <h1>Administrace blogu</h1>
        <?php show_flash(); ?>
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="login">
        <label>Heslo<input type="password" name="password" required autofocus autocomplete="current-password"></label>
        <button class="btn" type="submit">Přihlásit se</button>
      </form>
    <?php });
    exit;
}

// ------------------------------------------------------------------ akce přihlášeného
$posts = load_posts();

if ($action === 'upload') { // obrázek z editoru (JSON)
    check_csrf();
    header('Content-Type: application/json; charset=utf-8');
    $r = isset($_FILES['image']) ? store_upload($_FILES['image']) : ['error' => 'Chybí soubor.'];
    echo json_encode(isset($r['file']) ? ['ok' => true, 'url' => '../uploads/' . $r['file']] : ['ok' => false, 'error' => $r['error']], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'save') {
    check_csrf();
    $id = preg_replace('/[^a-z0-9]/', '', (string)($_POST['id'] ?? '')) ?: bin2hex(random_bytes(6));
    $old = find_post($posts, $id);
    $title = trim(preg_replace('/\s+/u', ' ', (string)($_POST['title'] ?? '')) ?? '');
    $errors = [];
    if (mb_strlen($title) < 3) $errors[] = 'Vyplňte nadpis článku.';
    $content = sanitize_html((string)($_POST['content'] ?? ''));
    if (plain_text($content, 100000) === '' ) $errors[] = 'Článek nemá žádný text.';
    $date = (string)($_POST['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = date('Y-m-d');

    $cover = $old['cover'] ?? '';
    if (!empty($_POST['cover_remove'])) $cover = '';
    if (!empty($_FILES['cover']['name'])) {
        $r = store_upload($_FILES['cover']);
        if (isset($r['error'])) $errors[] = 'Úvodní obrázek: ' . $r['error']; else $cover = $r['file'];
    }

    $slugIn = trim((string)($_POST['slug'] ?? ''));
    $slug = unique_slug($posts, slugify($slugIn !== '' ? $slugIn : $title), $id);

    $post = [
        'id' => $id,
        'slug' => $slug,
        'title' => $title,
        'perex' => trim(preg_replace('/\s+/u', ' ', mb_substr((string)($_POST['perex'] ?? ''), 0, 400)) ?? ''),
        'date' => $date,
        'cover' => $cover,
        'cover_alt' => trim(mb_substr((string)($_POST['cover_alt'] ?? ''), 0, 200)),
        'content' => $content,
        'published' => !empty($_POST['published']),
        'created' => $old['created'] ?? date('c'),
        'updated' => date('c'),
    ];
    if ($errors) {
        $_SESSION['draft'] = $post;
        flash(implode(' ', $errors), 'err');
        redirect('?edit=' . ($old ? $id : 'new'));
    }
    $posts = array_values(array_filter($posts, fn($p) => $p['id'] !== $id));
    $posts[] = $post;
    save_posts($posts);
    $warn = build_all();
    flash(($post['published'] ? 'Článek je uložený a zveřejněný.' : 'Článek je uložený jako koncept (na webu se nezobrazuje).') . ($warn ? ' ' . implode(' ', $warn) : ''));
    redirect('?edit=' . $id);
}

if ($action === 'delete') {
    check_csrf();
    $id = (string)($_POST['id'] ?? '');
    $posts = array_values(array_filter($posts, fn($p) => $p['id'] !== $id));
    save_posts($posts);
    build_all();
    flash('Článek je smazaný.');
    redirect();
}

if ($action === 'rebuild') { check_csrf(); $w = build_all(); flash('Blog je přegenerovaný.' . ($w ? ' ' . implode(' ', $w) : '')); redirect(); }

// ------------------------------------------------------------------ obrazovky
if (isset($_GET['edit'])) {
    $id = (string)$_GET['edit'];
    $post = $_SESSION['draft'] ?? ($id === 'new' ? null : find_post($posts, $id));
    unset($_SESSION['draft']);
    if ($id !== 'new' && !$post) redirect();
    $post = $post ?: ['id' => '', 'slug' => '', 'title' => '', 'perex' => '', 'date' => date('Y-m-d'), 'cover' => '', 'cover_alt' => '', 'content' => '', 'published' => true];
    page($post['title'] !== '' ? 'Upravit článek' : 'Nový článek', function () use ($post, $csrf) { ?>
      <div class="bar"><a class="back" href="index.php">← Všechny články</a>
        <?php if (!empty($post['published']) && $post['slug'] !== '' && is_file(blog_dir() . '/' . $post['slug'] . '/index.html')): ?><a class="btn ghost" href="../<?= h($post['slug']) ?>/index.html" target="_blank" rel="noopener">Zobrazit na webu ↗</a><?php endif; ?>
      </div>
      <?php show_flash(); ?>
      <form class="editor-form" method="post" enctype="multipart/form-data" data-editor-form>
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="save"><input type="hidden" name="id" value="<?= h($post['id']) ?>">
        <div class="grid">
          <div class="main-col">
            <label class="title-field">Nadpis<input name="title" value="<?= h($post['title']) ?>" required maxlength="160" placeholder="Například: Betonová stěrka do koupelny" data-title></label>
            <label>Perex – krátké shrnutí (zobrazí se v přehledu a ve vyhledávači)<textarea name="perex" rows="3" maxlength="400"><?= h($post['perex']) ?></textarea></label>
            <div class="field">
              <span class="lbl">Text článku</span>
              <div class="toolbar" role="toolbar" aria-label="Formátování">
                <button type="button" data-cmd="p">Odstavec</button>
                <button type="button" data-cmd="h2">Nadpis</button>
                <button type="button" data-cmd="h3">Podnadpis</button>
                <span class="sep"></span>
                <button type="button" data-cmd="bold"><b>B</b></button>
                <button type="button" data-cmd="italic"><i>I</i></button>
                <span class="sep"></span>
                <button type="button" data-cmd="ul">• Seznam</button>
                <button type="button" data-cmd="ol">1. Seznam</button>
                <button type="button" data-cmd="quote">Citace</button>
                <span class="sep"></span>
                <button type="button" data-cmd="link">Odkaz</button>
                <button type="button" data-cmd="unlink">Zrušit odkaz</button>
                <button type="button" data-cmd="image">Vložit obrázek</button>
              </div>
              <div class="editor prose" contenteditable="true" data-editor><?= $post['content'] ?></div>
              <textarea name="content" hidden data-content><?= h($post['content']) ?></textarea>
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-image-input>
              <p class="hint">Text můžete vložit i zkopírovaný z Wordu nebo e-mailu, formátování se vyčistí.</p>
            </div>
          </div>
          <aside class="side-col">
            <div class="card">
              <label class="check"><input type="checkbox" name="published" value="1" <?= !empty($post['published']) ? 'checked' : '' ?>> Zveřejnit na webu</label>
              <label>Datum<input type="date" name="date" value="<?= h($post['date']) ?>"></label>
              <label>Adresa článku<input name="slug" value="<?= h($post['slug']) ?>" placeholder="vytvoří se z nadpisu" data-slug></label>
              <button class="btn wide" type="submit">Uložit článek</button>
            </div>
            <div class="card">
              <span class="lbl">Úvodní obrázek</span>
              <?php if ($post['cover']): ?><img class="cover-prev" src="../uploads/<?= h($post['cover']) ?>" alt=""><label class="check"><input type="checkbox" name="cover_remove" value="1"> Odebrat obrázek</label><?php endif; ?>
              <input type="file" name="cover" accept="image/jpeg,image/png,image/webp">
              <label>Popis obrázku (pro vyhledávače)<input name="cover_alt" value="<?= h($post['cover_alt']) ?>" maxlength="200"></label>
            </div>
            <?php if ($post['id'] !== ''): ?>
            <div class="card danger"><span class="lbl">Smazání</span><button class="btn red wide" type="submit" form="del-form" data-confirm="Opravdu smazat článek „<?= h($post['title']) ?>“? Tuto akci nelze vrátit.">Smazat článek</button></div>
            <?php endif; ?>
          </aside>
        </div>
      </form>
      <?php if ($post['id'] !== ''): ?>
      <form id="del-form" method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= h($post['id']) ?>"></form>
      <?php endif; ?>
    <?php }, $csrf);
    exit;
}

page('Články', function () use ($posts, $csrf) { ?>
  <div class="bar"><h1>Články na blogu</h1><a class="btn" href="?edit=new">+ Nový článek</a></div>
  <?php show_flash(); ?>
  <?php if (!$posts): ?><p class="card">Zatím tu není žádný článek. Začněte tlačítkem <strong>Nový článek</strong>.</p><?php else: ?>
  <ul class="list">
    <?php foreach ($posts as $p): ?>
    <li class="item">
      <?php if ($p['cover']): ?><img src="../uploads/<?= h($p['cover']) ?>" alt=""><?php else: ?><span class="noimg"></span><?php endif; ?>
      <div class="item-body"><a class="item-title" href="?edit=<?= h($p['id']) ?>"><?= h($p['title']) ?></a>
        <span class="muted"><?= h(cz_date($p['date'])) ?> · <?= !empty($p['published']) ? '<span class="pub">Zveřejněno</span>' : '<span class="draft">Koncept</span>' ?></span></div>
      <div class="item-actions"><a class="btn ghost" href="?edit=<?= h($p['id']) ?>">Upravit</a>
        <?php if (!empty($p['published'])): ?><a class="btn ghost" href="../<?= h($p['slug']) ?>/index.html" target="_blank" rel="noopener">Zobrazit ↗</a><?php endif; ?></div>
    </li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
  <form method="post" class="foot-actions"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="rebuild"><button class="link-btn" type="submit">Přegenerovat stránky blogu</button></form>
<?php }, $csrf);

// ------------------------------------------------------------------ rozvržení stránky
function show_flash(): void {
    if (empty($_SESSION['flash'])) return;
    [$t, $m] = $_SESSION['flash']; unset($_SESSION['flash']);
    echo '<p class="' . ($t === 'err' ? 'alert' : 'notice') . '" role="status">' . h($m) . '</p>';
}

function page(string $title, callable $body, string $csrf = ''): void { ?>
<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= h($title) ?> | Administrace blogu</title>
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="admin.css?v=1">
<script src="admin.js?v=1" defer></script>
</head>
<body<?= $csrf !== '' ? ' data-csrf="' . h($csrf) . '"' : '' ?>>
<header class="top"><a class="brand" href="index.php"><img src="../../assets/brand/emplastrum-logo.png?v=2" alt="Emplastrum Design" height="34"> <span>Blog</span></a>
<?php if ($csrf !== ''): ?><nav><a href="../index.html" target="_blank" rel="noopener">Blog na webu ↗</a><form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="logout"><button class="link-btn" type="submit">Odhlásit</button></form></nav><?php endif; ?>
</header>
<main class="wrap"><?php $body(); ?></main>
</body>
</html>
<?php }
