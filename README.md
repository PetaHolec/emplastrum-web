# Emplastrum Design – web (čisté HTML, CSS, JS)

Bez instalace, bez modulů, bez sestavování. Stačí soubory.

## Spuštění ve VS Code
1. **Soubor → Otevřít složku…** a vyberte tuto složku (`site`).
2. Doporučeno: rozšíření **Live Server** (Ritwick Dey) → pravým tlačítkem na `index.html` → **Open with Live Server**.
3. Jde to i dvojklikem na `index.html` (otevře se z disku). Písma a fotografie fungují; jen odesílání formuláře ne (viz níže).

## Co kde je
- `index.html` + složky `povrchy/`, `realizace/`, `showroom/`, `workshopy/`, `o-firme/`, `kontakt/`, `ochrana-udaju/` – stránky (každá je `index.html` ve své složce)
- `assets/css/style.css` – všechny styly (barvy a písma jsou na začátku v `:root`)
- `assets/js/main.js` – všechny skripty v jednom souboru (bez knihoven)
- `assets/img/`, `assets/video/`, `assets/fonts/`, `assets/brand/` – všechna média a písma jsou lokálně, web nic nenačítá z internetu (mapa se načte z OpenStreetMap až po kliknutí)
- `api/poptavka.php` + `api/config.php` – odeslání formuláře (potřebuje hosting s PHP; do `config.php` doplňte cílový e-mail)
- `.htaccess` – nastavení Apache (jen pro hosting)

## Formulář
Na hostingu s PHP odešle poptávku e-mailem. Bez PHP (Live Server, dvojklik) se po odeslání zobrazí chyba s tlačítkem „Napsat e-mail“ – potvrzení o odeslání se nikdy neukáže, pokud server neodpoví úspěšně.

## Poznámky
- Obrázky jsou ve více velikostech (`…-480.avif`, `…-960.webp` …); nový obrázek stačí vložit jako obyčejný `<img src="…jpg">`.
- Komentáře `<!-- DOPLNIT … -->` v podstránkách realizací označují místa pro údaje od firmy (zadání zákazníka, použitý materiál, recenze).
