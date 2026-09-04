# numi

Safely and instantly copy your entire Numista collection from one account to another.

## Overview

Numi is a secure, client-side web application built to help Numista collectors seamlessly copy their coin and banknote collections across different accounts. Whether you're consolidating profiles or migrating to a new account, Numi automates the process securely without missing a single item.

## Features

- **Client-Side Execution**: Your Numista API keys and credentials never leave your browser. All API requests are made directly from your machine to Numista's servers.
- **Live Console Logs**: Watch the copy process happen in real-time with an integrated pseudo-terminal interface.
- **Brutalist Design**: A stunning, high-contrast, pure grayscale UI that is fully responsive for mobile and desktop.

## Tech Stack

- React
- TypeScript
- Vite
- Zustand (State Management)
- Vanilla CSS

## Running Locally

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables:
   Copy `.env.example` to `.env.local` and configure your Firebase keys if you wish to track global usage stats.
4. Start the development server:
   ```bash
   npm run dev
   ```
