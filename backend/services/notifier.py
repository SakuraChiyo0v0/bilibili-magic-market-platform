import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
from sqlalchemy.orm import Session
from models import SystemConfig

logger = logging.getLogger(__name__)

class NotifierService:
    def __init__(self, db: Session = None):
        self.db = db
        self._load_config()

    def _load_config(self):
        # Default from Env
        self.smtp_server = os.getenv("SMTP_SERVER", "smtp.qq.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "465"))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.smtp_from_name = os.getenv("SMTP_FROM_NAME", "MagicMarket")

        # Override from DB if available
        if self.db:
            def get_db_val(key):
                conf = self.db.query(SystemConfig).filter(SystemConfig.key == key).first()
                return conf.value if conf else None

            db_server = get_db_val("smtp_server")
            if db_server: self.smtp_server = db_server

            db_port = get_db_val("smtp_port")
            if db_port: self.smtp_port = int(db_port)

            db_user = get_db_val("smtp_user")
            if db_user: self.smtp_user = db_user

            db_pass = get_db_val("smtp_password")
            if db_pass: self.smtp_password = db_pass

            db_from = get_db_val("smtp_from_name")
            if db_from: self.smtp_from_name = db_from

    def send_email(self, to_email: str, subject: str, content: str):
        if not self.smtp_user or not self.smtp_password:
            logger.warning("SMTP not configured. Skipping email.")
            return False

        try:
            message = MIMEMultipart()
            # Use formataddr for standard RFC 5322 From header
            message['From'] = formataddr((Header(self.smtp_from_name, 'utf-8').encode(), self.smtp_user))
            message['To'] = Header(to_email, 'utf-8')
            message['Subject'] = Header(subject, 'utf-8')

            message.attach(MIMEText(content, 'html', 'utf-8'))

            # Connect to SMTP Server (SSL)
            logger.info(f"Connecting to SMTP server: {self.smtp_server}:{self.smtp_port} as {self.smtp_user}")
            server = smtplib.SMTP_SSL(self.smtp_server, self.smtp_port)
            server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.smtp_user, [to_email], message.as_string())
            server.quit()

            logger.info(f"📧 邮件发送成功: {to_email}")
            return True
        except Exception as e:
            logger.error(f"❌ 邮件发送失败: {e}", exc_info=True)
            return False
    def send_price_drop_notification(self, user_email: str, product_name: str, old_price: float, new_price: float, link: str, img_url: str):
        subject = f"📉 降价提醒：{product_name} 降至 ¥{new_price}"
        
        diff = old_price - new_price
        percent = (diff / old_price * 100) if old_price > 0 else 0
        
        content = f"""
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #FB7299;">Magic Market 降价提醒</h2>
            <p>您关注的商品有了新的低价！</p>
            
            <div style="display: flex; margin: 20px 0; background: #f9f9f9; padding: 15px; border-radius: 6px;">
                <img src="{img_url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; margin-right: 15px;">
                <div>
                    <h3 style="margin: 0 0 10px 0; font-size: 16px;">{product_name}</h3>
                    <p style="margin: 0; color: #999; text-decoration: line-through;">原价：¥{old_price}</p>
                    <p style="margin: 5px 0 0 0; color: #f5222d; font-size: 20px; font-weight: bold;">
                        现价：¥{new_price} 
                        <span style="font-size: 12px; background: #f5222d; color: white; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">
                            ↓ {percent:.1f}%
                        </span>
                    </p>
                </div>
            </div>
            
            <a href="{link}" style="display: block; width: 100%; text-align: center; background: #FB7299; color: white; padding: 12px 0; text-decoration: none; border-radius: 4px; font-weight: bold;">
                立即查看详情
            </a>
            
            <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
                此邮件由 Bilibili Magic Market 自动发送，请勿回复。
            </p>
        </div>
        """
        
        return self.send_email(user_email, subject, content)
