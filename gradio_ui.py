# Gradio UI for Distributed RAG System
# Run: python gradio_ui.py

import gradio as gr
import requests
import json
import time
from typing import List, Optional
import PyPDF2
import io

# Configuration
WORKER_URL = "https://hpc.aikipedia.workers.dev"
OPENROUTER_API_KEY = "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"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default model
DEFAULT_MODEL = "google/gemini-2.5-flash"

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    try:
        text = ""
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Error extracting PDF text: {str(e)}")

def upload_document(file, document_text: str, laptop_urls: str):
    """
    Upload document to Cloudflare Worker.
    Accepts either file upload (.txt or .pdf) or text input.
    Returns: (status_message, show_chat_ui)
    """
    import time
    start_time = time.time()
    
    # Get document text from file or text input
    doc_text = ""
    
    if file is not None:
        try:
            # Read file content (Gradio file upload returns file path)
            file_path = file if isinstance(file, str) else file.name
            
            # Check file extension
            if file_path.lower().endswith('.pdf'):
                # Extract text from PDF
                doc_text = extract_text_from_pdf(file_path)
                if not doc_text.strip():
                    return "❌ PDF appears to be empty or couldn't extract text", False
            elif file_path.lower().endswith('.txt'):
                # Read text file
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    doc_text = f.read()
                if not doc_text.strip():
                    return "❌ File appears to be empty", False
            else:
                return "❌ Unsupported file type. Please upload .txt or .pdf files", False
                
        except Exception as e:
            return f"❌ Error reading file: {str(e)}", False
    
    if not doc_text and document_text:
        doc_text = document_text
    
    if not doc_text or not doc_text.strip():
        return "❌ Please provide a document (upload file or paste text)", False
    
    if not laptop_urls or not laptop_urls.strip():
        return "❌ Please provide at least one laptop URL (ngrok URL)", False
    
    # Parse laptop URLs
    urls = [url.strip() for url in laptop_urls.split(',') if url.strip()]
    
    if not urls:
        return "❌ Invalid laptop URLs format. Use comma-separated URLs.", False
    
    try:
        response = requests.post(
            f"{WORKER_URL}/upload-document",
            json={
                "document_text": doc_text,
                "laptop_urls": urls
            },
            timeout=300  # 5 minutes timeout
        )
        
        if response.status_code == 200:
            end_time = time.time()
            total_time = end_time - start_time
            
            data = response.json()
            result = f"✅ Document uploaded successfully!\n\n"
            result += f"Document ID: {data.get('document_id')}\n"
            result += f"Total chunks: {data.get('total_chunks')}\n"
            result += f"Chunks stored: {data.get('chunks_stored')}\n\n"
            
            # Show laptop results with timing
            laptop_results = data.get('laptop_results', [])
            result += "Laptop Processing Results:\n"
            all_success = True
            total_chunks_processed = 0
            for laptop in laptop_results:
                status = "✅" if laptop.get('success') else "❌"
                if not laptop.get('success'):
                    all_success = False
                result += f"{status} Laptop {laptop.get('laptop_id')}: "
                if laptop.get('success'):
                    chunks_processed = laptop.get('chunks_processed', 0)
                    total_chunks_processed += chunks_processed
                    result += f"Processed {chunks_processed} chunks"
                    # Show processing time if available
                    if 'processing_time' in laptop:
                        proc_time = laptop['processing_time']
                        result += f" in {proc_time:.2f}s"
                        if 'chunks_per_second' in laptop and laptop['chunks_per_second'] > 0:
                            result += f" ({laptop['chunks_per_second']:.2f} chunks/sec)"
                    result += "\n"
                else:
                    result += f"Error: {laptop.get('error', 'Unknown error')}\n"
            
            # Add timing summary
            result += f"\n⏱️  Total Upload Time: {total_time:.2f} seconds\n"
            result += f"📊 Total Chunks Processed: {total_chunks_processed}\n"
            if total_chunks_processed > 0:
                result += f"⚡ Average Speed: {total_chunks_processed/total_time:.2f} chunks/second\n"
            
            if all_success:
                result += "\n✅ Processing complete! You can now ask questions."
                return result, True  # Show chat UI
            else:
                result += "\n⚠️ Some laptops failed. You can still try asking questions."
                return result, True  # Show chat UI anyway
            
        else:
            return f"❌ Error: {response.status_code}\n{response.text}", False
            
    except requests.exceptions.Timeout:
        return "❌ Request timed out. The document might be too large or laptops are processing.", False
    except Exception as e:
        return f"❌ Error: {str(e)}", False

