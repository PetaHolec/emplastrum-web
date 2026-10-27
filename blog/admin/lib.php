<?php
// Blog Emplastrum Design – jádro: úložiště článků, čištění obsahu, generování statických stránek.
// Články se ukládají do blog/data/posts.json. Po každé změně se přegenerují statické stránky
// blog/index.html a blog/<slug>/index.html a blogová část sitemap.xml – web tak zůstává čisté HTML
// (rychlé načítání, dobré pro vyhledávače) a PHP je potřeba jen pro administraci.
declare(strict_types=1);

const BLOG_SITE_URL = 'https://www.brnoshowroom.cz';

function blog_dir(): string { return dirname(__DIR__); }               // …/site/blog
function site_dir(): string { return dirname(__DIR__, 2); }            // …/site
function data_dir(): string { return blog_dir() . '/data'; }
function uploads_dir(): string { return blog_dir() . '/uploads'; }

function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

// ------------------------------------------------------------------ úložiště
// Data se ukládají do .php souborů, které začínají příkazem exit – i kdyby hosting ignoroval
// .htaccess, z webu se jejich obsah přečíst nedá (PHP skončí hned na prvním řádku).
const DATA_GUARD = "<?php exit; ?" . ">\n";

function read_data(string $name, $default) {
    $f = data_dir() . '/' . $name . '.php';
    if (!is_file($f)) return $default;
    $raw = (string)file_get_contents($f);
    if (strpos($raw, DATA_GUARD) === 0) $raw = substr($raw, strlen(DATA_GUARD));
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function write_data(string $name, $data): void {
    $f = data_dir() . '/' . $name . '.php';
    $tmp = $f . '.tmp';
    file_put_contents($tmp, DATA_GUARD . json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    rename($tmp, $f);
}

function load_posts(): array { return read_data('posts', []); }

// Pořadí: nejnovější datum vydání první; při stejném datu ten, který byl přidán později.
function sort_posts(array $posts): array {
    usort($posts, fn($a, $b) => strcmp($b['date'] . ($b['created'] ?? ''), $a['date'] . ($a['created'] ?? '')));
    return $posts;
}

function save_posts(array $posts): void {
    $posts = sort_posts($posts);
    write_data('posts', array_values($posts));
}

function find_post(array $posts, string $id): ?array {
    foreach ($posts as $p) if ($p['id'] === $id) return $p;
    return null;
}

function slugify(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $map = ['á'=>'a','č'=>'c','ď'=>'d','é'=>'e','ě'=>'e','í'=>'i','ň'=>'n','ó'=>'o','ř'=>'r','š'=>'s','ť'=>'t','ú'=>'u','ů'=>'u','ý'=>'y','ž'=>'z','ä'=>'a','ö'=>'o','ü'=>'u','ľ'=>'l','ĺ'=>'l','ŕ'=>'r'];
    $s = strtr($s, $map);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    return substr($s, 0, 90) ?: 'clanek';
}

function unique_slug(array $posts, string $slug, string $ownId): string {
    $reserved = ['admin', 'data', 'uploads'];
    $base = $slug; $i = 2;
    while (in_array($slug, $reserved, true) || array_filter($posts, fn($p) => $p['slug'] === $slug && $p['id'] !== $ownId)) {
        $slug = $base . '-' . $i++;
    }
    return $slug;
}

function cz_date(string $ymd): string {
    $m = ['', 'ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
    $t = strtotime($ymd) ?: time();
    return (int)date('j', $t) . '. ' . $m[(int)date('n', $t)] . ' ' . date('Y', $t);
}

// ------------------------------------------------------------------ čištění obsahu z editoru
// Povolené jsou jen značky běžného článku; vše ostatní se odstraní (text zůstane).
function sanitize_html(string $html): string {
    $html = trim($html);
    if ($html === '') return '';
    $doc = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    $root = $doc->getElementById('root');
    if (!$root) return '';

    $allowed = ['p', 'h2', 'h3', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'br', 'figure', 'figcaption'];
    $rename = ['b' => 'strong', 'i' => 'em', 'h1' => 'h2', 'h4' => 'h3', 'h5' => 'h3', 'h6' => 'h3', 'div' => 'p'];

    $walk = function (DOMNode $node) use (&$walk, $doc, $allowed, $rename) {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof DOMComment) { $node->removeChild($child); continue; }
            if (!$child instanceof DOMElement) continue;
            $tag = strtolower($child->nodeName);
            if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'], true)) {
                $node->removeChild($child); continue;
            }
            if (isset($rename[$tag])) {
                $new = $doc->createElement($rename[$tag]);
                while ($child->firstChild) $new->appendChild($child->firstChild);
                $node->replaceChild($new, $child);
                $child = $new; $tag = $rename[$tag];
            }
            if (!in_array($tag, $allowed, true)) {
                $walk($child);
                while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                $node->removeChild($child);
                continue;
            }
            // atributy: jen href u odkazů, src a alt u obrázků
            $keep = [];
            if ($tag === 'a') {
                $href = trim($child->getAttribute('href'));
                if (preg_match('~^(https?://|mailto:|tel:|/|\.\./|#)~i', $href)) $keep['href'] = $href;
            }
            if ($tag === 'img') {
                $src = trim($child->getAttribute('src'));
                if (!preg_match('~^\.\./uploads/[A-Za-z0-9._-]+$~', $src)) { $node->removeChild($child); continue; }
                $keep['src'] = $src;
                $keep['alt'] = trim($child->getAttribute('alt'));
            }
            foreach (iterator_to_array($child->attributes) as $attr) $child->removeAttribute($attr->nodeName);
            foreach ($keep as $k => $v) $child->setAttribute($k, $v);
            if ($tag === 'a') {
                if (!isset($keep['href'])) { // odkaz bez platné adresy → jen text
                    while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                    $node->removeChild($child); continue;
                }
                $child->setAttribute('class', 'link');
                if (preg_match('~^https?://~i', $keep['href'])) { $child->setAttribute('target', '_blank'); $child->setAttribute('rel', 'noopener'); }
            }
            if ($tag === 'img') { $child->setAttribute('loading', 'lazy'); $child->setAttribute('decoding', 'async'); }
            $walk($child);
        }
    };
    $walk($root);

    // text přímo v kořeni zabalit do odstavců, prázdné odstavce pryč
    $out = '';
    $inline = '';
    foreach (iterator_to_array($root->childNodes) as $child) {
        $isBlock = $child instanceof DOMElement && in_array(strtolower($child->nodeName), ['p', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'figure'], true);
        if ($isBlock) {
            if (trim(strip_tags($inline)) !== '') $out .= '<p>' . trim($inline) . '</p>';
            $inline = '';
            $out .= $doc->saveHTML($child);
        } elseif ($child instanceof DOMElement && strtolower($child->nodeName) === 'img') {
            $out .= '<figure>' . $doc->saveHTML($child) . '</figure>';
        } else {
            $inline .= $doc->saveHTML($child);
        }
    }
    if (trim(strip_tags($inline)) !== '') $out .= '<p>' . trim($inline) . '</p>';
    $out = preg_replace('~<p>(\s|&nbsp;|<br\s*/?>)*</p>~i', '', $out) ?? $out;
    return trim($out);
}

