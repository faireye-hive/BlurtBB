# Plan Działania: Forum BlurtBB

## 1. Koncepcja

Stworzenie w pełni funkcjonalnego, zdecentralizowanego forum internetowego, którego logika działa w przeglądarce użytkownika (client-side), a wszystkie dane (posty, komentarze, profile) są przechowywane na blockchainie Blurt. Aplikacja będzie zbudowana jako Single Page Application (SPA) i dystrybuowana jako pojedynczy plik HTML, co umożliwi łatwe hostowanie na dowolnym serwerze statycznym (np. Nginx, GitHub Pages).

- **Frontend:** HTML, CSS, Bootstrap 5, JavaScript (Vanilla JS lub lekki framework jak Vue.js/React w trybie bez build-systemu na początek).
- **Backend/Baza Danych:** Blockchain Blurt (operacje `post` i `custom_json`).
- **Hosting:** Dowolny serwer plików statycznych.

## Faza 0: Inicjalizacja Projektu i Zależności (ok. 2-3h)

1.  **Struktura plików i folderów:**
    ```
    /BlurtBB
    |-- /src
    |   |-- /js
    |   |   |-- app.js         # Główny plik aplikacji
    |   |   |-- blockchain.js  # Moduł do interakcji z Blurt
    |   |   `-- config.js      # Plik konfiguracyjny forum
    |   |-- /css
    |   |   `-- style.css      # Własne style
    |-- index.html             # Główny plik HTML
    `-- PLAN.md                # Ten plik
    ```

2.  **Główny plik `index.html`:**
    - Podstawowa struktura HTML5.
    - Dołączenie Bootstrap 5 (przez CDN na początek, dla szybkości dewelopmentu).
    - Dołączenie biblioteki `blurt.js` (przez CDN).
    - Dołączenie własnych styli `style.css` i skryptów `app.js`.
    - Główny kontener dla aplikacji, np. `<div id="app"></div>`.

3.  **Plik konfiguracyjny `src/js/config.js`:**
    - Stworzenie obiektu konfiguracyjnego, który będzie eksportowany.
    - Definicja kluczowych parametrów:
      ```javascript
      export const CONFIG = {
          forum_title: "Moje Forum na Blurcie",
          blurt_account: "nazwa-konta-admina", // Główne konto, z którego będą czytane kategorie
          admins: ["admin1", "admin2"],
          moderators: ["mod1", "mod2", "mod3"],
          // Struktura forum definiowana statycznie
          categories: [
              {
                  id: "ogolne",
                  title: "Forum Główne",
                  description: "Rozmowy na każdy temat."
              },
              {
                  id: "techniczne",
                  title: "Pomoc Techniczna",
                  description: "Masz problem? Zapytaj tutaj."
              }
          ],
          // Tag, który będzie używany do identyfikacji postów na blockchainie
          main_tag: "blurtbb-forum-main" 
      };
      ```

## Faza 1: Moduł Blockchain i Wyświetlanie Danych (ok. 6-8h)

1.  **Stworzenie `src/js/blockchain.js`:**
    - Inicjalizacja API Blurt: `blurt.api.setOptions({ url: 'https://rpc.blurt.world' });`.
    - Funkcja `getTopics(category_id)`:
        - Pobiera posty z blockchaina na podstawie `CONFIG.main_tag` oraz tagu kategorii (np. `ogolne`).
        - Używa `blurt.api.getDiscussionsByCreated`.
        - Zwraca listę tematów do wyświetlenia.
    - Funkcja `getPostAndReplies(author, permlink)`:
        - Pobiera główny post za pomocą `blurt.api.getContent`.
        - Pobiera wszystkie odpowiedzi (komentarze) za pomocą `blurt.api.getContentReplies`.
        - Zwraca obiekt zawierający główny post i drzewo komentarzy.

2.  **Implementacja w `src/js/app.js`:**
    - **Routing po stronie klienta (uproszczony):**
        - Aplikacja będzie reagować na zmiany w URL (parametry GET, np. `?category=ogolne` lub `?post=@autor/permlink`).
        - Funkcja `handleUrlChange()` będzie sprawdzać `window.location.search` i renderować odpowiedni widok.
    - **Renderowanie widoków:**
        - `renderMainView()`: Wyświetla listę kategorii z `CONFIG.categories`.
        - `renderCategoryView(category_id)`: Wywołuje `blockchain.getTopics(category_id)` i wyświetla listę tematów w danej kategorii.
        - `renderPostView(author, permlink)`: Wywołuje `blockchain.getPostAndReplies()` i wyświetla cały wątek – post główny i komentarze.

## Faza 2: Interakcje Użytkownika (Logowanie i Pisanie) (ok. 8-10h)

1.  **System logowania:**
    - Formularz logowania z polami "Nazwa użytkownika Blurt" i "Prywatny klucz do postowania (Posting Key)".
    - **BEZPIECZEŃSTWO:** Klucz *nigdy* nie jest wysyłany na żaden serwer. Jest przechowywany *wyłącznie* w pamięci przeglądarki (w zmiennej) na czas sesji. Opcjonalnie, można dodać możliwość zapisania go w `localStorage` po wyraźnej zgodzie użytkownika i z dużym ostrzeżeniem o ryzyku.
    - Po zalogowaniu, interfejs pokazuje nazwę użytkownika i przycisk "Wyloguj".

2.  **Publikowanie nowego tematu:**
    - Przycisk "Nowy Temat" w widoku kategorii.
    - Formularz z polami "Tytuł" i "Treść".
    - Po wysłaniu, aplikacja używa `blurt.broadcast.comment` do opublikowania posta na blockchainie.
        - `parentAuthor`: '' (pusty, bo to nowy post)
        - `parentPermlink`: `CONFIG.main_tag`
        - `author`: zalogowany użytkownik
        - `permlink`: generowany na podstawie tytułu
        - `title`: tytuł z formularza
        - `body`: treść z formularza
        - `json_metadata`: obiekt zawierający tagi, np. `{ tags: [CONFIG.main_tag, category_id] }`

3.  **Odpowiadanie na posty:**
    - Formularz odpowiedzi pod każdym postem i komentarzem.
    - Działa podobnie jak publikowanie tematu, ale `parentAuthor` i `parentPermlink` wskazują na post/komentarz, na który odpowiadamy.

## Faza 3: Funkcje Moderacyjne i Administracyjne (ok. 4-5h)

1.  **Identyfikacja ról:**
    - Podczas renderowania postów i komentarzy, sprawdzaj, czy autor posta należy do tablicy `CONFIG.admins` lub `CONFIG.moderators`.
    - Dodaj wizualne oznaczenie przy nazwie użytkownika (np. "Admin", "Moderator").

2.  **Narzędzia moderatora:**
    - Jeśli zalogowany użytkownik jest modem/adminem, przy każdym poście/komentarzu wyświetl dodatkowe przyciski (np. "Usuń", "Przypnij").
    - **Usuwanie:** Blockchain jest niezmienny, więc "usunięcie" będzie polegało na opublikowaniu operacji `custom_json` z informacją o usunięciu danego posta. Aplikacja kliencka będzie musiała odczytywać te "flagi" i ukrywać odpowiednie treści.
    - **Przypinanie:** Podobnie jak usuwanie, przypinanie będzie realizowane przez `custom_json`, a aplikacja będzie musiała odpowiednio posortować i wyróżnić przypięte tematy.

## Faza 4: Budowanie i Finalizacja Projektu (ok. 4-6h)

1.  **Instalacja narzędzi do budowania:**
    - Zainstaluj Node.js i npm.
    - Zainstaluj narzędzia deweloperskie: `npm install -g webpack webpack-cli`.

2.  **Konfiguracja Webpacka (`webpack.config.js`):**
    - Celem jest połączenie wszystkich plików JS w jeden (`bundle.js`).
    - Wstrzyknięcie `bundle.js` do `index.html` automatycznie.
    - Minifikacja kodu JS i CSS w trybie produkcyjnym.
    - Skonfigurowanie, aby `index.html` był generowany na podstawie szablonu i zawierał w sobie cały kod JS i CSS (inlining). To pozwoli uzyskać jeden plik HTML.

3.  **Skrypty `package.json`:**
    - `npm run dev`: Uruchamia serwer deweloperski.
    - `npm run build`: Buduje projekt do jednego pliku `dist/index.html`.

4.  **Dokumentacja:**
    - Uzupełnienie `README.md` o instrukcje:
        - Jak skonfigurować forum (edycja `src/js/config.js`).
        - Jak zbudować projekt.
        - Jak wdrożyć gotowy plik `index.html` na serwerze.

## Podsumowanie i Wdrożenie

Po wykonaniu wszystkich faz, w folderze `dist` znajdzie się pojedynczy plik `index.html`. Wystarczy skopiować ten plik na dowolny serwer statyczny (np. do odpowiedniego folderu w konfiguracji Nginx lub na GitHub Pages), aby forum stało się publicznie dostępne. Każdy, kto zechce uruchomić własną instancję, będzie musiał pobrać projekt, zmodyfikować `src/js/config.js` i samodzielnie go zbudować.
