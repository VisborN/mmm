# mmm (Money Flow)

A strict TypeScript Progressive Web App (PWA) for personal finance management with Google Drive synchronization.

## Features

- **Transactions & Accounts**: Track income, expenses, and transfers between multiple accounts.
- **Offline-First & Local DB**: Uses IndexedDB (`idb`, `idb-keyval`) for local storage, allowing the app to work seamlessly offline.
- **State Management**: Built with React and MobX for reactive and performant state updates.
- **Sync**: Seamlessly synchronizes data to a selected folder in Google Drive.
- **Premium Design System**: Glassmorphism aesthetic, modern typography (Inter), and carefully chosen color palettes for an immersive user experience.
- **Database Explorer**: Integrated view to inspect and debug local IndexedDB tables.

## Tech Stack

- **Frontend**: React 19, Vanilla CSS (Design System in `index.css`)
- **State**: MobX
- **Database**: IndexedDB (`idb`)
- **Build Tool**: ESBuild
- **Language**: Strict TypeScript

## Commands

- `yarn dev` - Start the development server (esbuild watch)
- `yarn build` - Build the production bundle
- `yarn type-check` - Run TypeScript compiler check
- `yarn lint` - Run ESLint