function plain_text(string $html, int $len = 160): string {
    $t = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES, 'UTF-8')) ?? '');
    return mb_strlen($t) > $len ? rtrim(mb_substr($t, 0, $len - 1)) . '…' : $t;
}

// ------------------------------------------------------------------ obrázky
// Nahraný obrázek se zmenší (max. 1800 px) a uloží jako WebP, pokud to hosting umí; jinak beze změny.
function store_upload(array $file): array {
    $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if (in_array($err, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) return ['error' => 'Obrázek je pro server příliš velký (nejvýše ' . ini_get('upload_max_filesize') . 'B). Zkuste menší fotku.'];
    if ($err !== UPLOAD_ERR_OK) return ['error' => 'Obrázek se nepodařilo nahrát. Zkuste to znovu.'];
    if ((int)$file['size'] > 25 * 1024 * 1024) return ['error' => 'Obrázek je větší než 25 MB.'];
    $tmp = (string)$file['tmp_name'];
    if (!is_uploaded_file($tmp) && PHP_SAPI !== 'cli') return ['error' => 'Neplatný soubor.'];
    $info = @getimagesize($tmp);
    $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($types[$info[2]])) return ['error' => 'Podporované jsou obrázky JPG, PNG a WebP.'];
    [$w, $hgt] = $info;
    $base = slugify(pathinfo((string)$file['name'], PATHINFO_FILENAME));
    $name = substr($base, 0, 40) . '-' . bin2hex(random_bytes(4));

    if (function_exists('imagewebp') && function_exists('imagecreatefromstring')) {
        $src = @imagecreatefromstring((string)file_get_contents($tmp));
        if ($src) {
            $max = 1800;
            if ($w > $max) {
                $nw = $max; $nh = (int)round($hgt * $max / $w);
                $dst = imagecreatetruecolor($nw, $nh);
                imagealphablending($dst, false); imagesavealpha($dst, true);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $hgt);
                $src = $dst; $w = $nw; $hgt = $nh;
            }
            $path = uploads_dir() . '/' . $name . '.webp';
            if (imagewebp($src, $path, 80)) { return ['file' => $name . '.webp', 'w' => $w, 'h' => $hgt]; }
        }
    }
    $file2 = $name . '.' . $types[$info[2]];
    $ok = PHP_SAPI === 'cli' ? copy($tmp, uploads_dir() . '/' . $file2) : move_uploaded_file($tmp, uploads_dir() . '/' . $file2);
    return $ok ? ['file' => $file2, 'w' => $w, 'h' => $hgt] : ['error' => 'Obrázek se nepodařilo uložit.'];
}

