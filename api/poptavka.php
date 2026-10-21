<?php
declare(strict_types=1);
/**
 * Poptávkový formulář – příjem, validace a odeslání e-mailem.
 *
 * Odpovědi (JSON, pokud klient pošle Accept: application/json):
 *   200 {"ok":true}                               – zpráva byla předána poštovnímu systému
 *   422 {"ok":false,"errors":{"pole":"zpráva"}}   – chyba validace
 *   429 {"ok":false,"error":"rate_limited"}       – příliš mnoho pokusů
 *   500 {"ok":false,"error":"send_failed"}        – e-mail se nepodařilo předat k odeslání
 * Bez JavaScriptu (běžný POST) se uživatel přesměruje na /dekujeme/ nebo dostane stránku s chybami.
 *
 * UPOZORNĚNÍ: mail() vrací true, jakmile zprávu převzal poštovní systém serveru. Doručení do schránky
 * závisí na nastavení domény (SPF/DKIM) a hostingu – po nasazení vždy proveďte zkušební odeslání.
 */
mb_internal_encoding('UTF-8');
$configFile = __DIR__ . '/config.php';
$cfg = is_file($configFile) ? require $configFile : null;
date_default_timezone_set(is_array($cfg) ? ($cfg['timezone'] ?? 'Europe/Prague') : 'Europe/Prague');

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false
    || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest';

function respond(bool $json, int $status, array $payload, ?string $okRedirect = null, array $errors = [])
{
    if ($json) {
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($status === 200 && $okRedirect) {
        header('Location: ' . $okRedirect, true, 303);
        exit;
    }
    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    $items = $errors ? '<ul>' . implode('', array_map(fn($m) => '<li>' . htmlspecialchars($m, ENT_QUOTES, 'UTF-8') . '</li>', $errors)) . '</ul>' : '';
    $msg = $payload['error'] ?? '';
    $text = $status === 429 ? 'Odeslali jste příliš mnoho zpráv za krátkou dobu. Zkuste to prosím za chvíli.' : ($status === 422 ? 'Formulář obsahuje chyby:' : 'Zprávu se nepodařilo odeslat. Zavolejte nám prosím na +420 602 596 664.');
    echo '<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poptávka</title><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-weight:500">' . htmlspecialchars($text, ENT_QUOTES, 'UTF-8') . '</h1>' . $items . '<p><a href="/kontakt/#poptavka">Zpět na formulář</a></p></body></html>';
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond($wantsJson, 405, ['ok' => false, 'error' => 'method_not_allowed']);
}
if (!is_array($cfg)) {
    error_log('[poptavka] chybí config.php');
    respond($wantsJson, 500, ['ok' => false, 'error' => 'not_configured']);
}

$str = static function (string $key, int $max): string {
    $v = $_POST[$key] ?? '';
    if (!is_string($v)) return '';
    $v = trim(str_replace("\0", '', $v));
    return mb_substr($v, 0, $max);
};
$oneLine = static fn(string $v): string => trim(preg_replace('/[\r\n\t]+/', ' ', $v));

// --- roboti: vyplněná past (honeypot) nebo příliš rychlé odeslání → tiše "úspěch", nic se neodesílá
$honeypot = $str('web', 200);
$ts = (int)($_POST['t'] ?? 0);
if ($honeypot !== '' || ($ts > 0 && (time() - $ts) < (int)$cfg['min_fill_seconds'])) {
    respond($wantsJson, 200, ['ok' => true], '/dekujeme/');
}

// --- omezení četnosti (podle hashe IP, bez ukládání IP)
$store = __DIR__ . '/storage';
if (!is_dir($store)) @mkdir($store, 0750, true);
$rateDir = $store . '/rate';
if (!is_dir($rateDir)) @mkdir($rateDir, 0750, true);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$rateFile = $rateDir . '/' . hash('sha256', $ip . '|poptavka') . '.json';
$now = time();
$hits = [];
if (is_file($rateFile)) {
    $hits = json_decode((string)@file_get_contents($rateFile), true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $now - $t < 3600));
}
$last = $hits ? max($hits) : 0;
if (count($hits) >= (int)$cfg['rate_limit']['per_hour'] || ($last && $now - $last < (int)$cfg['rate_limit']['min_gap_seconds'])) {
    respond($wantsJson, 429, ['ok' => false, 'error' => 'rate_limited']);
}

