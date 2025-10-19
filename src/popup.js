// popup.js - handles interaction with the extension's popup, sends requests to the
// service worker (background.js), and updates the popup's UI (popup.html) on completion.

const MAX_CHUNK_LENGTH = 20; // characters or words depending on approach
const OVERLAP = 5;           // overlap to preserve context
const loadingElement = document.getElementById("loadind-text");
const searchBtn = document.querySelector("#search");
const inputText = document.querySelector("#searchInput")
const searchResultList = document.querySelector("#searchResultList > ul");

const port = chrome.runtime.connect({ name: 'doc-embed' });
let embeddings = [];


init();


async function init() {
    searchBtn.setAttribute("disabled", true);
    const documents = await getPageContent();
    const chunkedDoc = [];
    for (let index = 0; index < documents.length; index++) {
        const doc = documents[index];
        if (doc.text.length <= MAX_CHUNK_LENGTH) {
            chunkedDoc.push(doc);
        } else {
            const chunks = chunkParagraph(doc.text);
            chunks.forEach(chunk => {
                chunkedDoc.push({
                    ...doc,
                    text: chunk
                });
            });
        }
    }
    console.log({ chunkedDoc });

    const embeddingDocs = await createDocumentEmbedding(chunkedDoc);
    embeddings = embeddingDocs.embeddings;
    console.log({ embeddings });
    searchBtn.removeAttribute("disabled")

}

searchBtn.addEventListener("click", async (e) => {
    const inputValue = inputText.value;
    if (!inputValue || inputValue === "") return;
    clearList();
    const c = await searchEmbedding(embeddings, inputValue)
    console.log({ c });
    renderList(c.embeddings)

})