function image_size(string $file): array {
    $p = uploads_dir() . '/' . basename($file);
    $i = is_file($p) ? @getimagesize($p) : false;
    return $i ? [$i[0], $i[1]] : [1600, 900];
}

// ------------------------------------------------------------------ generování stránek
function shell(): string { return (string)file_get_contents(__DIR__ . '/shell.html'); }

// šablona je pro stránku o 1 úroveň hluboko (blog/index.html); článek je o úroveň níž
function deepen(string $html): string {
    $html = str_replace(['="../', ' ../', ',../'], ['="../../', ' ../../', ',../../'], $html);
    return $html;
}

function fill(string $shell, array $v): string {
    return strtr($shell, [
        '{{TITLE}}' => h($v['title']),
        '{{DESCRIPTION}}' => h($v['description']),
        '{{CANONICAL}}' => h($v['canonical']),
        '{{OG_TYPE}}' => h($v['og_type'] ?? 'website'),
        '{{OG_IMAGE}}' => h($v['og_image'] ?? BLOG_SITE_URL . '/og/home.jpg'),
        '{{JSONLD}}' => '<script type="application/ld+json">' . json_encode($v['jsonld'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . '</script>',
        '{{MAIN}}' => $v['main'],
    ]);
}

function arrow(): string {
    return '<svg class="btn__arrow" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false"><path d="M3 12h17M14 5.5 20.5 12 14 18.5"/></svg>';
}

function card(array $p, string $prefix): string {
    // článek bez úvodní fotky dostane texturu stěrky, aby byly všechny karty stejně velké
    if (!empty($p['cover'])) {
        [$w, $hh] = image_size($p['cover']);
        $src = $prefix . 'uploads/' . $p['cover'];
    } else {
        [$w, $hh] = [960, 960];
        $src = $prefix . '../assets/img/showroom-textura-22985e-960.webp';
    }
    $img = '<span class="blog-card__media"><img src="' . h($src) . '" width="' . $w . '" height="' . $hh . '" alt="" loading="lazy" decoding="async"></span>';
    return '<article class="blog-card" data-reveal><a class="blog-card__link" href="' . h($prefix . $p['slug'] . '/index.html') . '">' . $img
        . '<span class="blog-card__body"><time class="blog-card__date" datetime="' . h($p['date']) . '">' . h(cz_date($p['date'])) . '</time>'
        . '<span class="blog-card__title">' . h($p['title']) . '</span>'
        . '<span class="blog-card__text">' . h($p['perex']) . '</span>'
        . '<span class="blog-card__more">Číst článek' . arrow() . '</span></span></a></article>';
}

function render_index(array $published): string {
    $main = '<section class="page-head blog-head"><div class="container">'
        . '<nav aria-label="Drobečková navigace"><ol class="crumbs"><li><a href="../index.html">Úvod</a></li><li><span aria-current="page">Blog</span></li></ol></nav>'
        . '<div class="page-head__grid"><div class="stack" style="--gap:1.4rem"><h1 class="h-title">Blog</h1></div>'
        . '<div class="stack" style="--gap:1.6rem"><p class="lede">Rady a zkušenosti z praxe: betonové stěrky, epoxidové a polyuretanové podlahy, výběr materiálu i údržba.</p></div></div>'
        . '</div></section>';
    if (!$published) {
        $main .= '<section class="section--tight" style="padding-top:0"><div class="container"><p class="lede">Připravujeme první články.</p></div></section>';
    } else {
        $cards = '';
        foreach ($published as $p) $cards .= card($p, '');
        $main .= '<section class="section--tight blog-list" style="padding-top:0"><div class="container"><div class="blog-grid">' . $cards . '</div></div></section>';
    }
    return fill(shell(), [
        'title' => 'Blog – rady k betonovým stěrkám a litým podlahám | Emplastrum Design',
        'description' => 'Články o betonových stěrkách, epoxidových a polyuretanových podlahách: výběr materiálu, použití v koupelně i garáži, údržba a realizace v Brně.',
        'canonical' => BLOG_SITE_URL . '/blog/',
        'jsonld' => ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Úvod', 'item' => BLOG_SITE_URL . '/'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Blog', 'item' => BLOG_SITE_URL . '/blog/'],
        ]],
        'main' => $main,
    ]);
}

