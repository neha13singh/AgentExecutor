import logging
import faiss
from sentence_transformers import SentenceTransformer
import numpy as np

logger = logging.getLogger(__name__)

# Initialize embedding model
try:
    model = SentenceTransformer('all-MiniLM-L6-v2')
    logger.info("SentenceTransformer model loaded successfully.")
except Exception as e:
    logger.error(f"Warning: Could not load SentenceTransformer: {e}")
    model = None

# Initialize FAISS index
dimension = 384 # dimension for all-MiniLM-L6-v2
index = faiss.IndexFlatL2(dimension)
document_chunks = []

def add_texts(texts: list[str]):
    global index, document_chunks
    if not model or not texts:
        logger.warning(f"Could not add text to storage (model alive? {bool(model)}, texts alive? {bool(texts)})")
        return
    
    logger.info(f"Adding {len(texts)} chunks of text to FAISS index.")
    embeddings = model.encode(texts)
    faiss.normalize_L2(embeddings)
    index.add(np.array(embeddings).astype('float32'))
    document_chunks.extend(texts)

def search_documents(query: str, top_k: int = 3) -> str:
    """Search uploaded documents for context"""
    logger.info(f"Searching memory for query: '{query}'")
    if not model or len(document_chunks) == 0:
        logger.warning("Empty RAG memory or disconnected model during search")
        return "No documents uploaded or available."
    
    query_vector = model.encode([query])
    faiss.normalize_L2(query_vector)
    
    distances, indices = index.search(np.array(query_vector).astype('float32'), min(top_k, len(document_chunks)))
    
    results = []
    for i in indices[0]:
        if i >= 0 and i < len(document_chunks):
            results.append(document_chunks[i])
            
    logger.info(f"Found {len(results)} search results for retrieving.")
    return "\n---\n".join(results) if results else "No relevant context found."
