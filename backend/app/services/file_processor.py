from typing import List
import PyPDF2
import docx
import pandas as pd

class FileProcessor:
    
    @staticmethod
    def extract_text(file_path: str, file_type: str) -> str:
        """Extract text from different file types"""
        if file_type == "pdf":
            return FileProcessor._extract_pdf(file_path)
        elif file_type in ["docx", "doc"]:
            return FileProcessor._extract_docx(file_path)
        elif file_type in ["xlsx", "xls", "csv"]:
            return FileProcessor._extract_excel(file_path)
        elif file_type == "txt":
            return FileProcessor._extract_txt(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    
    @staticmethod
    def _extract_pdf(file_path: str) -> str:
        text = ""
        with open(file_path, "rb") as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text()
        return text
    
    @staticmethod
    def _extract_docx(file_path: str) -> str:
        doc = docx.Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    
    @staticmethod
    def _extract_excel(file_path: str) -> str:
        df = pd.read_excel(file_path) if file_path.endswith(('.xlsx', '.xls')) else pd.read_csv(file_path)
        return df.to_string()
    
    @staticmethod
    def _extract_txt(file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as file:
            return file.read()
    
    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """Split text into overlapping chunks"""
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk:
                chunks.append(chunk)
        
        return chunks