# Čo bolo nainštalované kvôli tomuto projektu

Zoznam všetkého, čo sa kvôli projektu Recepty nainštalovalo do počítača
(mimo priečinka projektu), aj s tým, ako to odstrániť. Priečinky
`node_modules` v projekte sa zmažú spolu s projektom.

## Programy

| Čo | Ako sa nainštalovalo | Ako odstrániť |
|---|---|---|
| Node.js LTS 26.13.1 (obsahuje `node`, `npm` 11.20.0, `npx`), priečinok `C:\Program Files\nodejs` | `winget install --id OpenJS.NodeJS.LTS -e --source winget` (2026-11-24) | `winget uninstall --id OpenJS.NodeJS.LTS -e` |

## Priečinky, ktoré vznikajú pri používaní

| Čo | Kde | Ako odstrániť |
|---|---|---|
| Vyrovnávacia pamäť npm (aj nástroje spúšťané cez `npx`) | `%LOCALAPPDATA%\npm-cache` | `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache"` |
| Globálne nastavenia a balíky npm (ak vzniknú) | `%APPDATA%\npm` | `Remove-Item -Recurse -Force "$env:APPDATA\npm"` |
| Prihlasovacia konfigurácia Cloudflare Wrangler (vznikne až po `wrangler login`) | `%USERPROFILE%\.wrangler` | `Remove-Item -Recurse -Force "$env:USERPROFILE\.wrangler"` |
| Prihlasovacia konfigurácia Wrangler, XDG umiestnenie (vznikne až po `wrangler login`) | `%APPDATA%\xdg.config\.wrangler` | `Remove-Item -Recurse -Force "$env:APPDATA\xdg.config\.wrangler"` |

## Odstránenie všetkého naraz

```powershell
# Najprv, kým je Node ešte nainštalovaný (v server/): npx wrangler delete
winget uninstall --id OpenJS.NodeJS.LTS -e
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\npm" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.wrangler" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\xdg.config\.wrangler" -ErrorAction SilentlyContinue
```
