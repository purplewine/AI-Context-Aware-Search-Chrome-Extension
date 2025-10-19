# AI Context-Aware Search Chrome Extension

A Chrome extension that performs semantic search on webpage content using AI embeddings, powered by Transformers.js. It finds contextually relevant content beyond simple keyword matching.

## Features

- 🔍 Semantic search using AI embeddings
- 💻 Local processing - all computations happen in your browser
- 🎯 Automatically extracts and indexes paragraphs and headings
- 📊 Ranks results by semantic similarity
- 🔎 Highlights matched content on the page
- ⚡ Real-time search results

## How It Works

1. When activated on a webpage, the extension:
   - Extracts all paragraphs and headings
   - Creates text embeddings using the `Xenova/all-MiniLM-L6-v2` model
   - Stores these embeddings in memory

2. When you search:
   - Your query is converted to an embedding
   - Cosine similarity is calculated against all paragraph embeddings
   - Results are ranked by similarity score
   - Most relevant matches are displayed and can be clicked to highlight on the page

## Installation

1. Clone this repository
2. Install dependencies:
   npm install
3. Build the extension:
    npm run build
4. Load the extension in Chrome:
    Open chrome://extensions/
    Enable "Developer mode"
    Click "Load unpacked"
    Select the build directory

## Development
Run in watch mode during development:
npm run dev

## Technical Details

- Uses Transformers.js for running the embedding model
- Built with Webpack for module bundling
- Background script handles the embedding creation and similarity calculations
- Popup UI built with Bootstrap for a clean interface

