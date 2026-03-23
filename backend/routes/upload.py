import logging
from fastapi import APIRouter, UploadFile, File
from pypdf import PdfReader
import io
from memory.rag import add_texts

logger = logging.getLogger(__name__)
router = APIRouter()

def chunk_text(text: str, chunk_size=1000, overlap=100):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
    return chunks

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    logger.info(f"Received file upload request for {file.filename}")
    if not file.filename.lower().endswith('.pdf'):
        logger.warning(f"File upload rejected: {file.filename} is not a PDF")
        return {"error": "Only PDF files are supported"}
    
    try:
        content = await file.read()
        logger.info(f"Read {len(content)} bytes from file {file.filename}")
        reader = PdfReader(io.BytesIO(content))
        
        extracted_text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                extracted_text += page_text + "\n"
            
        chunks = chunk_text(extracted_text)
        if chunks:
            add_texts(chunks)
        
        logger.info(f"Successfully processed {len(chunks)} chunks from {file.filename}")
        return {"filename": file.filename, "status": "processed", "chunks": len(chunks)}
    except Exception as e:
        logger.exception(f"Internal Upload Error for {file.filename}")
        return {"error": f"Internal Upload Error: {str(e)}", "status": "failed"}