function render_post(array $p, array $published): string {
    $url = BLOG_SITE_URL . '/blog/' . $p['slug'] . '/';
    $cover = '';
    $ogImage = BLOG_SITE_URL . '/og/home.jpg';
    if (!empty($p['cover'])) {
        [$w, $hh] = image_size($p['cover']);
        $cover = '<figure class="blog-cover" data-reveal><img src="../uploads/' . h($p['cover']) . '" width="' . $w . '" height="' . $hh . '" alt="' . h($p['cover_alt'] ?: $p['title']) . '" fetchpriority="high" decoding="async"></figure>';
        $ogImage = BLOG_SITE_URL . '/blog/uploads/' . $p['cover'];
    }
    $others = array_values(array_filter($published, fn($o) => $o['id'] !== $p['id']));
    $more = '';
    if ($others) {
        $cards = '';
        foreach (array_slice($others, 0, 3) as $o) $cards .= card($o, '../');
        $more = '<section class="section blog-more" aria-labelledby="dalsi-h"><div class="container"><h2 class="h2" id="dalsi-h">Další články</h2><div class="blog-grid blog-grid--more">' . $cards . '</div></div></section>';
    }
    $main = '<article class="blog-article">'
        . '<header class="page-head blog-head"><div class="container">'
        . '<nav aria-label="Drobečková navigace"><ol class="crumbs"><li><a href="../../index.html">Úvod</a></li><li><a href="../index.html">Blog</a></li><li><span aria-current="page">' . h($p['title']) . '</span></li></ol></nav>'
        . '<div class="blog-head__inner"><time class="blog-head__date" datetime="' . h($p['date']) . '">' . h(cz_date($p['date'])) . '</time>'
        . '<h1 class="h-title blog-head__title">' . h($p['title']) . '</h1>'
        . ($p['perex'] !== '' ? '<p class="lede blog-head__perex">' . h($p['perex']) . '</p>' : '') . '</div>'
        . '</div></header>'
        . '<div class="container blog-body">' . $cover . '<div class="prose blog-prose">' . $p['content'] . '</div>'
        . '<aside class="blog-cta" aria-label="Poptávka"><p class="blog-cta__t">Řešíte podobný prostor?</p><p>Poradíme s výběrem materiálu a vzorky si můžete prohlédnout v showroomu v Želešicích u Brna.</p>'
        . '<div class="btn-row"><a class="btn btn--light" href="../../kontakt/index.html#poptavka">Nezávazně poptat' . arrow() . '</a><a class="btn btn--ghost" href="../../kontakt/index.html?typ=showroom#poptavka">Domluvit návštěvu</a></div></aside>'
        . '</div></article>' . $more;

    // šablona se posune o úroveň níž; obsah článku už má cesty pro blog/<slug>/
    return fill(deepen(shell()), [
        'title' => $p['title'] . ' | Blog Emplastrum Design',
        'description' => $p['perex'] !== '' ? $p['perex'] : plain_text($p['content']),
        'canonical' => $url,
        'og_type' => 'article',
        'og_image' => $ogImage,
        'jsonld' => [
            ['@context' => 'https://schema.org', '@type' => 'BlogPosting', 'headline' => $p['title'], 'description' => $p['perex'], 'datePublished' => $p['date'], 'dateModified' => substr((string)($p['updated'] ?? $p['date']), 0, 10), 'image' => $ogImage, 'mainEntityOfPage' => $url,
                'author' => ['@type' => 'Organization', 'name' => 'Emplastrum Design', 'url' => BLOG_SITE_URL . '/'], 'publisher' => ['@type' => 'Organization', 'name' => 'Emplastrum Design', 'logo' => ['@type' => 'ImageObject', 'url' => BLOG_SITE_URL . '/assets/brand/emplastrum-logo.png']]],
            ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Úvod', 'item' => BLOG_SITE_URL . '/'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => 'Blog', 'item' => BLOG_SITE_URL . '/blog/'],
                ['@type' => 'ListItem', 'position' => 3, 'name' => $p['title'], 'item' => $url],
            ]],
        ],
        'main' => $main,
    ]);
}

