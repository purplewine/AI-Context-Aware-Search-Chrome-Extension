import { pipeline } from '@huggingface/transformers';


function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0.0;
    let magnitudeA = 0.0;
    let magnitudeB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    // Avoid division by zero
    if (magnitudeA && magnitudeB) {
        return dotProduct / (magnitudeA * magnitudeB);
    } else {
        return 0;
    }
}

class PipelineSingleton {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance = null;

    static async getInstance(progress_callback = null) {
        this.instance ??= pipeline(this.task, this.model, { progress_callback });

        return this.instance;
    }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'doc-embed') return;

  port.onMessage.addListener(async (message) => {
    console.log('port received', message);
    if (message.action === 'create-document-embedding') {
      try {
        const documentEmbeddingModel = await PipelineSingleton.getInstance(x => {
        //   console.log({ x });
        });

        const candidateResults = [];
        for (const doc of message.documents) {
          const output = await documentEmbeddingModel(doc.text, {
            pooling: 'mean',
            normalize: true,
          });
          candidateResults.push({
            ...doc,
            embedding: output.data
          });
        }

        port.postMessage({ eventType: 'document_embedding_completed', embeddings: candidateResults });
      } catch (err) {
        console.error('embedding failed', err);
        port.postMessage({ eventType: 'document_embedding_failed', error: String(err) });
      }
    }

    if(message.action === 'search-document-embedding') {
        try {
            const candidateResults = message.embeddings;
            const text = message.searchText;
            const documentEmbeddingModel = await PipelineSingleton.getInstance(x => {
                // console.log({ x });
            });
            const searchTextEmbedding = await documentEmbeddingModel(text, {
                pooling: 'mean',
                normalize: true,
            });
            console.log({searchTextEmbedding});
            
            const scoredCandidates = candidateResults.map(candidate => ({
                ...candidate,
                score: cosineSimilarity(searchTextEmbedding.data, candidate.embedding),
            }));
            scoredCandidates.sort((a, b) => b.score - a.score);
            let filterdScoredCandidates = scoredCandidates.filter(x => x.score > 0.2)
            port.postMessage({ eventType: 'search-document-embedding_completed', embeddings: filterdScoredCandidates });


        } catch (error) {
            console.error('embedding failed', error);
            port.postMessage({ eventType: 'document_embedding_failed', error: String(err) });
        }
    }
  });


  port.onDisconnect.addListener(() => {
    console.log('port disconnected');
    chrome.runtime.sendMessage({ type: 'PORT_DISCONNECTED' });
  });
});

