# Matte

En egen övningsapp för din mattebok. Du bläddrar bland uppgifterna, räknar för hand på en canvas med ritplattan (Gaomon S620), skriver in svaret och får rättning direkt.

Innehållet är avskrivet från din egen bok för eget bruk. Det publiceras bara krypterat, bakom inloggning (se nedan).

## Kom igång

Kräver [Node.js](https://nodejs.org) 22 eller senare.

```bash
npm install
```

```bash
npm run dev
```

Öppna sedan <http://localhost:5173>.

### Installera som app (fungerar offline)

```bash
npm run build
```

```bash
npm run preview
```

Öppna <http://localhost:4173> i Chrome eller Edge och klicka på installera-ikonen i adressfältet. Appen startar då i ett eget fönster och fungerar utan nätverk. Den sparar appen, boken och figurerna lokalt. Fotona av boksidorna behövs bara för granskningen och följer inte med. Installerad i helskärm blir skrivzonens koordinater exakta.

## Inloggning och publicering

Den publicerade appen kräver användarnamn och lösenord. Bokens innehåll (uppgifter, facit och figurer) ligger **krypterat** i `public/vault.bin` (AES-256-GCM, nyckeln härleds från användarnamn och lösenord med PBKDF2). Utan rätt inloggning går innehållet inte att läsa, inte ens i källkoden på GitHub. Själva appens kod är öppen.

- `public/content/` (okrypterat innehåll och fotona av boksidorna) läggs aldrig i git och följer aldrig med i bygget.
- Användarnamnet skiljer inte på stora och små bokstäver, lösenordet gör det.
- Efter inloggning kommer webbläsaren ihåg dig tills du trycker **Inställningar → Data → Logga ut**.
- API-nycklar för Claude och DeepSeek finns bara i din webbläsare och aldrig i koden eller på GitHub.
- I utvecklingsläget (`npm run dev`) behövs ingen inloggning.

**Flera inloggningar.** Boken låses med en slumpad boknyckel, och boknyckeln låses en gång per inloggning. Användarnamnen sparas inte i klartext, bara en hash.

Kör om det här efter varje ändring i innehållet. Du loggar in med valfri befintlig inloggning, och alla inloggningar finns kvar:

```bash
npm run lock
```

Lägg till en inloggning, t.ex. åt en klasskompis (du loggar först in med din egen):

```bash
npm run users -- add
```

Ta bort en inloggning. Den som har loggat in med den blir utloggad nästa gång sidan laddas:

```bash
npm run users -- remove
```

Om alla lösenord är glömda börjar `npm run lock -- --ny` om med en enda ny inloggning.

I PowerShell skriver du `npm.cmd` i stället för `npm`.

På en ny dator, efter `git clone`, packar du upp innehållet igen för att kunna redigera det:

```bash
npm run unlock
```

Appen läggs ut på GitHub Pages automatiskt vid varje push till `main` (`.github/workflows/deploy.yml`). Första gången: på GitHub, gå till **Settings → Pages** och välj **Source: GitHub Actions**.

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `npm run dev` | Startar appen och granskningssidan |
| `npm run ingest` | Kontrollerar bokens innehåll och visar vad som behöver granskas |
| `npm test` | Kör enhetstesterna |
| `npm run build` | Bygger en färdig version till `dist/` |
| `npm run lock` | Krypterar innehållet till `public/vault.bin` med ditt användarnamn och lösenord |
| `npm run unlock` | Packar upp `public/vault.bin` till `public/content` |
| `npm run users -- add` / `remove` / `count` | Lägger till, tar bort eller räknar inloggningar |

## Skrivytan

Allt du skriver sparas automatiskt per uppgift i webbläsarens IndexedDB och finns kvar när du kommer tillbaka. Verktyg: penna (fyra färger, tre tjocklekar), överstrykning, sudd (hela streck eller delsudd), lasso för att markera och flytta, ångra och gör om. Bakgrunden kan vara rutad, linjerad eller blank. Skrivytan växer nedåt så långt du behöver, och streckade linjer visar var en ny A4-sida börjar vid export. Spara lösningen som **PDF** (en A4-sida per sida) eller **PNG** via nedladdningsknappen i verktygsfältet.

## Granska avskriften (fas 1)

Gå till <http://localhost:5173/#/granska>. Uppgiften och facit som avskrift visas till vänster och fotot av boksidan till höger.

| Tangent | Funktion |
|---|---|
| ↓ / J | Nästa uppgift |
| ↑ / K | Föregående uppgift |
| F | Växla mellan uppgiftssidan och facitsidan |
| Ctrl+Enter | Stämmer – markera som granskad och gå vidare |
| Ctrl+S | Spara ändringar |

Kryssa i **Redigera** för att rätta text, facit eller svaret som rättas. Ändringar sparas direkt i JSON-filerna. Filtret **Misstänkta fel** visar de fem ställen där facit verkar vara fel (se [docs/beslut.md](docs/beslut.md)).

## Hur innehållet är lagrat

```
public/content/
  pages/        Fotona av boksidorna (originalen)
  figures/      Figurer omritade som SVG
  data/
    index.json        Kapitel, avsnitt och vilken bild som hör till vilken sida
    1-1.json          1.1 Kombinatorik
    1-2.json          1.2 Mängdlära
    1-blandade.json   Blandade övningar kapitel 1
```

Varje uppgift har id, nummer, avsnitt, nivå (a/b/c), boksida, facitsida, text och deluppgifter. Varje deluppgift har facit som det står i boken och ett **svar som rättas**:

| Typ | Exempel | Rättas |
|---|---|---|
| `number` | 26, 3/16, 0,09 (≈), 1,3·10³⁰ | automatiskt, med avrundning efter facits noggrannhet |
| `expression` | n + 1, utvecklingar, faktoriseringar | automatiskt, med krav på form där det behövs |
| `list` | Pascals rad, ”tre första termerna” | automatiskt |
| `set` | {1, 3, 5}, ∅, {102, 104, …} | automatiskt |
| `set-expression` | A ∩ (B ∪ C) | automatiskt, även likvärdiga skrivsätt |
| `choice` | Ja/Nej, ∈/∉ | automatiskt |
| `self` | bevis, ritningar, fritext | du bedömer själv |

Matte i texterna skrivs med KaTeX mellan `$…$`.

## Miniräknare

På uppgiftssidan öppnar du miniräknaren med knappen i toppen eller med `R`. Du kan dra den vart du vill. Skriv med tangentbordet eller knapparna, och `Enter` räknar ut.

- Decimalkomma, `×` `÷`, potenser (`^`, `x²`), `√`, `n!`, `nCr` och `nPr` (t.ex. `10 nCr 3`), `sin` `cos` `tan` i grader eller radianer, `ln`, `lg`, `π`, `e` och `%`.
- `Ans` är förra svaret. Börjar du med en operator räknar du vidare på det.
- Svaret visas också som exakt bråk när det går (`12/64` → `3/16`).
- Klicka på en rad i historiken för att använda svaret igen.
- På uppgifter som ska lösas utan räknare visas en påminnelse.

### TI-84 Plus CE

Byt till **TI-84** överst i miniräknaren för en riktig TI-84 Plus CE-emulator ([hunterchen7/ti84ce](https://github.com/hunterchen7/ti84ce), MIT-licens). Den kör TI:s egen mjukvara från **din egen ROM-fil**, som du väljer första gången. Filen sparas bara lokalt i webbläsaren, och ingen ROM följer med appen. **Byt ROM** nere till höger väljer en annan fil. Räknarens tillstånd sparas, så den är som du lämnade den. Du kan använda både knapparna och tangentbordet.

Emulatorn ligger färdigbyggd i `public/ti84/`. Så här bygger du om den (kräver Rust, wasm-pack och git):

```bash
npm run build:ti84
```

## Fråga en AI (Claude eller DeepSeek)

Tryck **Fråga** under en svarsruta för att fråga varför ett svar blir som det blir. Det finns färdiga förslag som "Varför blev mitt svar fel?", och du kan ställa egna följdfrågor. AI:n ser uppgiften, facit, bokens lösning, dina svar och vad rättningen sa. Innan du har sett facit får du ledtrådar i stället för slutsvaret.

Välj AI och klistra in din egen nyckel under **Inställningar → AI**. Appen testar nyckeln innan den sparas.

| | Claude | DeepSeek |
|---|---|---|
| Modell | Claude Opus 5.5 | DeepSeek V4 Pro |
| Nyckel | [console.anthropic.com](https://console.anthropic.com/settings/keys) | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Kostnad per fråga | några ören till någon krona | oftast under ett öre |

- Nycklarna sparas bara i den här webbläsaren (`localStorage`) och skickas bara till respektive företag. De följer inte med i backupen.
- Med Claude svarar en reservmodell automatiskt om Opus 5.5 är överbelastad (server-side fallback).
- DeepSeek behandlar frågorna på servrar i Kina.
- Det kräver internet. Resten av appen fungerar offline som vanligt.

## Synk mellan enheter

Försök, statistik, det du skrivit på skrivytan, sparade uppgifter och genomgångar synkas automatiskt mellan alla enheter där du är inloggad (Supabase-projektet **matte** i Stockholm). Inställningar, färger, API-nycklar och TI-84-ROM stannar på varje enhet.

- Allt sparas först lokalt, så appen fungerar utan nät. Synken körs vid inloggning, strax efter varje ändring, var 45:e sekund och när nätet kommer tillbaka.
- Lösenordet lämnar aldrig enheten. Servern får en hemlighet som räknas fram ur det (med ett annat salt än boknyckeln), och varje konto når bara sin egen data. Tabellerna går inte att läsa direkt, bara via funktionerna `sync_pull` och `sync_push`.
- Om två enheter ändrat samma sak vinner den senaste ändringen. Försök läggs alltid ihop, och klarade testfrågor slås ihop.
- Loggar någon annan in i samma webbläsare rensas den förra personens lokala data först (den finns kvar på servern).
- Status och **Synka nu** finns under **Inställningar → Data**.
- Gratisprojekt i Supabase pausas efter ungefär en vecka utan användning. Då startar du det igen på supabase.com. Appen fungerar lokalt under tiden.

## Lär dig (genomgångar)

Under **Lär dig** (`#/lar`) finns en genomgång per delområde, byggd på bokens teorisidor: Lådprincipen, Multiplikations- och additionsprincipen, Permutationer, Kombinationer, Sannolikhet, Binomialsatsen, Mängder, Mängdoperationer och Venndiagram.

- Begrepp, bokens regelrutor och figurer (träddiagram, Pascals triangel, Venndiagram) är omritade.
- **Exemplen** visas steg för steg: tryck **Nästa steg**, eller **Visa allt**.
- **Testa dig själv**-frågor rättas precis som uppgifterna, med ledtråd och lösning.
- **Fråga AI** uppe till höger förklarar teorin med egna ord och nya exempel.
- När du är klar: **Markera som klar** och **Öva på uppgifterna** i samma delområde.
- Uppgiftssidan har en länk till delområdets genomgång, och kapitelsidan visar den när ett delområde är valt.

Genomgångarna ligger i `public/content/data/lessons.json` och figurerna i `public/content/figures/lektion-*.svg`. De krypteras med resten av boken av `npm run lock`.

## Bibliotek och statistik

- **Startsidan** föreslår vad du ska räkna härnäst: en påbörjad uppgift, annars nästa nya. Raderna visar "Fortsätt där du slutade", "Uppgifter du missat" (minst tre missar, eller självbedömd som fel), en affisch per delområde och en rad per avsnitt.
- **Kapitelsidan** (`#/kapitel/1`) har framsteg per avsnitt och filter för status, nivå och delområde.
- **Statistiken** (`#/statistik`) visar dagar i rad, lösta uppgifter den här veckan, andel rätt på första försöket och framsteg per avsnitt och nivå.

## Backup

All din data finns bara i webbläsaren. Under **Inställningar → Data** sparar du en backupfil (`.json`) med alla försök, allt du skrivit, inställningar och färger, och kan återställa den på en annan dator. Gör en backup då och då.

## Svar och rättning

Varje deluppgift har en svarsruta. Tal, uttryck och listor skriver du i ett **mattefält**: `/` ger bråk, `^` exponent, och "sqrt" blir ett rottecken. Knappen **Vanlig text** byter till en vanlig textruta. Mängder och mängduttryck skrivs i en textruta med knappar för `∩ ∪ \ ∁ ∅ { } …`.

Rättningen är förlåtande mot skrivsätt men noga med matten:

- Decimalkomma och decimalpunkt (2,5 = 2.5), mellanslag i tusental och ord efter talet ("26 sätt") går bra.
- Likvärdiga svar godkänns: 3/16 = 12/64 = 0,1875 och n(n−1)/2 = (n² − n)/2.
- Avrundade svar rättas efter facits noggrannhet. Ett för grovt avrundat svar får ett tips.
- När uppgiften kräver utvecklad eller faktoriserad form får du "rätt värde", men ett tips om formen.
- Mängder får skrivas i valfri ordning. Mängduttryck jämförs område för område i Venndiagrammet, så A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C).
- När svaret nästan är rätt kommer ett konkret tips, t.ex. om fel tecken, procent i stället för andel, motsatt händelse, faktor 2 (ordning), ett ifrån, eller ett område som är för stort eller för litet.

Facit visas efter tre missade försök, eller när du trycker **Visa facit**. Varje försök sparas i webbläsaren för statistiken, och lösta delar är markerade när du kommer tillbaka.

## Ritplattan Gaomon S620

Skrivytan använder webbläsarens Pointer Events. Den läser pennans tryck och ritar bara när spetsen nuddar plattan. Medan pennan svävar visar en liten ring var du kommer att skriva, så att du inte behöver titta ner. Finger på en pekskärm flyttar och zoomar ytan men ritar aldrig.

### Windows

1. Installera drivrutinen från Gaomons webbplats och starta **Gaomon Tablet**.
2. Under **Penna** (Pen), slå på **Windows Ink**. Utan den ser webbläsaren pennan som en mus, och trycket blir alltid 0,5.
3. Starta om webbläsaren.
4. Kontrollera: öppna **Inställningar → Ritplatta → Trycktest** i appen och skriv i rutan. Där ska det stå *Penna* och ett tryck som ändras när du trycker hårdare.

Om appen märker att trycket alltid är 0,5 visar den ett tips om detta en gång.

### Linux

Med en aktuell kärna fungerar plattan med den inbyggda drivrutinen (`hid-uclogic`), utan extra program. Om trycket når webbläsaren varierar mellan webbläsare och skrivbordsmiljöer, så kontrollera med **Trycktest** som ovan. Chrome och Edge brukar fungera bäst. På X11 kan du begränsa plattan till ett område med `xinput map-to-output` eller `xsetwacom`. På Wayland gör du det i GNOME eller KDE under *Inställningar → Ritplatta*.

### Pennans sidoknappar

Ställ in en av sidoknapparna som **högerklick** i drivrutinen. Håll in den och dra, så suddar du. Släpp, så är du tillbaka till pennan. Den andra knappen kan skicka ett kortkommando, t.ex. `E` (sudd) eller `Ctrl+Z` (ångra).

### Snabbknapparna (express keys)

Plattans fyra knappar kan skicka tangenter. Förslag:

| Knapp | Tangent | Gör |
|---|---|---|
| 1 | `P` | Penna |
| 2 | `E` | Sudd |
| 3 | `Ctrl+Z` | Ångra |
| 4 | `N` | Nästa uppgift |

Alla kortkommandon kan ändras under **Inställningar → Kortkommandon**:

| Tangent | Funktion |
|---|---|
| `P` / `H` / `E` / `L` | Penna / överstrykning / sudd / markera och flytta |
| `Shift+E` | Växla mellan att sudda hela streck och delsudd |
| `1`–`4` | Pennfärg |
| `Ctrl+Z` / `Ctrl+Y` | Ångra / gör om |
| `0` | Återställ zoom |
| `Enter` | Gå till svarsrutan / kontrollera svaret |
| `N` / `Shift+N` | Nästa / föregående uppgift |
| `R` | Miniräknare |
| Mellanslag + dra | Flytta skrivytan |
| Scrollhjul / `Ctrl` + scrollhjul | Scrolla / zooma |
| `Delete` | Ta bort det markerade |

### Skrivzon

S620 är liten (165 × 101 mm). Om den mappas mot hela skärmen blir handstilen grov. Med en **skrivzon** får skrivytan en fast plats och storlek med samma proportioner som plattan, så att du kan mappa plattan till just den rutan:

1. Tryck **F11** (helskärm), eller installera appen. Då blir koordinaterna exakta.
2. Öppna **Inställningar → Ritplatta → Skrivzon**, slå på den och välj storlek.
3. Skriv av **X, Y, Bredd och Höjd** till Gaomon-drivrutinen under *Arbetsyta / Work Area → Anpassad*.
4. Använd tangentbordet eller plattans snabbknappar för att byta verktyg och gå vidare, eftersom pennan nu bara når skrivzonen.

Koordinaterna är i fysiska skärmpixlar och förutsätter att webbläsarens zoom är 100 %.

## Faser

1. ✅ Innehåll och granskningssida
2. ✅ Designmockup – <http://localhost:5173/#/mockup> och <http://localhost:5173/#/mockup/uppgift> – färgerna ställer du in själv under **Färger**
3. ✅ Skrivyta med stöd för S620 – <http://localhost:5173/#/uppgift/1104>
4. ✅ Rättning av svar
5. ✅ Bibliotek, framsteg, statistik, backup och PWA