// --- validace
$errors = [];
$jmeno = $oneLine($str('jmeno', 120));
$telefon = $oneLine($str('telefon', 40));
$email = $oneLine($str('email', 160));
$typ = $str('typ', 20);
$zprava = $str('zprava', 4000);
$lokalita = $oneLine($str('lokalita', 120));
$plocha = $oneLine($str('plocha', 12));
$zdroj = $oneLine($str('zdroj', 120));

$typy = [
    'sterka' => 'Betonová stěrka', 'epoxid' => 'Epoxidová podlaha', 'polyuretan' => 'Polyuretanová podlaha',
    'poradit' => 'S výběrem potřebuji poradit', 'showroom' => 'Návštěva showroomu', 'workshop' => 'Workshop aplikace stěrek',
];

if (mb_strlen($jmeno) < 2) $errors['jmeno'] = 'Zadejte prosím své jméno.';
$digits = preg_replace('/\D/', '', $telefon);
if (!preg_match('/^[+\d][\d\s().\-\/]*$/', $telefon) || strlen($digits) < 9 || strlen($digits) > 15) $errors['telefon'] = 'Telefon zadejte včetně číslic, například +420 602 596 664.';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'E-mail zadejte ve tvaru jmeno@domena.cz.';
if (!isset($typy[$typ])) $errors['typ'] = 'Vyberte typ realizace.';
if (mb_strlen($zprava) < 10) $errors['zprava'] = 'Napište nám prosím alespoň krátkou zprávu (aspoň 10 znaků).';
if ($plocha !== '' && !preg_match('/^\d{1,5}([.,]\d{1,2})?$/', $plocha)) $errors['plocha'] = 'Plochu zadejte číslem, například 25 nebo 12,5.';

