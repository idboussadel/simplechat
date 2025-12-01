# SimpleChat
Simple Chatbot is a full-stack platform that lets anyone build, customize, train, and deploy AI-powered chatbots on their website with a single script tag. Upload your data, tailor the behavior, and launch a smart assistant in minutes no coding required.

https://github.com/user-attachments/assets/ce5d92da-63c7-4bd2-97d6-d8e496bc5e35

<img width="1916" height="941" alt="image" src="https://github.com/user-attachments/assets/1f3130b9-206b-4715-ad3b-d8fbcacd6d40" />

<img width="1918" height="940" alt="image" src="https://github.com/user-attachments/assets/cd4e3439-2ff5-49f8-929d-f96c5cbba35d" />

## Features

### Core Functionality
- **AI Chatbot Creation**: Build custom chatbots with personalized instructions, tone, and language settings
- Upload documents (PDF, DOCX, TXT, Excel) and websites to create knowledge bases for your chatbots
- Real-time Chat
- **Customizable Widget**: Embeddable chatbot widget with full styling customization (colors, border radius, dark mode)
- **Multiple AI Models**: Support for various OpenAI models (GPT-4, GPT-4o-mini, etc.)

### Advanced Features
- **Human Handoff System**: Seamlessly transfer conversations from AI to human agents
- **Workspace Collaboration**: Multi-user workspaces with role-based access control
- **Analytics Dashboard**: Track conversations, messages, user engagement, and performance metrics
- **Conversation Management**: View, search, and manage all conversations with filtering and pagination
- **Document Management**: Upload, process, and manage knowledge base documents
- **Website Crawling**: Automatically crawl and index website content for chatbot knowledge
- **Credit System**: Usage-based credit system with subscription plans
- **Real-time Updates**: WebSocket-powered real-time dashboard updates (like WhatsApp)

### User Experience
- **Modern UI**: Built with Next.js, React, and shadcn/ui components
- **Responsive Design**: Fully responsive interface that works on all devices
- **Dark Mode Support**: Customizable dark mode for chatbot widgets
- **Message Feedback**: Like/dislike feedback system for continuous improvement
- **Conversation History**: Persistent conversation history with client UUID tracking

## 🛠️ Tech Stack

- **Framework**: Python, LangChain, FastAPI, Nextjs, TypeScript, tailwindCSS, Shadcn
- **Database**: PostgreSQL with SQLModel ORM
- **Vector Database**: Pinecone (for embeddings)
- **AI/ML**: 
  - OpenAI API (GPT models)
  - LangChain & LangGraph
  - LangChain-Pinecone
- **Task Queue**: Celery with Redis
- **WebSockets**: Native FastAPI WebSocket support
- **Authentication**: JWT tokens with bcrypt password hashing
- **File Processing**: 
  - PyPDF2 (PDF)
  - python-docx (Word documents)
  - openpyxl (Excel)
  - BeautifulSoup4 (HTML/Web scraping)
- **Migrations**: Alembic