def process_query(query: str, laptop_urls: str, model: str) -> str:
    """
    Process query and get answer from LLM.
    """
    import time
    total_start_time = time.time()
    
    if not query or not query.strip():
        return "❌ Please provide a query"
    
    if not laptop_urls or not laptop_urls.strip():
        return "❌ Please provide at least one laptop URL"
    
    # Parse laptop URLs
    urls = [url.strip() for url in laptop_urls.split(',') if url.strip()]
    
    try:
        # Step 1: Get relevant chunks from Cloudflare Worker
        search_start_time = time.time()
        print(f"Querying worker for relevant chunks...")
        response = requests.post(
            f"{WORKER_URL}/process-query",
            json={
                "query": query,
                "laptop_urls": urls,
                "top_k": 5
            },
            timeout=60
        )
        
        if response.status_code != 200:
            return f"❌ Error getting chunks: {response.status_code}\n{response.text}"
        
        search_end_time = time.time()
        search_time = search_end_time - search_start_time
        
        data = response.json()
        chunks = data.get('chunks', [])
        worker_processing_time = data.get('processing_time_ms', 0) / 1000  # Convert ms to seconds
        
        if not chunks:
            return "❌ No relevant chunks found. Make sure the document has been uploaded and processed."
        
        # Step 2: Prepare context from chunks
        context = "\n\n".join([
            f"[Chunk {chunk.get('chunk_index', '?')}]: {chunk.get('chunk_text', '')}"
            for chunk in chunks
        ])
        
        # Step 3: Call OpenRouter API
        llm_start_time = time.time()
        print(f"Calling OpenRouter API with model: {model}...")
        openrouter_response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/your-repo",
                "X-Title": "Distributed RAG System"
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful assistant. Answer questions based on the provided context. If the answer is not in the context, say so."
                    },
                    {
                        "role": "user",
                        "content": f"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"
                    }
                ],
                "temperature": 0.7
            },
            timeout=60
        )
        
        if openrouter_response.status_code != 200:
            return f"❌ Error from OpenRouter: {openrouter_response.status_code}\n{openrouter_response.text}"
        
        llm_end_time = time.time()
        llm_time = llm_end_time - llm_start_time
        
        total_end_time = time.time()
        total_time = total_end_time - total_start_time
        
        openrouter_data = openrouter_response.json()
        answer = openrouter_data.get('choices', [{}])[0].get('message', {}).get('content', 'No response')
        
        # Get token usage
        usage = openrouter_data.get('usage', {})
        input_tokens = usage.get('prompt_tokens', 0)
        output_tokens = usage.get('completion_tokens', 0)
        
        # Format response
        result = f"**Answer:**\n{answer}\n\n"
        result += f"---\n\n"
        result += f"**Performance Metrics:**\n"
        result += f"- Context used: {len(chunks)} chunks\n"
        result += f"- Vector search time: {search_time:.2f}s (Worker: {worker_processing_time:.2f}s)\n"
        result += f"- LLM generation time: {llm_time:.2f}s\n"
        result += f"- **Total query time: {total_time:.2f}s**\n"
        result += f"- Model: {model}\n"
        if input_tokens > 0:
            result += f"- Tokens: {input_tokens} input + {output_tokens} output = {input_tokens + output_tokens} total\n"
        
        return result
        
    except requests.exceptions.Timeout:
        return "❌ Request timed out. Please try again."
    except Exception as e:
        return f"❌ Error: {str(e)}"

