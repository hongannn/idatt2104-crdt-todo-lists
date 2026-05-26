# CRDT Todo Lists

[![CI](https://github.com/hongannn/idatt2104-crdt-todo-lists/actions/workflows/ci.yml/badge.svg)](https://github.com/hongannn/idatt2104-crdt-todo-lists/actions/workflows/ci.yml)

## Introduksjon

Proof-of-concept implementasjon av Conflict-free Replicated Data Types (CRDTs) i TypeScript i emnet IDATT2104 - Nettverksprogrammering. All CRDT-logikk er utviklet uten bruk av eksterne CRDT-biblioteker.

Applikasjonen består av flere delte TODO lister, der flere brukere kan legge til, fjerne, redigere og krysse av oppgaver samtidig. Konflikter håndteres automatisk av CRDT, men ikke alle scenarioer er blitt dekket (se _Fremtidig arbeid_ for kjente begrensninger).

Arkitekturen implementert er en klient-server over WebSocket. Serveren merger innkommende tilstand og sender den oppdaterte tilstanden til alle tilkoblede klienter. Hver klient holder sin egen lokale kopi.

## Implementert funksjonalitet

To CRDT-typer:

- `LWWRegister<T>`: Last-Write-Wins Register. Lagrer én verdi. Ved konflikt velges endringen med høyest tidsstempel, og dersom tidsstempel er likt velges endringen med høyest nodeId.
- `ORSet`: Observed-Remove Set. Sett med add/remove semantikk. Ved konflikt velges add over remove.

Applikasjonen bruker disse CRDT-typene til å håndtere TODO-lister. Funksjonaliteten som støttes:

- Legge til, slette og redigere TODO-items (dobbeltklikke for å redigere)
- Krysse av og fjerne avkryssing
- Redigere tittel på TODO-listene
- Opprette og slette TODO-lister

## Fremtidig arbeid

- ORSet-tombstones vokser ubegrenset siden fjernede tagger ikke blir ryddet opp (ingen garbage collection).
- Det finnes ingen persistent lagring, som betyr at all tilstand mistes ved serveromstart.
- Hvis serveren krasjer, slutter hele applikasjonen å fungere. En peer-to-peer løsning kunne ha løst dette problemet, da kleientene kommuniserer direkte uten å være avhengig av én sentral server.
- DOM-en rebuildes fullstendig ved hver oppdatering, noe som kan være en visuell forstyrrelse hos klienter som ikke er berørt av endringen.
- Det er ingen låsing av oppgaver under redigering. Flere klienter kan redigere samme oppgave samtidig uten å se hverandres endringer, noe som kan føre til at én redigering overskriver en annen. En klient kan også slette en oppgave mens en annen klient redigerer den.
- Det er ingen varslinger/tydeliggjøring av konflikter for klienter.
- Det er ingen autentisering. Alle som kjenner URL-en kan koble til og endre alle lister.
- nodeId genereres tilfeldig ved hver sideinnlasting, så samme bruker fremstår som en ny node etter reload. Dette kan påvirke LWW-tiebreaking uforutsigbart.
- Hele tilstanden sendes ved hver oppdatering. Delta-CRDTs ville kun sendt endringen (delta), noe som ville vært langt mer effektivt ved stor tilstand.

## Eksterne avhengigheter

- `ws`: WebSocket-server for Node.js.
- `typescript`: statisk typing og kompilering.
- `ts-node`: kjører TypeScript direkte uten forhåndskompilering.
- `vite`: bundler for browser-klienten.
- `jest` + `ts-jest`: testrammeverk.

## Installasjonsinstruksjoner

Krav: Node.js 18 og npm 9.

```bash
git clone https://github.com/hongannn/idatt2104-crdt-todo-lists.git
cd idatt2104-crdt-todo-lists
npm install
npm run build
```

## Instruksjoner for å bruke løsningen

```bash
npm run start:server
```

Åpne `http://localhost:3001` i nettleseren. Åpne samme adresse i flere faner for å se synkronisering.

## Kjøre tester

```bash
npm test
```

## API-dokumentasjon

Ingen offentlig REST API.

## Bruk av ekstern informasjon

- **Martin Kleppmann. "CRDTs: The Hard Parts"** <https://www.youtube.com/watch?v=x7drE24geUw>
- **Wikipedia. Conflict-free replicated data type** <https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type>
