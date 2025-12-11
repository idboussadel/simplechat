"""
Email service for sending transactional emails.
Uses MailHog for development/testing.
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


class EmailService:
    """Service to send emails via SMTP (MailHog for testing)"""
    
    SMTP_HOST = os.getenv("SMTP_HOST", "mailhog")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@chatsimple.com")
    FROM_NAME = os.getenv("FROM_NAME", "ChatSimple")
    
    @staticmethod
    def send_email(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email via SMTP"""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info(f"Attempting to send email to {to_email} via {EmailService.SMTP_HOST}:{EmailService.SMTP_PORT}")
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{EmailService.FROM_NAME} <{EmailService.FROM_EMAIL}>"
            msg["To"] = to_email
            
            # Add text and HTML parts
            if text_content:
                text_part = MIMEText(text_content, "plain")
                msg.attach(text_part)
            
            html_part = MIMEText(html_content, "html")
            msg.attach(html_part)
            
            # Send email
            logger.info(f"Connecting to SMTP server {EmailService.SMTP_HOST}:{EmailService.SMTP_PORT}")
            with smtplib.SMTP(EmailService.SMTP_HOST, EmailService.SMTP_PORT) as server:
                if EmailService.SMTP_USER and EmailService.SMTP_PASSWORD:
                    server.login(EmailService.SMTP_USER, EmailService.SMTP_PASSWORD)
                logger.info(f"Sending email message to {to_email}")
                server.send_message(msg)
                logger.info(f"Successfully sent email to {to_email}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}", exc_info=True)
            return False
    
    @staticmethod
    def render_workspace_invitation_email(
        workspace_name: str,
        inviter_name: str,
        email: str,
        password: str,
        login_url: str = "http://localhost:3000/login"
    ) -> tuple[str, str]:
        """Render workspace invitation email template"""
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #000000;">Workspace Invitation</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #333333;">
                                Hello,
                            </p>
                            <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #333333;">
                                <strong>{inviter_name}</strong> has invited you to join the workspace <strong>"{workspace_name}"</strong> on ChatSimple.
                            </p>
                            
                            <!-- Credentials Box -->
                            <div style="background-color: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 6px; padding: 24px; margin: 24px 0;">
                                <p style="margin: 0 0 16px; font-size: 14px; font-weight: 600; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;">
                                    Your Account Credentials
                                </p>
                                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Email:</td>
                                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #000000; text-align: right;">{email}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-size: 14px; color: #666666;">Password:</td>
                                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #000000; text-align: right; font-family: monospace;">{password}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <p style="margin: 24px 0 32px; font-size: 14px; line-height: 20px; color: #666666;">
                                Please keep these credentials secure. You can change your password after logging in.
                            </p>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="text-align: center; padding: 0;">
                                        <a href="{login_url}" style="display: inline-block; padding: 12px 24px; background-color: #e16641; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                                            Sign In to Workspace
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 32px 0 0; font-size: 14px; line-height: 20px; color: #999999; text-align: center;">
                                Or copy and paste this URL into your browser:<br>
                                <a href="{login_url}" style="color: #e16641; text-decoration: none;">{login_url}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #f9f9f9; border-top: 1px solid #e5e5e5; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                                This invitation was sent by {inviter_name}. If you didn't expect this invitation, you can safely ignore this email.
                            </p>
                            <p style="margin: 16px 0 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                                © 2025 ChatSimple. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        
        text_content = f"""
Workspace Invitation

Hello,

{inviter_name} has invited you to join the workspace "{workspace_name}" on ChatSimple.

Your Account Credentials:
Email: {email}
Password: {password}

Please keep these credentials secure. You can change your password after logging in.

Sign in to your workspace: {login_url}

This invitation was sent by {inviter_name}. If you didn't expect this invitation, you can safely ignore this email.

© 2025 ChatSimple. All rights reserved.
"""
        
        return html_content, text_content


email_service = EmailService()