# Create Gradio interface
with gr.Blocks(title="Distributed RAG System", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🚀 Adaptive Cloud-Federated Multi-GPU Architecture")
    gr.Markdown("### Distributed Knowledge Extraction and Context-Aware Question Response")
    
    # State to track if document is uploaded
    document_uploaded = gr.State(value=False)
    
    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### 📤 Step 1: Upload Document")
            gr.Markdown("Upload a .txt or .pdf file, or paste your document text below.")
            
            file_upload = gr.File(
                label="Upload Document (.txt or .pdf)",
                file_types=[".txt", ".pdf"],
                type="filepath"
            )
            
            gr.Markdown("**OR** paste text below:")
            
            document_input = gr.Textbox(
                label="Document Text",
                placeholder="Paste your document here... (e.g., Indian Constitution)",
                lines=15,
                max_lines=30
            )
            
            laptop_urls_input = gr.Textbox(
                label="Laptop URLs (ngrok)",
                placeholder="https://abc123.ngrok.io, https://xyz789.ngrok.io",
                value="https://78f779918f7a.ngrok-free.app",
                info="Comma-separated ngrok URLs of your laptops"
            )
            
            upload_btn = gr.Button("Upload & Process Document", variant="primary", size="lg")
            
            upload_output = gr.Textbox(
                label="Upload Status",
                lines=10,
                interactive=False
            )
        
        with gr.Column(scale=1, visible=False) as chat_column:
            gr.Markdown("### ❓ Step 2: Ask Questions")
            gr.Markdown("Ask questions about your uploaded document.")
            
            query_input = gr.Textbox(
                label="Your Question",
                placeholder="What is this document about?",
                lines=3
            )
            
            query_laptop_urls = gr.Textbox(
                label="Laptop URLs (ngrok)",
                placeholder="https://abc123.ngrok.io, https://xyz789.ngrok.io",
                value="https://78f779918f7a.ngrok-free.app",
                info="Same URLs used for upload"
            )
            
            model_dropdown = gr.Dropdown(
                label="LLM Model",
                choices=[
                    "google/gemini-2.5-flash",
                    "anthropic/claude-3-haiku",
                    "deepseek/deepseek-chat-v3-0324",
                    "mistralai/codestral-2501",
                    "qwen/qwen-2.5-coder-32b-instruct"
                ],
                value=DEFAULT_MODEL
            )
            
            query_btn = gr.Button("Get Answer", variant="primary", size="lg")
            
            query_output = gr.Markdown(
                label="Answer"
            )
    
    # Upload button handler
    def handle_upload(file, text, urls):
        status_msg, show_chat = upload_document(file, text, urls)
        return status_msg, gr.update(visible=show_chat), urls
    
    upload_btn.click(
        fn=handle_upload,
        inputs=[file_upload, document_input, laptop_urls_input],
        outputs=[upload_output, chat_column, query_laptop_urls]
    )
    
    # Query button handler
    query_btn.click(
        fn=process_query,
        inputs=[query_input, query_laptop_urls, model_dropdown],
        outputs=query_output
    )
    
    # About section at bottom
    with gr.Accordion("ℹ️ About This System", open=False):
        gr.Markdown("""
        This is a **distributed RAG (Retrieval-Augmented Generation)** system that:
        
        1. **Splits documents** into chunks and stores them in Supabase
        2. **Distributes embedding generation** across multiple laptop GPUs
        3. **Performs parallel vector search** on all laptops
        4. **Retrieves relevant chunks** and sends them to an LLM for answering
        
        ### Architecture:
        - **Cloudflare Worker**: Orchestrates the system
        - **Supabase**: Stores document chunks and embeddings
        - **Laptop Workers**: Generate embeddings and perform vector search (via ngrok)
        - **OpenRouter**: Provides LLM API access
        
        ### Setup:
        1. Deploy Cloudflare Worker (already done)
        2. Run laptop workers: `python laptop_worker.py`
        3. Start ngrok: `ngrok http 8000`
        4. Use this UI to upload documents and ask questions!
        """)

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 Starting Gradio UI...")
    print("="*60)
    print(f"📡 Cloudflare Worker: {WORKER_URL}")
    print(f"🌐 UI will be available at: http://localhost:7860")
    print("="*60)
    print("\n⚠️  Make sure:")
    print("   1. Laptop worker is running (python laptop_worker.py)")
    print("   2. ngrok is forwarding to http://localhost:8000")
    print("   3. Copy your ngrok URL and paste it in the UI")
    print("="*60 + "\n")
    
    try:
        demo.launch(share=False, server_name="0.0.0.0", server_port=7860)
    except KeyboardInterrupt:
        print("\n\nShutting down Gradio UI...")
    except Exception as e:
        print(f"\n\nError starting Gradio: {e}")
        raise

