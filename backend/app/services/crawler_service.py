"""Web crawler service for scraping websites and extracting content."""
import re
import logging
from typing import List, Dict, Tuple, Optional
from urllib.parse import urljoin, urlparse, urlunparse
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from sqlmodel import Session
from app.models import WebsiteLink

logger = logging.getLogger(__name__)


class WebCrawler:
    """Web crawler for extracting content from websites."""

    def __init__(self, max_pages: int = 100, timeout: int = 10):
        """Initialize the web crawler.
        
        Args:
            max_pages: Maximum number of pages to crawl per URL
            timeout: Request timeout in seconds
        """
        self.max_pages = max_pages
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; ChatbotBuilder/1.0; +http://chatbotbuilder.com)'
        })

    def normalize_url(self, url: str) -> str:
        """Normalize URL by removing fragments and query params for deduplication."""
        parsed = urlparse(url)
        # Remove fragment and normalize
        normalized = urlunparse((
            parsed.scheme,
            parsed.netloc.lower(),
            parsed.path.rstrip('/') or '/',
            '',  # params
            parsed.query,
            ''  # fragment
        ))
        return normalized

    def is_valid_url(self, url: str, base_domain: str) -> bool:
        """Check if URL is valid and belongs to the same domain."""
        try:
            parsed = urlparse(url)
            base_parsed = urlparse(base_domain)
            
            # Must have http or https scheme
            if parsed.scheme not in ['http', 'https']:
                return False
            
            # Must belong to the same domain or subdomain
            if not (parsed.netloc == base_parsed.netloc or 
                    parsed.netloc.endswith('.' + base_parsed.netloc)):
                return False
            
            # Exclude common file extensions
            excluded_extensions = [
                '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
                '.zip', '.tar', '.gz', '.mp4', '.mp3', '.avi', '.mov',
                '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
            ]
            path_lower = parsed.path.lower()
            if any(path_lower.endswith(ext) for ext in excluded_extensions):
                return False
            
            return True
        except Exception:
            return False

    def extract_links(self, html: str, base_url: str) -> List[str]:
        """Extract all valid links from HTML content."""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        for link_tag in soup.find_all('a', href=True):
            href = link_tag['href']
            # Convert relative URLs to absolute
            absolute_url = urljoin(base_url, href)
            # Normalize and validate
            normalized_url = self.normalize_url(absolute_url)
            if self.is_valid_url(normalized_url, base_url):
                links.append(normalized_url)
        
        return list(set(links))  # Remove duplicates

    def extract_text_content(self, html: str, url: str) -> Tuple[str, Optional[str]]:
        """Extract clean text content and title from HTML.
        
        Returns:
            Tuple of (text_content, page_title)
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract title
        title = None
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text().strip()
        
        # Remove script, style, and other non-content tags
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 
                        'aside', 'noscript', 'iframe', 'form']):
            tag.decompose()
        
        # Get main content - prioritize main, article, or body
        main_content = soup.find('main') or soup.find('article') or soup.find('body') or soup
        
        # Extract text
        text = main_content.get_text(separator='\n', strip=True)
        
        # Clean up text
        # Remove excessive whitespace
        text = re.sub(r'\n\s*\n', '\n\n', text)
        text = re.sub(r' +', ' ', text)
        
        # Remove very short lines (likely navigation/UI elements)
        lines = [line.strip() for line in text.split('\n') if len(line.strip()) > 20]
        text = '\n'.join(lines)
        
        return text, title

    def crawl_page(self, url: str) -> Optional[Tuple[str, Optional[str], List[str]]]:
        """Crawl a single page and extract content and links.
        
        Returns:
            Tuple of (text_content, title, found_links) or None if failed
        """
        try:
            response = self.session.get(url, timeout=self.timeout, allow_redirects=True)
            response.raise_for_status()
            
            # Only process HTML content
            content_type = response.headers.get('content-type', '').lower()
            if 'text/html' not in content_type:
                logger.warning(f"Skipping non-HTML content: {url}")
                return None
            
            html = response.text
            
            # Extract content and links
            text_content, title = self.extract_text_content(html, url)
            links = self.extract_links(html, url)
            
            return text_content, title, links
            
        except requests.exceptions.Timeout:
            logger.error(f"Timeout while crawling {url}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Error crawling {url}: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error crawling {url}: {str(e)}")
            return None

    def crawl_website(self, start_url: str) -> Dict[str, Dict]:
        """Crawl website starting from a URL.
        
        Args:
            start_url: The starting URL to crawl from
            
        Returns:
            Dict mapping URLs to their content: {url: {'title': str, 'content': str}}
        """
        # Normalize start URL
        start_url = self.normalize_url(start_url)
        
        visited = set()
        to_visit = [start_url]
        crawled_pages = {}
        
        while to_visit and len(visited) < self.max_pages:
            current_url = to_visit.pop(0)
            
            # Skip if already visited
            if current_url in visited:
                continue
            
            logger.info(f"Crawling: {current_url} ({len(visited) + 1}/{self.max_pages})")
            visited.add(current_url)
            
            # Crawl the page
            result = self.crawl_page(current_url)
            if result:
                text_content, title, links = result
                
                # Store the content if it has meaningful text
                if len(text_content) > 100:  # Minimum content length
                    crawled_pages[current_url] = {
                        'title': title or 'Untitled',
                        'content': text_content
                    }
                
                # Add new links to visit
                for link in links:
                    if link not in visited and link not in to_visit:
                        to_visit.append(link)
        
        logger.info(f"Crawling complete. Visited {len(visited)} pages, extracted {len(crawled_pages)} pages with content")
        return crawled_pages


async def crawl_and_process_website(
    website_link_id: int,
    chatbot_uuid: str,
    url: str,
    session: Session,
    crawl_mode: str = "crawl"
) -> Tuple[bool, Optional[str]]:
    """Crawl a website and process its content.
    
    Args:
        website_link_id: ID of the WebsiteLink record
        chatbot_uuid: UUID of the chatbot
        url: URL to crawl
        session: Database session
        crawl_mode: "crawl" to crawl entire website, "individual" to fetch only the specific URL
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    try:
        # Update status to crawling
        website_link = session.get(WebsiteLink, website_link_id)
        if not website_link:
            return False, "WebsiteLink not found"
        
        website_link.status = "crawling"
        session.add(website_link)
        session.commit()
        session.refresh(website_link)
        
        # Initialize crawler
        crawler = WebCrawler(max_pages=100, timeout=10)
        
        # Crawl based on mode
        if crawl_mode == "individual":
            # For individual links, only fetch the specific URL without crawling
            logger.info(f"Fetching individual link: {url}")
            result = crawler.crawl_page(url)
            if result:
                text_content, title, _ = result
                if len(text_content) > 100:
                    crawled_pages = {url: {'title': title or 'Untitled', 'content': text_content}}
                else:
                    crawled_pages = {}
            else:
                crawled_pages = {}
        else:
            # For crawl mode, crawl the entire website
            crawled_pages = crawler.crawl_website(url)
        
        if not crawled_pages:
            website_link.status = "error"
            website_link.error_message = "No content could be extracted from the website"
            session.add(website_link)
            session.commit()
            return False, "No content could be extracted"
        
        # Set title from first page if not set
        if not website_link.title and crawled_pages:
            first_page = next(iter(crawled_pages.values()))
            website_link.title = first_page['title']
        
        # Combine all content into one large text
        combined_content = ""
        for page_url, page_data in crawled_pages.items():
            combined_content += f"\n\n=== {page_data['title']} ===\n"
            combined_content += f"URL: {page_url}\n\n"
            combined_content += page_data['content']
        
        # Import document service to process the content
        from app.services.document_service import process_document_content
        
        # Process the content (create chunks and embeddings)
        chunk_count = await process_document_content(
            content=combined_content,
            chatbot_uuid=chatbot_uuid,
            source_type="website",
            source_id=str(website_link_id),
            session=session
        )
        
        # Update website link status
        website_link.status = "completed"
        website_link.link_count = len(crawled_pages)
        website_link.chunk_count = chunk_count
        website_link.last_crawled_at = datetime.utcnow()
        website_link.error_message = None
        session.add(website_link)
        session.commit()
        
        logger.info(f"Successfully crawled and processed {len(crawled_pages)} pages from {url}")
        return True, None
        
    except Exception as e:
        logger.error(f"Error crawling website {url}: {str(e)}")
        
        # Update status to error
        if website_link:
            website_link.status = "error"
            website_link.error_message = str(e)[:500]  # Limit error message length
            session.add(website_link)
            session.commit()
        
        return False, str(e)