function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (array_diff((array)scandir($dir), ['.', '..']) as $f) {
        $p = $dir . '/' . $f;
        is_dir($p) ? rrmdir($p) : unlink($p);
    }
    rmdir($dir);
}

// Přegeneruje celý blog. Vrací seznam varování (např. nelze zapsat sitemap).
function build_all(): array {
    $warn = [];
    $posts = load_posts();
    $published = array_values(array_filter($posts, fn($p) => !empty($p['published'])));
    $published = sort_posts($published);

    // smazat složky článků, které už nejsou zveřejněné nebo změnily adresu
    $keep = array_map(fn($p) => $p['slug'], $published);
    foreach ((array)scandir(blog_dir()) as $d) {
        if (in_array($d, ['.', '..', 'admin', 'data', 'uploads'], true)) continue;
        $path = blog_dir() . '/' . $d;
        if (is_dir($path) && is_file($path . '/index.html') && !in_array($d, $keep, true)) rrmdir($path);
    }

    file_put_contents(blog_dir() . '/index.html', render_index($published), LOCK_EX);
    foreach ($published as $p) {
        $dir = blog_dir() . '/' . $p['slug'];
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        file_put_contents($dir . '/index.html', render_post($p, $published), LOCK_EX);
    }

    // blogová část sitemap.xml mezi značkami
    $sm = site_dir() . '/sitemap.xml';
    if (is_file($sm) && is_writable($sm)) {
        $xml = (string)file_get_contents($sm);
        $lines = '  <url><loc>' . BLOG_SITE_URL . '/blog/</loc><lastmod>' . date('Y-m-d') . '</lastmod></url>' . "\n";
        foreach ($published as $p) $lines .= '  <url><loc>' . BLOG_SITE_URL . '/blog/' . $p['slug'] . '/</loc><lastmod>' . substr((string)($p['updated'] ?? $p['date']), 0, 10) . '</lastmod></url>' . "\n";
        $block = "  <!-- BLOG START -->\n" . $lines . "  <!-- BLOG END -->";
        if (strpos($xml, '<!-- BLOG START -->') !== false) $xml = preg_replace('~  <!-- BLOG START -->.*?<!-- BLOG END -->~s', $block, $xml) ?? $xml;
        else $xml = str_replace('</urlset>', $block . "\n</urlset>", $xml);
        file_put_contents($sm, $xml, LOCK_EX);
    } else {
        $warn[] = 'Soubor sitemap.xml nelze zapsat, blogové adresy v něm nebudou aktuální.';
    }
    return $warn;
}