// --- fotografie
$attachments = [];
$allowedMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif'];
if (!empty($_FILES['fotky']) && is_array($_FILES['fotky']['name'])) {
    $count = count($_FILES['fotky']['name']);
    $real = 0;
    for ($i = 0; $i < $count; $i++) {
        if (($_FILES['fotky']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        $real++;
    }
    if ($real > 3) {
        $errors['fotky'] = 'Nahrajte nejvýše 3 fotografie.';
    } else {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        for ($i = 0; $i < $count; $i++) {
            $err = $_FILES['fotky']['error'][$i] ?? UPLOAD_ERR_NO_FILE;
            if ($err === UPLOAD_ERR_NO_FILE) continue;
            $name = $oneLine((string)$_FILES['fotky']['name'][$i]);
            if ($err !== UPLOAD_ERR_OK) { $errors['fotky'] = 'Soubor „' . $name . '“ se nepodařilo nahrát (maximum je 5 MB).'; break; }
            $tmp = (string)$_FILES['fotky']['tmp_name'][$i];
            $size = (int)$_FILES['fotky']['size'][$i];
            if ($size > 5 * 1024 * 1024) { $errors['fotky'] = 'Soubor „' . $name . '“ je větší než 5 MB.'; break; }
            if (!is_uploaded_file($tmp)) continue;
            $mime = (string)$finfo->file($tmp);
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $head = (string)file_get_contents($tmp, false, null, 0, 16);
            $isHeic = in_array($ext, ['heic', 'heif'], true) && strpos(substr($head, 4, 8), 'ftyp') !== false;
            if (!isset($allowedMime[$mime]) && !$isHeic) { $errors['fotky'] = 'Soubor „' . $name . '“ není podporovaný obrázek (JPG, PNG, WebP nebo HEIC).'; break; }
            $safe = preg_replace('/[^A-Za-z0-9._-]+/', '_', pathinfo($name, PATHINFO_FILENAME)) ?: 'foto';
            $attachments[] = ['name' => $safe . '.' . ($allowedMime[$mime] ?? $ext), 'mime' => $isHeic && !isset($allowedMime[$mime]) ? 'image/heic' : $mime, 'data' => (string)file_get_contents($tmp)];
        }
    }
}

if ($errors) respond($wantsJson, 422, ['ok' => false, 'errors' => $errors], null, array_values($errors));

// --- sestavení zprávy
$lines = [
    'Nová poptávka z webu',
    '',
    'Jméno: ' . $jmeno,
    'Telefon: ' . $telefon,
    'E-mail: ' . $email,
    'Typ realizace: ' . $typy[$typ],
    'Lokalita: ' . ($lokalita !== '' ? $lokalita : '(neuvedeno)'),
    'Přibližná plocha: ' . ($plocha !== '' ? $plocha . ' m²' : '(neuvedeno)'),
    '',
    'Zpráva:',
    $zprava,
    '',
    '--',
    'Odesláno ze stránky: ' . ($zdroj !== '' ? $zdroj : '(neznámá)'),
    'Čas odeslání: ' . date('j. n. Y H:i:s'),
    'Přiložené fotografie: ' . count($attachments),
];
$text = implode("\r\n", array_map(fn($l) => str_replace(["\r\n", "\n"], "\r\n", $l), $lines));

$from = (string)$cfg['from'];
$fromName = $oneLine((string)$cfg['from_name']);
$to = (string)$cfg['to'];
$subject = $cfg['subject_prefix'] . ': ' . $typy[$typ] . ' – ' . $jmeno;
$encSubject = '=?UTF-8?B?' . base64_encode(mb_substr($subject, 0, 150)) . '?=';
$headers = [
    'MIME-Version: 1.0',
    'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $from . '>',
    'X-Mailer: Emplastrum-web',
];
$headers[] = 'Reply-To: ' . $email;

if ($attachments) {
    $boundary = '=_emp_' . bin2hex(random_bytes(12));
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
    $body = '--' . $boundary . "\r\n" . "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n";
    foreach ($attachments as $a) {
        $body .= '--' . $boundary . "\r\n" . 'Content-Type: ' . $a['mime'] . '; name="' . $a['name'] . '"' . "\r\n" . "Content-Transfer-Encoding: base64\r\n" . 'Content-Disposition: attachment; filename="' . $a['name'] . '"' . "\r\n\r\n" . chunk_split(base64_encode($a['data'])) . "\r\n";
    }
    $body .= '--' . $boundary . '--';
} else {
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: base64';
    $body = chunk_split(base64_encode($text));
}

// --- odeslání
$sent = false;
if (($cfg['transport'] ?? 'mail') === 'file') {
    // Testovací režim (lokální vývoj): zpráva se uloží do storage/outbox, nic se neodesílá.
    $out = $store . '/outbox';
    if (!is_dir($out)) @mkdir($out, 0750, true);
    $eml = 'To: ' . $to . "\r\nSubject: " . $encSubject . "\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . $body;
    $sent = @file_put_contents($out . '/' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.eml', $eml) !== false;
} else {
    $params = preg_match('/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/', $from) ? '-f' . $from : '';
    $sent = $params !== '' ? @mail($to, $encSubject, $body, implode("\r\n", $headers), $params) : @mail($to, $encSubject, $body, implode("\r\n", $headers));
}

if (!$sent) {
    error_log('[poptavka] odeslání se nezdařilo (transport: ' . ($cfg['transport'] ?? 'mail') . ')');
    respond($wantsJson, 500, ['ok' => false, 'error' => 'send_failed']);
}

$hits[] = $now;
@file_put_contents($rateFile, json_encode($hits), LOCK_EX);
@file_put_contents($store . '/poptavky.log', date('c') . " ok typ={$typ} fotek=" . count($attachments) . "\n", FILE_APPEND | LOCK_EX);
respond($wantsJson, 200, ['ok' => true], '/dekujeme/');