function renderList(documents) {
    clearList();
    const fragment = document.createDocumentFragment();
    for (const element of documents) {
        const li = document.createElement('li');
        li.className = 'cursor-pointer list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span>${truncateText(element.text)}</span>
            <span class="badge text-bg-primary rounded-pill">${Math.round(element.score * 100)}%</span>
        `;
        li.onclick = () => navigateToElement(element.refClass);
        fragment.appendChild(li);
    }
    searchResultList.appendChild(fragment);
}

function truncateText(text, wordLimit = 6) {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    return words.length > wordLimit
        ? words.slice(0, wordLimit).join(' ') + '...'
        : text;
}

function clearList() {
    searchResultList.innerHTML = "";
}

function navigateToElement(className) {
    console.log('navigateToElement ->', className);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        const tabId = tabs[0].id;

        chrome.scripting.executeScript({
            target: { tabId },
            func: (cls) => {
                // Runs in page context

                // safe CSS escape (use native if available)
                const cssEscape = window.CSS && CSS.escape ? CSS.escape.bind(CSS) : (str) => {
                    return str.replace(/([ !"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
                };

                function clearPrevHighlights() {
                    const prev = document.querySelectorAll('[data-ai-context-highlight="true"]');
                    prev.forEach(el => {
                        el.removeAttribute('data-ai-context-highlight');
                        el.style.transition = '';
                        el.style.backgroundColor = '';
                    });
                }

                try {
                    clearPrevHighlights();

                    if (!cls || typeof cls !== 'string') return;

                    // Build selector for className (handles multi-class input like "my-class" or "a b")
                    // If given a string like "my-class", select elements with that class.
                    // If given space-separated classes, we try the exact class first, then fallback to querySelector for the whole string.
                    const escaped = cssEscape(cls.trim());
                    let el = null;

                    // Try selecting by single class first
                    try {
                        el = document.querySelector('.' + escaped);
                    } catch (e) {
                        // fallback selector attempt
                    }

                    // If not found, try as full selector (in case user passed "div.someclass" or similar)
                    if (!el) {
                        try {
                            el = document.querySelector(cls);
                        } catch (e) {
                            // ignore
                        }
                    }

                    // Last fallback: try any element that has a data-ai-ref attribute equal to className
                    if (!el) {
                        el = document.querySelector(`[data-ai-ref="${cls}"]`);
                    }

                    if (!el) {
                        console.warn('[AI Context Search] element not found for class:', cls);
                        return;
                    }

                    // Scroll and highlight
                    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

                    el.setAttribute('data-ai-context-highlight', 'true');

                    const prevTransition = el.style.transition || '';
                    const prevBg = el.style.backgroundColor || '';

                    el.style.transition = 'background-color 0.45s ease';
                    el.style.backgroundColor = 'rgba(255, 246, 140, 0.85)';

                    // remove highlight after 3.8s
                    setTimeout(() => {
                        el.style.backgroundColor = prevBg;
                        el.style.transition = prevTransition;
                        el.removeAttribute('data-ai-context-highlight');
                    }, 3800);

                } catch (err) {
                    console.error('[AI Context Search] navigateToElement error:', err);
                }
            },
            args: [className],
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('executeScript error:', chrome.runtime.lastError.message);
            }
        });
    });
}

function createDocumentEmbedding(documents) {
    return new Promise((resolve, reject) => {
        loadingElement.innerText = "Creating Page Embedding"

        if (!documents || !documents.length) resolve();
        port.onMessage.addListener((msg) => {
            // console.log('port message', msg);
            loadingElement.innerText = ""
            if (msg.eventType === 'document_embedding_completed') {
                resolve(msg)
            }

        });
        port.postMessage({ action: 'create-document-embedding', documents });
    })
}

function searchEmbedding(embeddings, searchText) {
    return new Promise((resolve, reject) => {
        loadingElement.innerText = "Searching Page Embedding";
        searchBtn.setAttribute("disabled", true);

        port.postMessage({ action: 'search-document-embedding', embeddings, searchText });
        port.onMessage.addListener((msg) => {
            // console.log('port message', msg);
            if (msg.eventType === 'search-document-embedding_completed') {
                loadingElement.innerText = ""
                searchBtn.removeAttribute("disabled");
                resolve(msg)
            }

        });
    })
}


function getPageContent() {
    return new Promise((resolve, reject) => {
        loadingElement.innerText = "Loading Page Content"
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const tab = tabs?.[0];
            if (!tab?.id) {
                console.error("popup: no active tab");
                return;
            }
            const tabId = tab.id;
            chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    // Get all paragraphs and headings in document order
                    const elements = Array.from(document.body.getElementsByTagName('*'))
                        .filter(el => {
                            const tagName = el.tagName.toLowerCase();
                            return (tagName === 'p' || tagName.match(/^h[1-6]$/));
                        })
                        .map((element, index) => {
                            const tagName = element.tagName.toLowerCase();
                            const refClass = `element-ref-${index}`;
                            element.classList.add(refClass);

                            return {
                                element,
                                refClass,
                                type: tagName,
                                text: element.textContent,
                                index // preserve original position
                            };
                        });



                    return {
                        title: document.title,
                        htmlLength: document.documentElement.outerHTML.length,
                        robotsMeta: document.querySelector("meta[name='robots']")?.getAttribute("content") || null,
                        elements, // single array containing both paragraphs and headings in order
                        document: document.documentElement
                    };
                }
            })
                .then(results => {
                    console.log({
                        results
                    });

                    resolve(results?.[0]?.result.elements)
                }).catch(err => reject(err));
        })
    })

}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PORT_DISCONNECTED') {
        const notice = document.getElementById('notice');
        if (notice) {
            notice.textContent = '⚠️ Connection lost. Please refresh the extension.';
            notice.style.display = 'block';
        } else {
            alert('⚠️ Connection lost. Please refresh the extension.');
        }
    }
});

function chunkParagraph(text, maxWords = MAX_CHUNK_LENGTH, overlap = OVERLAP) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];

    for (let i = 0; i < words.length; i += (maxWords - overlap)) {
        const chunk = words.slice(i, i + maxWords).join(' ');
        chunks.push(chunk.trim());
        if (i + maxWords >= words.length) break;
    }

    return chunks;
}