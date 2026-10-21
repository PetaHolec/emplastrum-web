<?php
// Nastavení poptávkového formuláře. Tento soubor není veřejně přístupný (viz .htaccess).
return [
    // Kam se poptávky doručují
    'to' => 'marekgolda@seznam.cz',
    // Odesílatel e-mailu. MUSÍ patřit do domény, na které web běží (kvůli SPF/DKIM a doručitelnosti).
    // Po nasazení na ostrou doménu ověřte, že adresa existuje nebo že hosting umí odesílat z této domény.
    'from' => 'web@brnoshowroom.cz',
    'from_name' => 'Web Emplastrum Design',
    'subject_prefix' => 'Poptávka z webu',
    // 'mail' = PHP mail() (výchozí, hotové pro běžný hosting) | 'file' = jen testovací uložení do storage/outbox
    // Proměnnou EMPLASTRUM_TRANSPORT nastavuje pouze lokální vývojový server, ostrý provoz vždy používá 'mail'.
    'transport' => getenv('EMPLASTRUM_TRANSPORT') ?: 'mail',
    // Ochrana proti zneužití
    'rate_limit' => ['per_hour' => 6, 'min_gap_seconds' => 15],
    'min_fill_seconds' => 3,
    'timezone' => 'Europe/Prague',
];
